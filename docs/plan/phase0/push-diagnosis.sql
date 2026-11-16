-- Step 0.8: read-only diagnosis of the OLD app's push pipeline (D17).
-- Run in the Supabase dashboard SQL editor of the production project. SELECT only; changes nothing.
-- Prints no keys, endpoints paths or emails: only push-service hosts, counts, dates and a device hint.
with
subs as (
  select user_id,
         split_part(endpoint, '/', 3) as host,
         created_at,
         case
           when user_agent ilike '%iphone%' then 'iPhone'
           when user_agent ilike '%silk%' then 'Fire (Silk)'
           when user_agent ilike '%android%' then 'Android'
           when user_agent ilike '%mac os%' then 'Mac'
           when user_agent ilike '%windows%' then 'Windows'
           else coalesce(left(user_agent, 20), 'unknown')
         end as device
  from public.push_subscriptions
),
items as (
  select i.*,
         (i.expiration_date - (now() at time zone 'utc')::date) as days_left
  from public.inventory_items i
)
select 'A. subscription' as check, device || ' @ ' || host as detail,
       'created ' || to_char(created_at, 'YYYY-MM-DD HH24:MI') || ' UTC' as value
from subs
union all
select 'B. users with subscriptions', '', count(distinct user_id)::text from subs
union all
select 'C. items with notifications on', '', count(*)::text
from items where notification_enabled and expiration_date is not null
union all
select 'D. items ever notified (last_notified_at set)', '', count(*)::text
from items where last_notified_at is not null
union all
select 'E. most recent last_notified_at', '', coalesce(to_char(max(last_notified_at), 'YYYY-MM-DD HH24:MI') || ' UTC', 'never')
from items
union all
select 'F. due today by cron rules (0..days_before, notifications on)', '', count(*)::text
from items
where notification_enabled and expiration_date is not null
  and days_left between 0 and coalesce(notification_days_before, 3)
union all
select 'G. items that expired in last 60 days with notifications on (should have triggered)', '', count(*)::text
from items
where notification_enabled and expiration_date between (now() - interval '60 days')::date and now()::date
union all
select 'H. due items owned by a user who has a subscription', '', count(*)::text
from items
where notification_enabled and expiration_date is not null
  and days_left between 0 and coalesce(notification_days_before, 3)
  and user_id in (select user_id from subs)
order by 1, 2;
