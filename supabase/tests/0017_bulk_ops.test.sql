begin;
\ir _helpers.psql
select plan(17);

select pg_temp.new_user('a@chatchiu.test') as a \gset
select pg_temp.new_user('b@chatchiu.test') as b \gset
select pg_temp.new_category(:'a', 'Dairy') as cat \gset
select pg_temp.new_category(:'b', 'Dairy') as catb \gset
select pg_temp.new_item(:'b', :catb, 'B item', 1) as bitem \gset

select pg_temp.act_as(:'a');
select count(*) as created from public.create_items(jsonb_build_array(
  jsonb_build_object('name', 'Eggs', 'category_id', :cat, 'quantity', 10, 'unit', 'piece', 'expiration_date', current_date + 14, 'price', 0.4),
  jsonb_build_object('name', 'Milk', 'category_id', :cat, 'quantity', 1, 'unit', 'L', 'expiration_date', current_date + 5),
  jsonb_build_object('name', 'Butter', 'category_id', :cat, 'quantity', 250, 'unit', 'g', 'expiration_date', current_date + 30)
)) \gset
select is(:created::int, 3, 'AC-DATA-17: create_items creates N rows');
select is((select count(*)::int from public.inventory_items where user_id = :'a'), 3, 'AC-DATA-17: all N are hers');
select results_eq(
  $$select notification_enabled, notification_days_before, low_stock_threshold::int from public.inventory_items where name = 'Milk'$$,
  $$values (true, 3, 20)$$, 'create_items applies the same column defaults as a single insert'
);
select throws_ok(
  format($$select * from public.create_items(jsonb_build_array(
    jsonb_build_object('name', 'Ok', 'category_id', %s, 'quantity', 1, 'unit', 'piece', 'expiration_date', current_date),
    jsonb_build_object('category_id', %s, 'quantity', 1, 'unit', 'piece', 'expiration_date', current_date)))$$, :cat, :cat),
  '23502', null, 'AC-DATA-17: one invalid item rejects the call'
);
select is((select count(*)::int from public.inventory_items where user_id = :'a'), 3, 'AC-DATA-17: … and none of that call''s items are created');

select is(
  public.delete_items((select array_agg(id) from public.inventory_items where name in ('Eggs', 'Milk')) || :bitem::bigint),
  2, 'AC-DATA-17: delete_items deletes her matching items and returns the count'
);
select pg_temp.as_admin();
select is((select count(*)::int from public.inventory_items where id = :bitem), 1, 'AC-DATA-06: B''s item survives A''s bulk delete');

insert into public.shopping_list (user_id, name, is_purchased) values
  (:'a', 'P1', true), (:'a', 'P2', true), (:'a', 'P3', true),
  (:'a', 'Q1', false), (:'a', 'Q2', false),
  (:'a', 'D', true),        -- ticked after the tap: not in ids
  (:'a', 'P4', false),      -- in ids but unticked meanwhile
  (:'b', 'Bp', true);       -- another user's purchased row, smuggled into ids
select pg_temp.act_as(:'a');
select is(
  public.clear_purchased((select array_agg(id) from public.shopping_list where name in ('P1', 'P2', 'P3', 'P4', 'Bp'))),
  3, 'AC-DATA-15: clear_purchased deletes only her rows in ids that are still purchased'
);
select set_eq(
  $$select name from public.shopping_list$$, array['Q1', 'Q2', 'D', 'P4'],
  'AC-DATA-15: pending rows, the later-ticked row and the unticked row remain'
);
select pg_temp.as_admin();
select is((select count(*)::int from public.shopping_list where name = 'Bp'), 1, 'AC-DATA-06: B''s purchased row survives');

select is(
  (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
     and proname in ('log_item_usage', 'undo_item_usage', 'dashboard_summary_v2', 'inventory_snapshot',
                     'item_consumption', 'consumption_stats', 'ensure_recipe', 'create_items',
                     'delete_items', 'clear_purchased', 'percent_left')),
  0, 'NC-DATA-RLS: every new function is security invoker'
);
select is(
  (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('log_item_usage', 'undo_item_usage', 'dashboard_summary_v2', 'inventory_snapshot',
                       'item_consumption', 'consumption_stats', 'ensure_recipe', 'create_items',
                       'delete_items', 'clear_purchased', 'percent_left')
     and has_function_privilege('anon', p.oid, 'execute')),
  0, 'anon cannot execute the new functions'
);
select is(
  (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('log_item_usage', 'undo_item_usage', 'dashboard_summary_v2', 'inventory_snapshot',
                       'item_consumption', 'consumption_stats', 'ensure_recipe', 'create_items',
                       'delete_items', 'clear_purchased')
     and has_function_privilege('authenticated', p.oid, 'execute')),
  10, 'authenticated can execute the new functions'
);

select pg_temp.act_as(:'b');
select throws_ok(
  format($$select * from public.create_items(jsonb_build_array(jsonb_build_object('name', 'X', 'category_id', %s, 'quantity', 1, 'unit', 'piece', 'expiration_date', current_date)))$$, :cat),
  '23503', null, 'AC-DATA-06: B cannot create items in A''s category');
insert into public.locations (user_id, name) values (:'b', 'B shelf');
select pg_temp.as_admin();
insert into public.locations (user_id, name) values (:'a', 'A shelf') returning id as aloc \gset
select pg_temp.act_as(:'b');
select throws_ok(
  format($$select * from public.create_items(jsonb_build_array(jsonb_build_object('name', 'X', 'category_id', %s, 'quantity', 1, 'unit', 'piece', 'expiration_date', current_date, 'location_id', %s)))$$, :catb, :aloc),
  '23503', null, 'AC-DATA-06: B cannot put items in A''s location');
select throws_ok(
  format($$select * from public.create_items((select jsonb_agg(jsonb_build_object('name', 'X', 'category_id', %s, 'quantity', 1, 'unit', 'piece', 'expiration_date', current_date)) from generate_series(1, 501)))$$, :catb),
  '22023', null, 'create_items accepts at most 500 items');
select throws_ok($$select public.clear_purchased((select array_agg(g)::bigint[] from generate_series(1, 501) g))$$, '22023', null, 'clear_purchased accepts at most 500 ids');

select * from finish();
rollback;
