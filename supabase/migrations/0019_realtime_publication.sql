-- ============================================================================
-- 0019 Live sync between devices (roadmap step 4.6, SPEC-KB-001 F-KB-16, architecture §3 "Live sync").
-- Supabase Realtime sends row changes only for tables in the supabase_realtime publication. The
-- web app listens to the three tables the board, the shopping list and the meal plan are built
-- from; Realtime applies RLS, so a device only ever receives its own account's rows.
-- Additive only (AR-ADDITIVE-ONLY): adding a table to a publication changes no row and no query,
-- and the old app does not listen. Safe to run twice. A database without the publication (plain
-- Postgres) is left alone.
-- ============================================================================
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime does not exist; nothing to do';
    return;
  end if;
  foreach t in array array['inventory_items', 'shopping_list', 'meal_plans'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
