-- ============================================================================
-- 0100 Security hardening, to apply AFTER cutover (roadmap step 6.5, rows 7.0.13 b/c and the 6.5 security review).
--
-- Why this is not in supabase/migrations/: while the old app is live on the same database, migrations from 0012 on
-- must be additive only (AR-ADDITIVE-ONLY, scripts/check-additive-migrations.mjs). This file changes old policies,
-- revokes old privileges and adds a trigger and a constraint to old tables, so it waits for cutover step 2's successor
-- (the old app is retired). It is safe to run twice. Run it with `node scripts/apply-post-cutover.mjs` against the
-- LOCAL stack (the integration tests do, so every API and RLS test runs against the hardened database); on production
-- it is run by hand, with the owner's go-ahead, after a backup.
--
-- What it closes:
--  1. Cross-tenant references. A foreign key is checked without RLS, and the owner policies only tested user_id, so a
--     user could point her rows at another user's category, location, item or recipe: pin them (the owner's delete of a
--     category "in use" then fails) and probe which ids exist. The INSERT/UPDATE policies now also require that every
--     row a new row points at is visible to the caller (the policy subqueries run under the caller's own RLS).
--  2. Privileges. anon needs no access to the app's tables, and nobody needs TRUNCATE (it ignores RLS), TRIGGER or
--     REFERENCES: Supabase grants them by default.
--  3. Functions without a pinned search_path, and a PUBLIC execute grant on four of them.
--  4. push_subscriptions: the endpoint must be a known push service (a user can write the table straight through
--     PostgREST, bypassing the API's check), and one user may hold at most 20 devices.
-- ============================================================================

-- 1. Cross-tenant references --------------------------------------------------

begin;
-- Give up rather than queue behind a long transaction of the old app while holding table locks (rerun it at a quiet time).
set local lock_timeout = '3s';

drop policy if exists inventory_owner_insert on public.inventory_items;
create policy inventory_owner_insert on public.inventory_items for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.categories c where c.id = category_id)
  and (location_id is null or exists (select 1 from public.locations l where l.id = location_id))
);
drop policy if exists inventory_owner_update on public.inventory_items;
create policy inventory_owner_update on public.inventory_items for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from public.categories c where c.id = category_id)
  and (location_id is null or exists (select 1 from public.locations l where l.id = location_id))
);

drop policy if exists usage_owner_insert on public.usage_history;
create policy usage_owner_insert on public.usage_history for insert with check (
  auth.uid() = user_id and exists (select 1 from public.inventory_items i where i.id = item_id)
);
drop policy if exists usage_owner_update on public.usage_history;
create policy usage_owner_update on public.usage_history for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (select 1 from public.inventory_items i where i.id = item_id)
);

drop policy if exists images_owner_insert on public.item_images;
create policy images_owner_insert on public.item_images for insert with check (
  auth.uid() = user_id and exists (select 1 from public.inventory_items i where i.id = item_id)
);
drop policy if exists images_owner_update on public.item_images;
create policy images_owner_update on public.item_images for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (select 1 from public.inventory_items i where i.id = item_id)
);

drop policy if exists barcode_owner_insert on public.barcode_mappings;
create policy barcode_owner_insert on public.barcode_mappings for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.categories c where c.id = category_id)
  and (location_id is null or exists (select 1 from public.locations l where l.id = location_id))
);
drop policy if exists barcode_owner_update on public.barcode_mappings;
create policy barcode_owner_update on public.barcode_mappings for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (select 1 from public.categories c where c.id = category_id)
  and (location_id is null or exists (select 1 from public.locations l where l.id = location_id))
);

drop policy if exists wasted_owner_insert on public.wasted_items;
create policy wasted_owner_insert on public.wasted_items for insert with check (
  auth.uid() = user_id
  and (category_id is null or exists (select 1 from public.categories c where c.id = category_id))
);
drop policy if exists wasted_owner_update on public.wasted_items;
create policy wasted_owner_update on public.wasted_items for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and (category_id is null or exists (select 1 from public.categories c where c.id = category_id))
);

drop policy if exists shopping_owner_insert on public.shopping_list;
create policy shopping_owner_insert on public.shopping_list for insert with check (
  auth.uid() = user_id
  and (category_id is null or exists (select 1 from public.categories c where c.id = category_id))
);
drop policy if exists shopping_owner_update on public.shopping_list;
create policy shopping_owner_update on public.shopping_list for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and (category_id is null or exists (select 1 from public.categories c where c.id = category_id))
);

drop policy if exists meal_plans_owner_insert on public.meal_plans;
create policy meal_plans_owner_insert on public.meal_plans for insert with check (
  auth.uid() = user_id
  and (recipe_id is null or exists (select 1 from public.recipes r where r.id = recipe_id))
);
drop policy if exists meal_plans_owner_update on public.meal_plans;
create policy meal_plans_owner_update on public.meal_plans for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and (recipe_id is null or exists (select 1 from public.recipes r where r.id = recipe_id))
);

