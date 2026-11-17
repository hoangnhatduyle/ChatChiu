begin;
\ir _helpers.psql
select plan(26);

select pg_temp.new_user('a@chatchiu.test') as a \gset
select pg_temp.new_user('b@chatchiu.test') as b \gset
select pg_temp.new_category(:'a', 'Dairy') as cat \gset
select pg_temp.new_item(:'a', :cat, 'Milk', 1, 1, 0.6, 20) as milk \gset
select pg_temp.new_item(:'a', :cat, 'Old row', 2) as oldrow \gset

select pg_temp.act_as(:'a');
select public.log_item_usage(:milk, 0.1, 'lunch') as r1 \gset

select is((:'r1'::jsonb -> 'usage' ->> 'amount_used')::numeric, 0.5::numeric, 'AC-DATA-08: amount_used = previous − new (0.6 → 0.1)');
select is((:'r1'::jsonb -> 'usage' ->> 'remaining_amount')::numeric, 0.1::numeric, 'AC-DATA-08: remaining_amount is the new current');
select is(:'r1'::jsonb -> 'usage' ->> 'notes', 'lunch', 'AC-DATA-08: the note is stored');
select is((select current_quantity from public.inventory_items where id = :milk), 0.1::numeric, 'AC-DATA-08: current_quantity updated in the same call');
select is((:'r1'::jsonb ->> 'crossed_low_stock')::boolean, true, 'AC-DATA-08: crossed_low_stock is true (60 % → 10 %, threshold 20)');
select is((:'r1'::jsonb -> 'item' ->> 'current_quantity')::numeric, 0.1::numeric, 'AC-DATA-08: the updated item is returned');
select is((select count(*)::int from public.usage_history where item_id = :milk), 1, 'AC-DATA-08: exactly one history row');

select public.log_item_usage(:milk, 0.05, null) as r2 \gset
select is((:'r2'::jsonb ->> 'crossed_low_stock')::boolean, false, 'already low: a further drop does not cross again');

select public.undo_item_usage((:'r2'::jsonb -> 'usage' ->> 'id')::bigint) as undone \gset
select is((select current_quantity from public.inventory_items where id = :milk), 0.1::numeric, 'AC-DATA-09: undo restores the previous current_quantity');
select is((select count(*)::int from public.usage_history where id = (:'r2'::jsonb -> 'usage' ->> 'id')::bigint), 0, 'AC-DATA-09: undo deletes that history row');
select throws_ok(
  format('select public.undo_item_usage(%s)', (:'r2'::jsonb -> 'usage' ->> 'id')),
  'P0002', null, 'usage_entry UNDONE → LOGGED is impossible: a second undo of the same id is not found'
);

select public.log_item_usage(:milk, 0.08, null) as r3 \gset
select throws_ok(
  format('select public.undo_item_usage(%s)', (:'r1'::jsonb -> 'usage' ->> 'id')),
  '55000', null, 'undo of an entry that is no longer the latest is refused (would clobber later changes)'
);

select public.log_item_usage(:oldrow, 1.5, null) as r4 \gset
select is((:'r4'::jsonb -> 'usage' ->> 'amount_used')::numeric, 0.5::numeric, 'AC-DATA-05: a null current_quantity reads as quantity (2 → 1.5 uses 0.5)');

select throws_ok(format('select public.log_item_usage(%s, -1, null)', :milk), '22023', null, 'a negative quantity is rejected');

select pg_temp.act_as(:'b');
select throws_ok(format('select public.log_item_usage(%s, 0, null)', :milk), 'P0002', null, 'AC-DATA-06: B cannot log usage on A''s item');
select throws_ok(
  format('select public.undo_item_usage(%s)', (:'r3'::jsonb -> 'usage' ->> 'id')),
  'P0002', null, 'AC-DATA-06: B cannot undo A''s usage'
);
select pg_temp.as_admin();
select is((select current_quantity from public.inventory_items where id = :milk), 0.08::numeric, 'AC-DATA-06: A''s item is unchanged by B');

-- review gaps
select pg_temp.act_as(:'a');
select throws_ok(format('select public.log_item_usage(%s, 0.5, null)', :milk), '22023', null, 'a usage cannot raise the amount left (0.08 → 0.5); raising is an edit or restock');
select throws_ok(format('select public.log_item_usage(%s, null, null)', :milk), '22023', null, 'a null quantity is rejected');
select throws_ok(format('select public.log_item_usage(%s, 0.01, repeat(''x'', 501))', :milk), '22023', null, 'notes longer than 500 characters are rejected');
-- an external edit after the usage makes it no longer undoable
select public.log_item_usage(:milk, 0.05, null) as r5 \gset
update public.inventory_items set current_quantity = 0.2 where id = :milk;
select throws_ok(format('select public.undo_item_usage(%s)', (:'r5'::jsonb -> 'usage' ->> 'id')), '55000', null, 'undo is refused when the item changed since (no later usage row)');
-- "latest" is by id, not by recorded_at (transaction start time can be out of order)
select pg_temp.as_admin();
select pg_temp.new_item(:'a', :cat, 'Order', 1, 1, 0.5, 20) as ord \gset
insert into public.usage_history (item_id, user_id, amount_used, remaining_amount, recorded_at)
values (:ord, :'a', 0.2, 0.7, now()) returning id as u1 \gset
insert into public.usage_history (item_id, user_id, amount_used, remaining_amount, recorded_at)
values (:ord, :'a', 0.2, 0.5, now() - interval '1 minute') returning id as u2 \gset
select pg_temp.act_as(:'a');
select lives_ok(format('select public.undo_item_usage(%s)', :u2), 'the highest id is the latest entry even with an older recorded_at');
select is((select current_quantity from public.inventory_items where id = :ord), 0.7::numeric, 'undo by id restored 0.7');
-- undo back above the threshold clears the low-stock marker (AC-API-19)
select pg_temp.as_admin();
select pg_temp.new_item(:'a', :cat, 'Alerted', 1, 1, 0.6, 20) as al \gset
select pg_temp.act_as(:'a');
select public.log_item_usage(:al, 0.1, null) as r6 \gset
update public.inventory_items set low_stock_notified_at = now() where id = :al;
select public.undo_item_usage((:'r6'::jsonb -> 'usage' ->> 'id')::bigint) as u6 \gset
select is((select low_stock_notified_at from public.inventory_items where id = :al), null, 'undo above the threshold clears low_stock_notified_at');
select is(public.percent_left(1, 0), 0::numeric, 'percent_left: a zero full amount is 0 %');
select is(public.percent_left(0.07, 1), 7::numeric, 'percent_left: 0.07 of 1 is exactly 7 % (domain parity)');

select * from finish();
rollback;
