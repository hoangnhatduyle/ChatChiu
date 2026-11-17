// While the old app is live, migrations from 0012 on must be additive only
// (AR-ADDITIVE-ONLY, migration-cutover.md principle 2, SPEC-DATA-001 AC-DATA-01).
//
// Fails when:
//   - 0001–0011 are not byte-identical to the old repository (NC-DATA-NO-EDIT-OLD-MIGRATIONS)
//   - a migration >= 0012 changes anything that existed before it:
//       * drops, renames, retypes or truncates anything old
//       * ALTER TABLE on an old table does anything but ADD COLUMN (nullable, or
//         NOT NULL with a DEFAULT) or ENABLE ROW LEVEL SECURITY
//       * a unique index, trigger or restrictive policy on an old table
//       * ALTER / DROP of an old policy; REVOKE on an old object
//       * CREATE OR REPLACE / ALTER of an old function or view
//       * INSERT / UPDATE / DELETE / MERGE on an old table outside a function body
//   - a migration is misnamed, numbered out of sequence, or has no test in
//     supabase/tests/NNNN_*.test.sql (CS-MIGRATION-NAMING)
//
// SQL is tokenised first: comments, string literals (incl. E'' strings) and
// dollar-quoted bodies are removed, quoted identifiers are unquoted and schema
// qualifiers dropped, so "public"."x", public . x and x are the same name.
// Objects created in a guarded migration are "new" and may be altered or dropped.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const FIRST_GUARDED = 12

// sha256 of the old repository's migrations (verified identical with diff -r on 2026-11-16).
const OLD_MIGRATION_SHA256 = {
  '0001_initial_schema.sql': '72358e1450ee8b549592d79f5c8a41e75d382c948d1016e7ebb2bfd7c4860b54',
  '0002_ai_quota_function.sql': 'e5442bfa6729c97e6030636be81afbe521c0cf4360339df0993156ef835994e3',
  '0003_storage_bucket.sql': '0681f65eb33623e7cd5de5a696aea00ab76f448ef02d8326630fc525f298b046',
  '0004_waste_function.sql': '87ed739cbc11e5f1dda3a48d6c77bcdef6f7283f00eacb0ef2499c071cdaf37b',
  '0005_dashboard_function.sql': '066c0b9b53dce32cc7e7552dece79e88b964217967f8d967fa5a78baf16259d7',
  '0006_batch_fifo_function.sql':
    '6783a7bc2e1ad423fcdd8251646c6afa4071cf49f2800d8e6c199b7658d24b2e',
  '0007_push_subscriptions.sql': 'b80b71ae312769713ac55f274b2d146fcc76bb432429dedfb75b40e6aa75a0e6',
  '0008_inventory_notified_at.sql':
    '4971a88273e842140a62ac4dc8f2a1663d24c4f18cd3414e2590924eb8e3ab96',
  '0009_user_categories.sql': '6781e23d2d982b105ba8d0f9fdc3f6a00495f2ac86c961831624ba7ec91efaab',
  '0010_backfill_favorite_meals.sql':
    '720e894fd00bb729ef4f65eaf19e8f9eb6b61c0511c91e5ea3231b14507a45a6',
  '0011_remove_batches.sql': '6290a5f41f27c01342da9d8ef3941601b826842d650ded5484cabf108f8c85ac',
}

const NAME_RE = /^\d{4}_[a-z0-9_]+\.sql$/

/**
 * One left-to-right pass: drop comments, string literals and dollar-quoted bodies;
 * unquote identifiers (spaces → _); lower-case everything else. Returns statements.
 */
export function tokenize(sql) {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end
    } else if (c === '/' && next === '*') {
      let depth = 1
      i += 2
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') (depth++, (i += 2))
        else if (sql[i] === '*' && sql[i + 1] === '/') (depth--, (i += 2))
        else i++
      }
      out += ' '
    } else if (
      c === "'" ||
      ((c === 'e' || c === 'E') && next === "'" && !/\w/.test(sql[i - 1] ?? ''))
    ) {
      const escapes = c !== "'"
      i += escapes ? 2 : 1
      while (i < sql.length) {
        if (escapes && sql[i] === '\\') i += 2
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2
        else if (sql[i] === "'") break
        else i++
      }
      i++
      out += " '' "
    } else if (c === '"') {
      const end = sql.indexOf('"', i + 1)
      const ident = sql.slice(i + 1, end === -1 ? sql.length : end)
      out += ident.toLowerCase().replace(/\s+/g, '_')
      i = end === -1 ? sql.length : end + 1
    } else if (c === '$' && !/\w/.test(sql[i - 1] ?? '')) {
      const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(i))
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length)
        i = end === -1 ? sql.length : end + tag[0].length
        out += ' $body$ '
      } else {
        out += c
        i++
      }
    } else {
      out += c.toLowerCase()
      i++
    }
  }
  return out
    .replace(/\s*\.\s*/g, '.')
    .replace(/\b[a-z_]\w*\.([a-z_]\w*)/g, '$1')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const NAME = String.raw`([a-z_]\w*)`
