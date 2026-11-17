-- Harness self-test plus existing schema behaviour the new app relies on.
begin;
\ir _helpers.psql
select plan(5);

select pg_temp.new_user('a@chatchiu.test') as a \gset
select ok(:'a'::uuid is not null, 'helper creates a user');
select pg_temp.new_category(:'a', 'Dairy') as cat \gset
insert into public.locations (user_id, name) values (:'a', 'Fridge') returning id as loc \gset
select pg_temp.new_item(:'a', :cat, 'Milk', 1, p_location => :loc) as milk \gset

select pg_temp.act_as(:'a');
select is(auth.uid(), :'a'::uuid, 'act_as sets auth.uid()');

delete from public.locations where id = :loc;
select is(
  (select location_id from public.inventory_items where id = :milk), null,
  'AC-DATA-13: deleting a location keeps its items with location_id null'
);
select is((select count(*)::int from public.inventory_items where id = :milk), 1, 'AC-DATA-13: the item still exists');

select throws_ok(
  format('delete from public.categories where id = %s', :cat), '23503', null,
  'AC-DATA-14: a category still used by items cannot be deleted (FK)'
);

select * from finish();
rollback;
