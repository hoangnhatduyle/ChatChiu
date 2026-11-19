// The post-cutover hardening (supabase/post-cutover) must stay safe to run twice and must never become a migration:
// supabase/migrations is additive-only while the old app is live (scripts/check-additive-migrations.mjs).
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const DIR = new URL('../supabase/post-cutover/', import.meta.url)
const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url)
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql'))

describe('supabase/post-cutover', () => {
  it('has at least one file, numbered 01xx so it can never collide with a migration', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(f).toMatch(/^01\d\d_[a-z_]+\.sql$/)
    const migrations = readdirSync(MIGRATIONS)
    for (const f of files) expect(migrations).not.toContain(f)
  })

  it.each(files)(
    '%s can run twice: every policy and trigger is dropped before it is created',
    (f) => {
      const sql = readFileSync(new URL(f, DIR), 'utf8').replace(/--.*$/gm, '')
      for (const [, name, table] of sql.matchAll(/create policy (\w+) on ([\w.]+)/g)) {
        expect(sql, `${name} is created without a drop`).toMatch(
          new RegExp(`drop policy if exists ${name} on ${table.replace('.', '\\.')}`),
        )
      }
      for (const [, name] of sql.matchAll(/create trigger (\w+)/g)) {
        expect(sql, `${name} is created without a drop`).toMatch(
          new RegExp(`drop trigger if exists ${name}`),
        )
      }
      expect(sql).not.toMatch(/\bdrop table\b|\btruncate table\b|\bdelete from\b/i)
    },
  )

  it('never touches storage or auth objects', () => {
    for (const f of files) {
      const sql = readFileSync(new URL(f, DIR), 'utf8').replace(/--.*$/gm, '')
      expect(sql).not.toMatch(/\b(auth|storage)\.\w+\s*(set|add|alter|disable)/i)
    }
  })
})
