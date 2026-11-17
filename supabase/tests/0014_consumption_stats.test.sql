begin;
\ir _helpers.psql
select plan(15);

select pg_temp.new_user('a@chatchiu.test') as a \gset
select pg_temp.new_user('b@chatchiu.test') as b \gset
select pg_temp.new_category(:'a', 'Pantry') as cat \gset
select pg_temp.new_item(:'a', :cat, 'Rice', 10, 10, 7) as rice \gset
select pg_temp.new_item(:'a', :cat, 'Tea', 1, 1, 1) as tea \gset
select pg_temp.new_item(:'a', :cat, 'Late', 4, 4, 2) as late \gset
-- 3 units over the 10 days today-9 … today (an entry 40 days ago is outside the window)
insert into public.usage_history (item_id, user_id, amount_used, remaining_amount, recorded_at) values
  (:rice, :'a', 1, 9, ((current_date - 9) + time '08:00') at time zone 'UTC'),
  (:rice, :'a', 1, 8, ((current_date - 6) + time '08:00') at time zone 'UTC'),
  (:rice, :'a', 1, 7, ((current_date - 1) + time '08:00') at time zone 'UTC'),
  (:rice, :'a', 5, 12, ((current_date - 40) + time '08:00') at time zone 'UTC'),
  -- 18:00 UTC yesterday is already today in Ho Chi Minh City (UTC+7)
  (:late, :'a', 2, 2, ((current_date - 1) + time '18:00') at time zone 'UTC');

select pg_temp.act_as(:'a');
select is(
  (select round(avg_daily_use, 6) from public.item_consumption(:rice, current_date, 'UTC')),
  0.3::numeric, 'F-KB-10: average daily use = used in window / days since first in-window use (3 / 10)'
);
select is(
  (select run_out_date from public.item_consumption(:rice, current_date, 'UTC')),
  current_date + 24, 'F-KB-10: run-out = today + ceil(7 / 0.3)'
);
select is(
  (select avg_daily_use from public.item_consumption(:tea, current_date, 'UTC')),
  null, 'no usage in the window → no rate'
);
select is(
  (select run_out_date from public.item_consumption(:tea, current_date, 'UTC')),
  null, 'no rate → no run-out date'
);
select is(
  (select avg_daily_use from public.item_consumption(:late, current_date, 'Asia/Ho_Chi_Minh')),
  2::numeric, 'each use is dated in her timezone (same-day use → rate 2/1)'
);
select is(
  (select avg_daily_use from public.item_consumption(:late, current_date, 'UTC')),
  1::numeric, 'in UTC the same use was yesterday (rate 2/2)'
);
select is(
  (select count(*)::int from public.consumption_stats(current_date, 'UTC')),
  3, 'consumption_stats returns one row per item of hers'
);

select pg_temp.act_as(:'b');
select is((select count(*)::int from public.consumption_stats(current_date, 'UTC')), 0, 'AC-DATA-06: B sees none of A''s consumption');

select pg_temp.as_admin();
select pg_temp.new_item(:'a', :cat, 'Edges', 10, 10, 6) as edges \gset
select pg_temp.new_item(:'a', :cat, 'Gone', 1, 1, 0) as gone \gset
insert into public.usage_history (item_id, user_id, amount_used, remaining_amount, recorded_at) values
  (:edges, :'a', 3, 6, ((current_date - 29) + time '12:00') at time zone 'UTC'),
  (:edges, :'a', 9, 6, ((current_date - 30) + time '12:00') at time zone 'UTC'),
  (:edges, :'a', 9, 6, ((current_date + 1) + time '12:00') at time zone 'UTC'),
  (:gone, :'a', 1, 0, ((current_date - 1) + time '12:00') at time zone 'UTC');
select pg_temp.act_as(:'a');
select is((select avg_daily_use from public.item_consumption(:edges, current_date, 'UTC')), 0.1::numeric,
  'a use aged 29 days is in the window, 30 days and future uses are out (3 / 30)');
select is((select run_out_date from public.item_consumption(:edges, current_date, 'UTC')), current_date + 60,
  '6 / 0.1 = 60 days exactly (no float extra day)');
select is((select run_out_date from public.item_consumption(:gone, current_date, 'UTC')), current_date,
  'remaining 0 with a positive rate runs out today');
select is((select avg_daily_use from public.item_consumption(:rice, current_date, null)),
          (select avg_daily_use from public.item_consumption(:rice, current_date, 'UTC')),
  'a null timezone reads as UTC');
select throws_ok($$select * from public.consumption_stats(current_date, 'Mars/Base')$$, '22023', null, 'an unknown timezone is an error');
select pg_temp.as_admin();
update public.inventory_items set current_quantity = 500 where id = :edges;
delete from public.usage_history where item_id = :edges;
insert into public.usage_history (item_id, user_id, amount_used, remaining_amount, recorded_at)
values (:edges, :'a', 0.0009, 500, now());
select pg_temp.act_as(:'a');
select is((select run_out_date from public.item_consumption(:edges, current_date, 'UTC')), null,
  'a run-out beyond 36 500 days is no prediction (no date overflow)');
select is((select count(*)::int from public.consumption_stats(current_date, 'UTC', :rice)), 1,
  'consumption_stats can be narrowed to one item');

select * from finish();
rollback;
