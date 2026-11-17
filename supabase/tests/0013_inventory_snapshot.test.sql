begin;
\ir _helpers.psql
select plan(19);

select pg_temp.new_user('a@chatchiu.test') as a \gset
select pg_temp.new_user('b@chatchiu.test') as b \gset
select pg_temp.new_category(:'a', 'Dairy') as cat \gset
select pg_temp.new_category(:'b', 'Dairy') as catb \gset
insert into public.locations (user_id, name) values (:'a', 'Fridge') returning id as loc \gset
-- low (15 % of 20), value 2 × 0.15 = 0.30, expiring in 2 days
select pg_temp.new_item(:'a', :cat, 'Milk', 1, 1, 0.15, 20, 2, current_date + 2, :loc) as milk \gset
-- low by percent: 5 of 100 g
select pg_temp.new_item(:'a', :cat, 'Flour', 100, 100, 5, 20, 0.01) as flour \gset
-- same absolute amount but 5 of 5 g: not low
select pg_temp.new_item(:'a', :cat, 'Salt', 5, 5, 5, 20) as salt \gset
-- old row: null initial/current, 2 × 1.5 = 3.00, expired yesterday
select pg_temp.new_item(:'a', :cat, 'Old row', 2, null, null, 20, 1.5, current_date - 1) as oldrow \gset
-- boundary: exactly 7 % at threshold 7 is low (domain parity)
select pg_temp.new_item(:'a', :cat, 'Edge', 1, 1, 0.07, 7, 0) as edge \gset
select pg_temp.new_item(:'b', :catb, 'B milk', 1, 1, 0.1, 20, 9) as bmilk \gset
insert into public.wasted_items (user_id, item_name, category_id, quantity, unit, price)
values (:'a', 'Eggs', :cat, 6, 'piece', 0.40), (:'a', 'Cheese', :cat, 1, 'piece', 3.00),
       (:'b', 'B waste', :catb, 100, 'piece', 1);

select pg_temp.act_as(:'a');
select public.dashboard_summary_v2(current_date) as s \gset

select is((:'s'::jsonb ->> 'totalItems')::int, 5, 'AC-API-06: totalItems counts only her items');
select is((:'s'::jsonb ->> 'totalValue')::numeric, 3.35::numeric, 'F-ST-05: totalValue = Σ price × current (0.30 + 0.05 + 3.00)');
select is((:'s'::jsonb ->> 'lowStockCount')::int, 3, 'AC-DATA-04: percent-based low stock count (Milk, Flour, Edge)');
select is(
  (select array_agg((x ->> 'id')::bigint order by (x ->> 'id')::bigint) from jsonb_array_elements(:'s'::jsonb -> 'lowStock') x),
  array[:milk, :flour, :edge]::bigint[],
  'AC-DATA-04: 15 % and 5 of 100 g are low; 5 of 5 g is not; exactly 7 % at 7 is low'
);
select is(
  (select (x ->> 'percentLeft')::numeric from jsonb_array_elements(:'s'::jsonb -> 'lowStock') x where (x ->> 'id')::bigint = :milk),
  15::numeric, 'lowStock rows carry percentLeft'
);
select is((:'s'::jsonb ->> 'expiredCount')::int, 1, 'expiredCount');
select is((:'s'::jsonb ->> 'expiringCount')::int, 1, 'expiringCount (today … +7 days)');
select is((:'s'::jsonb ->> 'waste30dCount')::int, 2, 'waste30dCount is hers only');
select is((:'s'::jsonb ->> 'waste30dValue')::numeric, 5.40::numeric, 'F-ST-03: waste value = Σ price × quantity (6 × 0.40 + 1 × 3.00)');

select public.inventory_snapshot(current_date) as snap \gset
select is(jsonb_array_length(:'snap'::jsonb -> 'items'), 5, 'AC-API-06: snapshot carries her items');
select is(jsonb_array_length(:'snap'::jsonb -> 'locations'), 1, 'AC-API-06: snapshot carries her locations');
select ok(
  exists (select 1 from jsonb_array_elements(:'snap'::jsonb -> 'categories') c where (c ->> 'id')::bigint = :cat),
  'AC-API-06: snapshot carries her categories'
);
select is((:'snap'::jsonb -> 'summary' ->> 'totalItems')::int, 5, 'AC-API-06: snapshot embeds the v2 summary');
select ok(
  (select initial_quantity is null and current_quantity is null from public.inventory_items where id = :oldrow),
  'AC-DATA-05: reading an old row does not rewrite it'
);

select pg_temp.act_as(:'b');
select is(jsonb_array_length(public.inventory_snapshot(current_date) -> 'items'), 1, 'AC-DATA-06: B''s snapshot holds only B''s item');

select pg_temp.as_admin();
select is(
  (select md5(prosrc) from pg_proc where proname = 'dashboard_summary' and pronamespace = 'public'::regnamespace),
  'a544adf3882c7d6c0898d746d98232ad', 'AC-DATA-02: the old dashboard_summary() is unchanged'
);
select throws_ok('select public.dashboard_summary_v2(current_date)', '28000', null, 'requires an authenticated user');

select pg_temp.new_item(:'a', :cat, 'Day 7', 1, 1, 1, 20, null, current_date + 7) as d7 \gset
select pg_temp.new_item(:'a', :cat, 'Day 8', 1, 1, 1, 20, null, current_date + 8) as d8 \gset
select pg_temp.act_as(:'a');
select is((public.dashboard_summary_v2(current_date) ->> 'expiringCount')::int, 2, 'expiring includes today + 7 but not today + 8');
select is((public.dashboard_summary_v2(current_date) ->> 'totalValue')::numeric, 3.35::numeric, 'items with a null price add nothing to the value');

select * from finish();
rollback;
