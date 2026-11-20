begin;
\ir _helpers.psql
select plan(9);

select pg_temp.new_user('a@chatchiu.test') as a \gset
select pg_temp.new_user('b@chatchiu.test') as b \gset

select has_column('public', 'locations', 'icon', 'locations has an icon column');
select has_column('public', 'locations', 'color', 'locations has a color column');
select col_is_null('public', 'locations', 'icon', 'icon is nullable (old rows and old clients keep working)');
select col_is_null('public', 'locations', 'color', 'color is nullable');

-- an insert written before 0021 (no icon, no color) still works and reads back null
select pg_temp.act_as(:'a');
insert into public.locations (user_id, name) values (:'a', 'Fridge');
select is((select icon || color from public.locations where name = 'Fridge'), null, 'an old-style insert leaves both null');

insert into public.locations (user_id, name, icon, color) values (:'a', 'Freezer', 'snowflake', 'teal');
select is((select icon || ':' || color from public.locations where name = 'Freezer'), 'snowflake:teal', 'icon and color round trip');

-- RLS: another owner sees none of it and cannot change it
select pg_temp.act_as(:'b');
select is((select count(*)::int from public.locations), 0, 'another user cannot read her locations');
update public.locations set icon = 'box' where name = 'Freezer';
select pg_temp.as_admin();
select is((select icon from public.locations where name = 'Freezer'), 'snowflake', 'another user cannot change her icon');

-- the snapshot carries the new columns (to_jsonb(l))
select pg_temp.act_as(:'a');
select is((select (public.inventory_snapshot() -> 'locations' -> 0 ->> 'icon')), 'snowflake', 'inventory_snapshot carries icon');

select * from finish();
rollback;