const created = (stmt, kind) => {
  const m = new RegExp(
    String.raw`^create (?:or replace )?(?:unique )?(?:materialized )?${kind} (?:if not exists )?${NAME}`,
  ).exec(stmt)
  return m?.[1]
}

function collectObjects(statements) {
  const objs = {
    tables: new Set(),
    functions: new Set(),
    views: new Set(),
    policies: new Set(),
    types: new Set(),
    indexes: new Set(),
    triggers: new Set(),
  }
  for (const s of statements) {
    const add = (set, name) => name && set.add(name)
    add(objs.tables, created(s, 'table'))
    add(objs.functions, created(s, 'function'))
    add(objs.views, created(s, 'view'))
    add(objs.types, created(s, 'type'))
    add(objs.indexes, created(s, 'index'))
    add(objs.triggers, created(s, '(?:constraint )?trigger'))
    const policy = new RegExp(String.raw`^create policy ${NAME}`).exec(s)
    add(objs.policies, policy?.[1])
  }
  return objs
}

/** Split an ALTER TABLE action list on top-level commas. */
function actions(list) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) (parts.push(cur.trim()), (cur = ''))
    else cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function checkStatement(stmt, old, fresh) {
  const errs = []
  const isOld = (set, name) => name != null && old[set].has(name) && !fresh[set].has(name)

  if (/\brename (?:to|column|constraint|value|attribute|[a-z_]\w* to)\b/.test(stmt))
    errs.push('renames something')
  if (/^truncate\b/.test(stmt)) errs.push('truncates a table')

  const drop = new RegExp(
    String.raw`^drop (table|view|materialized view|function|index|type|policy|trigger|schema|extension|sequence)(?: if exists)? ${NAME}`,
  ).exec(stmt)
  if (drop) {
    const kind = drop[1]
    const name = drop[2]
    const set = {
      table: 'tables',
      view: 'views',
      'materialized view': 'views',
      function: 'functions',
      index: 'indexes',
      type: 'types',
      policy: 'policies',
      trigger: 'triggers',
    }[kind]
    if (!set || !fresh[set].has(name))
      errs.push(`drops ${kind} ${name} (only objects created in 0012+ may be dropped)`)
  } else if (/^drop\b/.test(stmt)) {
    errs.push('drops something')
  }

  const replaced = new RegExp(String.raw`^create or replace (function|view|trigger) ${NAME}`).exec(
    stmt,
  )
  if (
    replaced &&
    isOld(
      replaced[1] === 'view' ? 'views' : replaced[1] === 'trigger' ? 'triggers' : 'functions',
      replaced[2],
    )
  ) {
    errs.push(`replaces ${replaced[1]} ${replaced[2]} from 0001–0011 (add a *_v2 instead)`)
  }
  const alteredFn = new RegExp(String.raw`^alter (function|view|procedure) ${NAME}`).exec(stmt)
  if (alteredFn && (isOld('functions', alteredFn[2]) || isOld('views', alteredFn[2]))) {
    errs.push(`alters ${alteredFn[1]} ${alteredFn[2]} from 0001–0011`)
  }

  const alterType = new RegExp(String.raw`^alter type ${NAME} (.*)$`).exec(stmt)
  if (alterType && isOld('types', alterType[1]) && !/^add value\b/.test(alterType[2])) {
    errs.push(`alters type ${alterType[1]} from 0001–0011`)
  }

  const alterTable = new RegExp(
    String.raw`^alter table (?:if exists )?(?:only )?${NAME} (.*)$`,
  ).exec(stmt)
  if (alterTable) {
    const [, table, list] = alterTable
    if (isOld('tables', table)) {
      for (const action of actions(list)) {
        const addColumn =
          /^add (?:column )?(?:if not exists )?[a-z_]\w* /.test(action) &&
          !/^add (constraint|primary|unique|check|foreign|exclude)\b/.test(action)
        if (addColumn) {
          if (/\bnot null\b/.test(action) && !/\bdefault\b/.test(action))
            errs.push(`adds a NOT NULL column without a default to ${table}`)
          if (/\b(unique|primary key)\b/.test(action)) errs.push(`adds a unique column to ${table}`)
        } else if (action !== 'enable row level security') {
          errs.push(
            `changes existing table ${table} (${action.split(' ').slice(0, 4).join(' ')} …); only ADD COLUMN and ENABLE ROW LEVEL SECURITY are allowed`,
          )
        }
      }
    } else if (
      /\b(alter (?:column )?[a-z_]\w* (?:set data )?type)\b/.test(list) &&
      !fresh.tables.has(table)
    ) {
      errs.push(`retypes a column of ${table}`)
    }
  }

  const index = new RegExp(
    String.raw`^create unique index (?:concurrently )?(?:if not exists )?(?:[a-z_]\w* )?on (?:only )?${NAME}`,
  ).exec(stmt)
  if (index && isOld('tables', index[1]))
    errs.push(`adds a unique index to existing table ${index[1]}`)

  const trigger = new RegExp(
    String.raw`^create (?:or replace )?(?:constraint )?trigger ${NAME} .*? on ${NAME}`,
  ).exec(stmt)
  if (trigger && isOld('tables', trigger[2]))
    errs.push(`adds trigger ${trigger[1]} to existing table ${trigger[2]}`)

  const policy = new RegExp(String.raw`^create policy ${NAME} on ${NAME}(.*)$`).exec(stmt)
  if (policy && isOld('tables', policy[2]) && /\bas restrictive\b/.test(policy[3])) {
    errs.push(`adds a restrictive policy to existing table ${policy[2]}`)
  }
  const alterPolicy = new RegExp(String.raw`^alter policy ${NAME}`).exec(stmt)
  if (alterPolicy && isOld('policies', alterPolicy[1]))
    errs.push(`alters policy ${alterPolicy[1]} from 0001–0011`)

  const revoke = new RegExp(
    String.raw`^revoke .*? on (?:table |function |all tables in schema )?${NAME}`,
  ).exec(stmt)
  if (
    revoke &&
    (isOld('tables', revoke[1]) || isOld('functions', revoke[1]) || isOld('views', revoke[1]))
  ) {
    errs.push(`revokes privileges on ${revoke[1]} from 0001–0011`)
  }

  for (const m of stmt.matchAll(
    new RegExp(
      String.raw`\b(?:update (?:only )?|delete from (?:only )?|insert into |merge into )${NAME}`,
      'g',
    ),
  )) {
    if (isOld('tables', m[1])) errs.push(`writes data in existing table ${m[1]}`)
  }
  return errs
}

