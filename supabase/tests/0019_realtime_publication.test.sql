begin;
\ir _helpers.psql
select plan(6);

select ok(exists (select 1 from pg_publication where pubname = 'supabase_realtime'), 'the supabase_realtime publication exists');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_items'), 'F-KB-16: inventory_items is published');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_list'), 'F-KB-16: shopping_list is published');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meal_plans'), 'F-KB-16: meal_plans is published');
-- nothing else of hers is sent: the tables with credentials or tokens stay out
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('idempotency_keys', 'push_subscriptions')), 0, 'private tables are not published');
-- nothing else in public may be published unnoticed: a later migration must change this list on purpose
select is((select array_agg(tablename::text order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'), array['inventory_items', 'meal_plans', 'shopping_list'], 'only the three tables are published from public');

select * from finish();
rollback;