-- 2. Privileges ---------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
-- Tables and functions created later by migrations (run as postgres) start closed to anon too.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- 3. Functions ----------------------------------------------------------------

do $$
declare f record; found integer := 0;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('dashboard_summary', 'mark_item_wasted', 'try_consume_ai_quota')
  loop
    found := found + 1;
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
  -- A renamed or missing function must stop the file, not be skipped.
  if found <> 3 then
    raise exception 'expected 3 functions (dashboard_summary, mark_item_wasted, try_consume_ai_quota), found %', found;
  end if;
end $$;
alter function public.set_updated_at() set search_path = public, pg_temp;
-- Trigger functions cannot be called directly, but nobody needs EXECUTE on them.
revoke execute on function public.set_updated_at() from public, anon;

-- 4. Push subscriptions -------------------------------------------------------

-- NOT VALID: existing rows are not re-checked (a dead old-origin endpoint must not block this file); every new or
-- changed row is. Run `alter table public.push_subscriptions validate constraint push_subscriptions_endpoint_service`
-- once the old rows are gone. BEFORE running this file on production, check read-only that no row would block it:
--   select count(*) from public.push_subscriptions where channel <> 'local' and endpoint !~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/';
--   select user_id, count(*) from public.push_subscriptions group by 1 having count(*) > 20;
-- (an old row that breaks the CHECK cannot be updated, and a user over the cap cannot refresh a device.)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_endpoint_service') then
    alter table public.push_subscriptions add constraint push_subscriptions_endpoint_service check (
      channel = 'local'
      or endpoint ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/'
    ) not valid;
  end if;
end $$;

create or replace function public.push_subscriptions_cap() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- One insert at a time per user, or two concurrent requests could both see 19 rows and both insert.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  -- Mirrors MAX_PUSH_SUBSCRIPTIONS in packages/contracts. A device that is already registered is only refreshed.
  if (select count(*) from public.push_subscriptions where user_id = new.user_id and endpoint <> new.endpoint) >= 20 then
    raise exception 'A user can register at most 20 devices' using errcode = '54000';
  end if;
  return new;
end;
$$;
drop trigger if exists push_subscriptions_cap on public.push_subscriptions;
create trigger push_subscriptions_cap before insert on public.push_subscriptions
  for each row execute function public.push_subscriptions_cap();
revoke execute on function public.push_subscriptions_cap() from public, anon;

-- 5. A policy whose name differs in production would survive the drop above and keep the old, weaker rule: stop if any
-- of the seven tables does not end with exactly one INSERT and one UPDATE policy.
do $$
declare t text; n integer;
begin
  foreach t in array array['inventory_items','usage_history','item_images','barcode_mappings','wasted_items','shopping_list','meal_plans'] loop
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t and cmd = 'INSERT';
    if n <> 1 then raise exception 'expected 1 INSERT policy on %, found %', t, n; end if;
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t and cmd = 'UPDATE';
    if n <> 1 then raise exception 'expected 1 UPDATE policy on %, found %', t, n; end if;
  end loop;
end $$;

commit;

-- ============================================================================
-- Rollback (kept here so it is at hand on the day; run only what you need, in a transaction):
--   1. policies, per table, back to the 0001 definitions, for example
--        drop policy inventory_owner_insert on public.inventory_items;
--        create policy inventory_owner_insert on public.inventory_items for insert with check (auth.uid() = user_id);
--        drop policy inventory_owner_update on public.inventory_items;
--        create policy inventory_owner_update on public.inventory_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
--      and the same for usage_owner_* (usage_history), images_owner_* (item_images), barcode_owner_* (barcode_mappings),
--      wasted_owner_* (wasted_items), shopping_owner_* (shopping_list), meal_plans_owner_* (meal_plans).
--   2. privileges (confirm the pre-hardening grants first; these are Supabase's defaults):
--        grant all on all tables in schema public to anon;
--        grant truncate, trigger, references on all tables in schema public to authenticated;
--        revoke all on public.api_write_budget from anon, authenticated;
--        alter default privileges for role postgres in schema public grant all on tables to anon;
--        alter default privileges for role postgres in schema public grant execute on functions to anon;
--   3. functions: alter function public.dashboard_summary() reset search_path; (and mark_item_wasted, try_consume_ai_quota,
--      set_updated_at), then grant execute on them to public, anon if they were granted before.
--   4. drop trigger if exists push_subscriptions_cap on public.push_subscriptions;
--      drop function if exists public.push_subscriptions_cap();
--      alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_service;
-- ============================================================================