/**
 * @param {{ migrationsDir: string, testsDir: string }} dirs
 * @returns {{ errors: string[], checked: string[] }}
 */
export function checkAdditiveMigrations({ migrationsDir, testsDir }) {
  const errors = []
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const [name, hash] of Object.entries(OLD_MIGRATION_SHA256)) {
    if (!files.includes(name)) {
      errors.push(`${name}: missing (0001–0011 must stay byte-identical to the old repo)`)
      continue
    }
    const actual = createHash('sha256')
      .update(readFileSync(join(migrationsDir, name)))
      .digest('hex')
    if (actual !== hash)
      errors.push(`${name}: edited (0001–0011 must stay byte-identical to the old repo)`)
  }

  const old = collectObjects(
    Object.keys(OLD_MIGRATION_SHA256)
      .filter((f) => files.includes(f))
      .flatMap((f) => tokenize(readFileSync(join(migrationsDir, f), 'utf8'))),
  )

  const guarded = files.filter((f) => !(f in OLD_MIGRATION_SHA256))
  const parsed = guarded
    .filter((f) => NAME_RE.test(f))
    .map((f) => ({ file: f, statements: tokenize(readFileSync(join(migrationsDir, f), 'utf8')) }))
  const fresh = collectObjects(parsed.flatMap((p) => p.statements))
  // A name defined in 0001–0011 is old even if a guarded migration "creates" it again.
  for (const key of Object.keys(fresh)) for (const name of old[key]) fresh[key].delete(name)

  const tests = existsSync(testsDir) ? readdirSync(testsDir) : []
  let expected = FIRST_GUARDED
  for (const file of guarded) {
    if (!NAME_RE.test(file)) {
      errors.push(`${file}: name must be NNNN_snake_case.sql`)
      continue
    }
    const number = Number.parseInt(file, 10)
    if (number !== expected)
      errors.push(`${file}: expected migration ${String(expected).padStart(4, '0')} next`)
    expected = number + 1
    const prefix = file.slice(0, 4)
    if (!tests.some((t) => t.startsWith(`${prefix}_`) && t.endsWith('.test.sql'))) {
      errors.push(`${file}: no test found in supabase/tests/${prefix}_*.test.sql`)
    }
    const { statements } = parsed.find((p) => p.file === file)
    for (const stmt of statements) {
      for (const e of checkStatement(stmt, old, fresh)) errors.push(`${file}: ${e}`)
    }
  }
  return { errors, checked: guarded }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { errors, checked } = checkAdditiveMigrations({
    migrationsDir: 'supabase/migrations',
    testsDir: 'supabase/tests',
  })
  if (errors.length > 0) {
    console.error('Non-additive migrations found (the old app shares this database):')
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
  console.log(
    `Additive-only check passed (${checked.length} migrations >= 0012, 0001–0011 unchanged).`,
  )
}
