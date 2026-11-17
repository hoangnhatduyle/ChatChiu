-- ============================================================================
-- 0013 Boot snapshot + corrected dashboard summary (architecture.md §3.1/§3.4,
-- F-ST-05, AC-API-06). The old dashboard_summary() stays untouched for the old
-- app (it summed raw per-unit prices and used an absolute low-stock amount).
--
-- p_today is the caller's local date (the API passes "today" in her timezone,
-- CS-DAY-MATHS); it defaults to the database date.
-- ============================================================================

-- Summary with the old keys, camelCase, using the rules in packages/domain:
-- value = per-unit price × current (null reads as quantity), low stock by percent.
create function public.dashboard_summary_v2(p_today date default current_date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_today  date := coalesce(p_today, current_date);
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'dashboard_summary_v2 requires an authenticated user' using errcode = '28000';
  end if;

  with items as (
    select i.*,
           coalesce(i.current_quantity, i.quantity) as remaining,
           coalesce(i.initial_quantity, i.quantity) as full_amount,
           coalesce(i.low_stock_threshold, 20)      as threshold,
           coalesce(i.price, 0) * coalesce(i.current_quantity, i.quantity) as stock_value
    from public.inventory_items i
    where i.user_id = v_user
  ),
  rated as (
    select items.*, public.percent_left(remaining, full_amount) as pct from items
  ),
  low as (
    select * from rated where pct <= threshold order by pct asc, name asc limit 25
  ),
  expiring as (
    select * from rated
    where expiration_date between v_today and v_today + 7
    order by expiration_date asc, name asc
    limit 50
  ),
  -- The 30-day waste window is relative to now() (a rolling 30 × 24 h), as in the
  -- old dashboard_summary(); only the item dates use her local p_today.
  waste as (
    select count(*)::int as c, coalesce(sum(coalesce(price, 0) * quantity), 0) as v
    from public.wasted_items
    where user_id = v_user and wasted_date >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'totalItems',    (select count(*)::int from rated),
    'totalValue',    (select round(coalesce(sum(stock_value), 0), 2) from rated),
    'expiringCount', (select count(*)::int from rated where expiration_date between v_today and v_today + 7),
    'expiredCount',  (select count(*)::int from rated where expiration_date < v_today),
    'lowStockCount', (select count(*)::int from rated where pct <= threshold),
    'expiringSoon',  coalesce((select jsonb_agg(jsonb_build_object(
                        'id', id, 'name', name, 'expirationDate', expiration_date, 'quantity', quantity,
                        'unit', unit, 'categoryId', category_id, 'locationId', location_id)
                      order by expiration_date, name) from expiring), '[]'::jsonb),
    'lowStock',      coalesce((select jsonb_agg(jsonb_build_object(
                        'id', id, 'name', name, 'unit', unit, 'categoryId', category_id,
                        'currentQuantity', remaining, 'initialQuantity', full_amount,
                        'percentLeft', pct, 'lowStockThreshold', threshold)
                      order by pct, name) from low), '[]'::jsonb),
    'byCategory',    coalesce((select jsonb_agg(x order by (x ->> 'count')::int desc, x ->> 'category') from (
                        select jsonb_build_object('categoryId', c.id, 'category', c.name,
                                                  'count', count(*)::int, 'value', round(sum(r.stock_value), 2)) as x
                        from rated r join public.categories c on c.id = r.category_id
                        group by c.id, c.name) t), '[]'::jsonb),
    'byLocation',    coalesce((select jsonb_agg(x order by (x ->> 'count')::int desc, x ->> 'location') from (
                        select jsonb_build_object('locationId', l.id, 'location', coalesce(l.name, 'No location'),
                                                  'count', count(*)::int) as x
                        from rated r left join public.locations l on l.id = r.location_id
                        group by l.id, l.name) t), '[]'::jsonb),
    'waste30dCount', (select c from waste),
    'waste30dValue', (select round(v, 2) from waste)
  ) into v_result;

  return v_result;
end;
$$;

-- One round trip for GET /api/bootstrap: her items, locations, visible
-- categories (snake_case rows; the API camelises them) and the v2 summary.
-- Rows are returned as stored: null quantities are never rewritten (AC-DATA-05).
create function public.inventory_snapshot(p_today date default current_date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'inventory_snapshot requires an authenticated user' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.expiration_date, i.name)
                       from public.inventory_items i where i.user_id = v_user), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.name)
                           from public.locations l where l.user_id = v_user), '[]'::jsonb),
    -- RLS decides visibility (own rows, plus any is_system rows that still exist).
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.is_system desc, c.name)
                            from public.categories c), '[]'::jsonb),
    'summary', public.dashboard_summary_v2(p_today)
  );
end;
$$;

revoke all on function public.dashboard_summary_v2(date) from public, anon;
grant execute on function public.dashboard_summary_v2(date) to authenticated;
revoke all on function public.inventory_snapshot(date) from public, anon;
grant execute on function public.inventory_snapshot(date) to authenticated;
