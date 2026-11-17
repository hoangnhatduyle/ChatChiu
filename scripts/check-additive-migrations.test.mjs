import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { checkAdditiveMigrations } from './check-additive-migrations.mjs'

const realMigrations = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
let dirs = []

/** A scratch supabase/ folder with the real 0001–0011 plus the given new files and tests. */
function fixture(newFiles, { tests = 'auto', mutateOld } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'additive-'))
  dirs.push(root)
  const migrations = join(root, 'migrations')
  const testsDir = join(root, 'tests')
  mkdirSync(testsDir, { recursive: true })
  cpSync(realMigrations, migrations, {
    recursive: true,
    filter: (p) => !/^00(1[2-9]|[2-9]\d)_/.test(basename(p)),
  })
  for (const [name, sql] of Object.entries(newFiles)) {
    writeFileSync(join(migrations, name), sql)
    if (tests === 'auto')
      writeFileSync(join(testsDir, `${name.slice(0, 4)}_x.test.sql`), 'select 1;')
  }
  if (mutateOld) {
    const p = join(migrations, mutateOld)
    writeFileSync(p, readFileSync(p, 'utf8') + '\n-- edited\n')
  }
  return { migrationsDir: migrations, testsDir }
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

const ok = (sql) => checkAdditiveMigrations(fixture({ '0012_new.sql': sql })).errors

