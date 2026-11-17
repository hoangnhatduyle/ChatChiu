-- ============================================================================
-- 0012 Atomic usage logging + undo (architecture.md §3.4, SPEC-DATA-001
-- AC-DATA-08/09). The old /usage route inserted the history row and then
-- updated current_quantity in a second call that could fail silently.
--
-- Additive only (AR-ADDITIVE-ONLY): new functions; nothing existing changes.
-- SECURITY INVOKER (the default): RLS applies, so a caller only ever touches
-- her own rows (NC-DATA-RLS).
-- ============================================================================

-- Percent of the full amount left, 0–100, rounded to 6 decimals.
-- Mirrors packages/domain percentOf() (AR-ONE-DEFINITION); a full amount <= 0 reads as 0 %.
create function public.percent_left(p_remaining numeric, p_full numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_full is null or p_full <= 0 then 0::numeric
    else least(100::numeric, greatest(0::numeric, round(coalesce(p_remaining, 0) / p_full * 100, 6)))
  end
$$;

-- Log a usage: writes the usage_history row AND the new current_quantity in one
-- transaction. amount_used = previous − new, from the locked row (the old
-- client computed the same value from its possibly stale copy). A new amount
-- above the previous one is not a usage and is refused, as the old client did
-- (amountUsed < 0); raising an amount is an edit or a restock.
-- Returns { usage, item, crossed_low_stock } (snake_case rows; the API camelises).
create function public.log_item_usage(
  p_item_id     bigint,
  p_new_current numeric,
  p_notes       text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_item      public.inventory_items;
  v_usage     public.usage_history;
  v_before    numeric;
  v_full      numeric;
  v_threshold numeric;
begin
  if v_user is null then
    raise exception 'log_item_usage requires an authenticated user' using errcode = '28000';
  end if;
  if p_new_current is null or p_new_current < 0 then
    raise exception 'new quantity must be zero or more' using errcode = '22023';
  end if;
  if length(p_notes) > 500 then
    raise exception 'notes must be at most 500 characters' using errcode = '22023';
  end if;

  select * into v_item
  from public.inventory_items
  where id = p_item_id and user_id = v_user
  for update;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;

  v_before    := coalesce(v_item.current_quantity, v_item.quantity);
  v_full      := coalesce(v_item.initial_quantity, v_item.quantity);
  v_threshold := coalesce(v_item.low_stock_threshold, 20);

  if p_new_current > v_before then
    raise exception 'a usage cannot increase the amount left' using errcode = '22023';
  end if;

  insert into public.usage_history (item_id, user_id, amount_used, remaining_amount, notes)
  values (p_item_id, v_user, v_before - p_new_current, p_new_current, p_notes)
  returning * into v_usage;

  update public.inventory_items
  set current_quantity = p_new_current
  where id = p_item_id and user_id = v_user
  returning * into v_item;

  return jsonb_build_object(
    'usage', to_jsonb(v_usage),
    'item', to_jsonb(v_item),
    'crossed_low_stock',
      public.percent_left(v_before, v_full) > v_threshold
      and public.percent_left(p_new_current, v_full) <= v_threshold
  );
end;
$$;

-- Undo a usage: deletes that history row and restores the quantity it replaced
-- (remaining_amount + amount_used). Refused with 55000 when the row is no longer
-- the item's latest entry or the item changed since, so an undo never clobbers
-- a later change. "Latest" is by id: ids are assigned in commit order under the
-- item lock, while recorded_at is the transaction start time.
-- Locks the item before the usage row, the same order as log_item_usage and the
-- item deletes (which cascade to usage_history), so they cannot deadlock.
-- Clears low_stock_notified_at when the restored amount is back above the
-- threshold, so a later drop can alert again (AC-API-19). Returns the item.
-- (low_stock_notified_at is added in 0016; PL/pgSQL resolves it at run time and
-- 0012–0017 are always applied together.)
create function public.undo_item_usage(p_usage_id bigint)
returns public.inventory_items
language plpgsql
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_usage public.usage_history;
  v_item  public.inventory_items;
begin
  if v_user is null then
    raise exception 'undo_item_usage requires an authenticated user' using errcode = '28000';
  end if;

  select * into v_item
  from public.inventory_items
  where id = (select h.item_id from public.usage_history h where h.id = p_usage_id and h.user_id = v_user)
    and user_id = v_user
  for update;
  if not found then
    raise exception 'Usage entry not found' using errcode = 'P0002';
  end if;

  select * into v_usage
  from public.usage_history
  where id = p_usage_id and user_id = v_user
  for update;
  if not found then
    raise exception 'Usage entry not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.usage_history h
    where h.item_id = v_usage.item_id and h.id > v_usage.id
  ) or coalesce(v_item.current_quantity, v_item.quantity) is distinct from v_usage.remaining_amount then
    raise exception 'This usage can no longer be undone' using errcode = '55000';
  end if;

  delete from public.usage_history where id = p_usage_id and user_id = v_user;

  update public.inventory_items
  set current_quantity = v_usage.remaining_amount + v_usage.amount_used,
      low_stock_notified_at = case
        when public.percent_left(v_usage.remaining_amount + v_usage.amount_used,
                                 coalesce(v_item.initial_quantity, v_item.quantity))
             > coalesce(v_item.low_stock_threshold, 20)
        then null
        else v_item.low_stock_notified_at
      end
  where id = v_usage.item_id and user_id = v_user
  returning * into v_item;

  return v_item;
end;
$$;

revoke all on function public.percent_left(numeric, numeric) from public, anon;
grant execute on function public.percent_left(numeric, numeric) to authenticated, service_role;
revoke all on function public.log_item_usage(bigint, numeric, text) from public, anon;
grant execute on function public.log_item_usage(bigint, numeric, text) to authenticated;
revoke all on function public.undo_item_usage(bigint) from public, anon;
grant execute on function public.undo_item_usage(bigint) to authenticated;
