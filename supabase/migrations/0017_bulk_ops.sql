-- ============================================================================
-- 0017 Bulk operations, each one statement so all rows succeed or none do
-- (CS-SQL-RPC, AC-DATA-15/17; F-RS-09, F-IN-10, F-SL-04).
-- ============================================================================

-- Largest batch any bulk function accepts (the API caps lower, BULK_MAX).
-- Create many items (receipt scan). p_items is a JSON array of snake_case
-- inventory_items fields; user_id is always the caller. Missing optional fields
-- get the same defaults as a single insert. Every category must be visible to
-- her and every location hers: FK checks bypass RLS, so without this a batch
-- could reference (and probe for) another user's rows.
create function public.create_items(p_items jsonb)
returns setof public.inventory_items
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'create_items requires an authenticated user' using errcode = '28000';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'at most 500 items per call' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(category_id bigint, location_id bigint)
    where (x.category_id is not null
           and not exists (select 1 from public.categories c where c.id = x.category_id))
       or (x.location_id is not null
           and not exists (select 1 from public.locations l where l.id = x.location_id and l.user_id = v_user))
  ) then
    raise exception 'unknown category or location' using errcode = '23503';
  end if;

  return query
  insert into public.inventory_items (
    user_id, name, category_id, quantity, unit, purchase_date, expiration_date, location_id,
    price, notes, notification_enabled, notification_days_before, barcode,
    initial_quantity, current_quantity, low_stock_threshold
  )
  select v_user, x.name, x.category_id, coalesce(x.quantity, 0), x.unit, x.purchase_date,
         x.expiration_date, x.location_id, x.price, x.notes,
         coalesce(x.notification_enabled, true), coalesce(x.notification_days_before, 3), x.barcode,
         x.initial_quantity, x.current_quantity, coalesce(x.low_stock_threshold, 20)
  from jsonb_to_recordset(p_items) as x(
    name text, category_id bigint, quantity numeric, unit text, purchase_date date,
    expiration_date date, location_id bigint, price numeric, notes text,
    notification_enabled boolean, notification_days_before integer, barcode text,
    initial_quantity numeric, current_quantity numeric, low_stock_threshold numeric
  )
  returning *;
end;
$$;

-- Delete many of her items; returns how many were deleted.
create function public.delete_items(p_ids bigint[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if cardinality(p_ids) > 500 then
    raise exception 'at most 500 ids per call' using errcode = '22023';
  end if;
  with gone as (
    delete from public.inventory_items
    where user_id = auth.uid() and id = any(p_ids)
    returning 1
  )
  select count(*)::int into v_count from gone;
  return v_count;
end;
$$;

-- Delete only the ids she saw purchased when she tapped Clear purchased, and
-- only if they are still purchased (decided 2026-11-16; AC-DATA-15, AC-API-11).
create function public.clear_purchased(p_ids bigint[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if cardinality(p_ids) > 500 then
    raise exception 'at most 500 ids per call' using errcode = '22023';
  end if;
  with gone as (
    delete from public.shopping_list
    where user_id = auth.uid() and is_purchased and id = any(p_ids)
    returning 1
  )
  select count(*)::int into v_count from gone;
  return v_count;
end;
$$;

revoke all on function public.create_items(jsonb) from public, anon;
grant execute on function public.create_items(jsonb) to authenticated;
revoke all on function public.delete_items(bigint[]) from public, anon;
grant execute on function public.delete_items(bigint[]) to authenticated;
revoke all on function public.clear_purchased(bigint[]) from public, anon;
grant execute on function public.clear_purchased(bigint[]) to authenticated;
