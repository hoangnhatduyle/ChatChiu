-- ============================================================================
-- 0014 Consumption rate and predicted run-out (F-KB-10, F-ST-06, AC-API-16).
-- Same rule as packages/domain run-out.ts (AR-ONE-DEFINITION):
--   rate = amount used in the last 30 days / days from the first in-window
--          use to today (inclusive, at most 30), each use dated in p_tz
--   run_out = today + ceil(round(remaining / rate, 9)); null without a positive
--             rate or beyond 36 500 days
-- ============================================================================

-- Usage rows are read per user and recent first; per item and newest id first
-- (undo_item_usage's "is this the latest entry" check). Plain indexes on an
-- existing table are additive.
create index if not exists idx_usage_user_recorded on public.usage_history (user_id, recorded_at desc);
create index if not exists idx_usage_item_id_desc on public.usage_history (item_id, id desc);

-- One row per item of hers (or only p_item_id). A ratio over 100 years is
-- treated as "no prediction", like packages/domain (RUN_OUT_MAX_DAYS).
create function public.consumption_stats(
  p_today   date default current_date,
  p_tz      text default 'UTC',
  p_item_id bigint default null
)
returns table (item_id bigint, remaining numeric, avg_daily_use numeric, run_out_date date)
language sql
stable
set search_path = ''
as $$
  with params as (
    select coalesce(p_today, current_date) as today, coalesce(p_tz, 'UTC') as tz
  ),
  usage as (
    select h.item_id,
           h.amount_used,
           p.today - (h.recorded_at at time zone p.tz)::date as age
    from public.usage_history h, params p
    where h.user_id = auth.uid()
      and (p_item_id is null or h.item_id = p_item_id)
      -- sargable pre-filter with a day of margin either side for timezones
      and h.recorded_at >= ((p.today - 31)::timestamp at time zone p.tz)
      and h.recorded_at <  ((p.today + 2)::timestamp at time zone p.tz)
  ),
  windowed as (
    select item_id, sum(amount_used) as used, max(age) + 1 as span
    from usage
    where age >= 0 and age < 30
    group by item_id
  ),
  rates as (
    select i.id as item_id,
           coalesce(i.current_quantity, i.quantity) as remaining,
           w.used / w.span as rate
    from public.inventory_items i
    left join windowed w on w.item_id = i.id
    where i.user_id = auth.uid()
      and (p_item_id is null or i.id = p_item_id)
  ),
  ratios as (
    -- rounded to 9 decimals before ceil, exactly as packages/domain does
    select rates.*, case when rate > 0 then round(remaining / rate, 9) end as days_left
    from rates
  )
  select r.item_id,
         r.remaining,
         r.rate as avg_daily_use,
         case
           when r.rate is null or r.rate <= 0 then null
           when r.remaining <= 0 then p.today
           when r.days_left > 36500 then null
           else p.today + ceil(r.days_left)::int
         end as run_out_date
  from ratios r, params p
$$;

create function public.item_consumption(
  p_item_id bigint,
  p_today   date default current_date,
  p_tz      text default 'UTC'
)
returns table (item_id bigint, remaining numeric, avg_daily_use numeric, run_out_date date)
language sql
stable
set search_path = ''
as $$
  select * from public.consumption_stats(p_today, p_tz, p_item_id)
$$;

revoke all on function public.consumption_stats(date, text, bigint) from public, anon;
grant execute on function public.consumption_stats(date, text, bigint) to authenticated;
revoke all on function public.item_consumption(bigint, date, text) from public, anon;
grant execute on function public.item_consumption(bigint, date, text) to authenticated;