describe('check-additive-migrations (AC-DATA-01, NC-DATA-ADDITIVE-ONLY)', () => {
  it('AC-DATA-01: passes on the real repository migrations', () => {
    const repo = {
      migrationsDir: realMigrations,
      testsDir: fileURLToPath(new URL('../supabase/tests/', import.meta.url)),
    }
    expect(checkAdditiveMigrations(repo).errors).toEqual([])
  })

  it('AC-DATA-01: passes on additive objects (new table, column, function, index, policy)', () => {
    expect(
      ok(`
        create table public.user_preferences (user_id uuid primary key);
        alter table public.user_preferences enable row level security;
        alter table public.inventory_items add column if not exists low_stock_notified_at timestamptz;
        create index idx_x on public.inventory_items (user_id);
        create policy p on public.user_preferences for select using (auth.uid() = user_id);
        create or replace function public.delete_items(p_ids bigint[]) returns int
        language plpgsql as $$ begin delete from public.inventory_items where id = any(p_ids); return 1; end $$;
      `),
    ).toEqual([])
  })

  it.each([
    ['drop table', 'drop table public.item_images;'],
    ['drop column', 'alter table public.inventory_items drop column notes;'],
    ['drop function', 'drop function if exists public.dashboard_summary();'],
    ['drop policy', 'drop policy "categories_read" on public.categories;'],
    ['rename', 'alter table public.recipes rename to old_recipes;'],
    ['rename column', 'alter table public.recipes rename column name to title;'],
    ['alter column type', 'alter table public.inventory_items alter column quantity type int;'],
    [
      'set data type',
      'alter table public.inventory_items alter column quantity set data type int;',
    ],
    ['set not null', 'alter table public.inventory_items alter column price set not null;'],
    [
      'constraint on an old table',
      'alter table public.inventory_items add constraint c check (quantity > 0);',
    ],
    ['truncate', 'truncate public.usage_history;'],
    [
      'top-level update of an old table',
      'update public.inventory_items set current_quantity = quantity;',
    ],
    ['top-level delete from an old table', 'delete from public.push_subscriptions;'],
    [
      'replacing an old function',
      'create or replace function public.dashboard_summary() returns jsonb language sql as $$ select 1 $$;',
    ],
    [
      'replacing an old function (no schema)',
      'CREATE OR REPLACE FUNCTION mark_item_wasted(bigint) returns void language sql as $$ select $$;',
    ],
    [
      'altering an old function',
      'alter function public.try_consume_ai_quota(text, int, text) security definer;',
    ],
  ])('AC-DATA-01: fails on %s', (_label, sql) => {
    expect(ok(sql).length).toBeGreaterThan(0)
  })

  // Bypasses found by the step 2.3 review: each must now fail.
  it.each([
    [
      'quoted, schema-qualified constraint',
      'alter table "public"."inventory_items" add constraint c check (quantity > 0);',
    ],
    ['quoted, schema-qualified update', 'update "public"."inventory_items" set notes = null;'],
    [
      'quoted old function',
      'create or replace function "public"."dashboard_summary"() returns jsonb language sql as $$ select 1 $$;',
    ],
    [
      'other schema prefix',
      'create or replace function extensions.dashboard_summary() returns jsonb language sql as $$ select 1 $$;',
    ],
    [
      'spaced dot',
      'create or replace function public . dashboard_summary() returns jsonb language sql as $$ select 1 $$;',
    ],
    ['alter without COLUMN keyword', 'alter table inventory_items alter quantity type int;'],
    [
      'alter without COLUMN, set data type',
      'alter table inventory_items alter quantity set data type int;',
    ],
    ['$$ inside a string hides a drop', "select 'a $$ b'; drop table recipes; select 'c $$ d';"],
    ['$$ inside a quoted identifier', 'select 1 as "$$"; drop table recipes; select 1 as "$$";'],
    ['E-string with an escaped quote', "select E'it\\'s'; drop table recipes; select E'x';"],
    ['CTE delete from an old table', 'with x as (select 1) delete from public.inventory_items;'],
    [
      'upsert into an old table',
      "insert into public.categories (name) values ('x') on conflict do nothing;",
    ],
    [
      'trigger on an old table',
      'create trigger t before insert on public.inventory_items for each row execute function f();',
    ],
    [
      'create or replace trigger on an old table',
      'create or replace trigger t before update on inventory_items for each row execute function f();',
    ],
    [
      'alter an old policy',
      'alter policy "inventory_owner_select" on public.inventory_items using (false);',
    ],
    ['revoke on an old table', 'revoke select on public.inventory_items from authenticated;'],
    [
      'disable RLS on an old table',
      'alter table public.inventory_items disable row level security;',
    ],
    [
      'NOT NULL column without default',
      'alter table public.inventory_items add column z int not null;',
    ],
    ['unique on an old table', 'alter table public.inventory_items add unique (name);'],
    ['unique index on an old table', 'create unique index u on public.inventory_items (name);'],
    [
      'drop default on an old column',
      'alter table inventory_items alter column quantity drop default;',
    ],
    [
      'restrictive policy on an old table',
      'create policy r on public.inventory_items as restrictive for all using (false);',
    ],
  ])('review bypass now caught: %s', (_label, sql) => {
    expect(ok(sql).length).toBeGreaterThan(0)
  })

  // False positives found by the step 2.3 review: each must now pass.
  it.each([
    ['a column named "drop" in a new table', 'create table public.t ("drop" int, "rename" int);'],
    [
      'SET NOT NULL on a new table',
      'create table public.t (a int); alter table public.t alter column a set not null;',
    ],
    [
      'idempotent drop of a new object',
      'create function public.f() returns int language sql as $$ select 1 $$; drop function if exists public.f();',
    ],
    [
      'revoke truncate privilege on a new table',
      'create table public.t (a int); revoke insert, update, delete, truncate on public.t from authenticated;',
    ],
    [
      'NOT NULL column with a default on an old table',
      "alter table public.push_subscriptions add column if not exists channel text not null default 'web-push' check (channel in ('web-push', 'local'));",
    ],
    [
      'a plain index and a permissive policy on an old table',
      'create index i on public.usage_history (user_id, recorded_at desc); create policy p on public.inventory_items for select using (true);',
    ],
    ['comment on an old table', "comment on table public.inventory_items is 'items';"],
  ])('additive SQL passes: %s', (_label, sql) => {
    expect(ok(sql)).toEqual([])
  })

  it('ignores forbidden words inside comments and function bodies', () => {
    expect(
      ok(`
        -- we never drop or rename anything here
        /* alter column x type int */
        create function public.clear_purchased(p_ids bigint[]) returns int language plpgsql as $fn$
        begin delete from public.shopping_list where id = any(p_ids); return 0; end $fn$;
      `),
    ).toEqual([])
  })

  it('NC-DATA-NO-EDIT-OLD-MIGRATIONS: fails when 0001–0011 differ from the old repository', () => {
    const errors = checkAdditiveMigrations(
      fixture({}, { mutateOld: '0005_dashboard_function.sql' }),
    ).errors
    expect(errors.join('\n')).toMatch(/0005_dashboard_function\.sql/)
  })

  it('CS-MIGRATION-NAMING: fails on a bad name, a gap in numbering, or a migration without a test', () => {
    expect(
      checkAdditiveMigrations(fixture({ '0012-Bad Name.sql': 'select 1;' })).errors.length,
    ).toBeGreaterThan(0)
    expect(
      checkAdditiveMigrations(fixture({ '0013_skip.sql': 'select 1;' })).errors.join(),
    ).toMatch(/0012/)
    expect(
      checkAdditiveMigrations(
        fixture({ '0012_new.sql': 'select 1;' }, { tests: 'none' }),
      ).errors.join(),
    ).toMatch(/test/)
  })
})
