# Architecture (project override)

> Thin override of the global Harness OS constitution `architecture.md`. Project rules win
> on conflict. Source of truth for the reasoning: `docs/plan/README.md` (D1–D18),
> `docs/plan/architecture.md` and `docs/plan/migration-cutover.md`.

## Layers and boundaries

- **AR-LAYERS — one direction of dependency.** In `apps/web/src/`:
  `features/*` → `data/*` → `core/*`; `ui/*` and `shell/*` are presentational and depend on
  nothing in `data/` or `core/api-client`. Shared code lives in `packages/contracts`
  (zod schemas + TS types) and `packages/domain` (pure logic, no React, no I/O).
  `api/` imports `packages/contracts` and `packages/domain`, never `apps/web`.
- **AR-NO-DIRECT-API — screens never call the API directly.** Nothing under
  `apps/web/src/features/`, `ui/` or `shell/` imports `core/api-client`, `core/supabase.client`,
  `fetch` or `@supabase/supabase-js`. Screens read and write only through the
  `useXxxQuery` / `useXxxMutation` hooks in `apps/web/src/data/*`.
- **AR-ONE-DEFINITION — one definition of each business rule.** Expiry status, % left,
  low stock, run-out, recipe matching, per-unit price and the inventory filters are
  implemented once in `packages/domain` (and mirrored in SQL only where the database must
  compute them, with a test that checks both agree). The old app had two definitions of
  "low stock"; that must not happen again.
- **AR-CONTRACTS — one source of schemas.** Request and response shapes are defined in
  `packages/contracts`; `api/_lib/schemas.ts` re-exports them. Specs point at contracts by
  module name, not by copying fields.
- **AR-SINGLE-ROUTER.** The API stays one Vercel function (`api/handler.ts`) dispatching to
  `api/_routes/**` (Hobby plan function limit). `api/diagnostics.ts` is a temporary Phase 0
  exception, removed by roadmap row 7.0.3.

## Data and the live old app (D2)

- **AR-ADDITIVE-ONLY — additive database changes only while the old app is live.**
  Migrations `0012` and later may add tables, columns, functions, indexes and policies.
  They must not `drop`, `rename`, `alter … type`, tighten a constraint on existing data, or
  change the behaviour of an existing function (the old `dashboard_summary()` stays as it is;
  new behaviour goes into `*_v2()`). Migrations `0001`–`0011` are never edited.
  Enforced in CI by `scripts/check-additive-migrations.mjs` (Phase 2). Lifted only by an
  explicit decision after cutover step 7 in `migration-cutover.md`.
- **AR-SAME-SEMANTICS — either app can edit any row.** Price is stored **per unit**;
  quantities stay `quantity` / `initial_quantity` / `current_quantity`, and a missing
  `initial_quantity` / `current_quantity` is read as `quantity` without rewriting the row.
  Low-stock threshold is a **percentage of the full amount** (`low_stock_threshold`, default 20).
- **AR-NO-SEED-ASSUMPTIONS.** Production category data was changed by the hand-run
  `make-categories-editable.sql` (roadmap 7.0.10). Code, specs and tests must not assume the
  seeded system categories (ids, names or `is_system` flags) exist in production.
- **AR-HIDDEN-NOT-DROPPED (D3).** Item photos and barcode data, tables and routes are kept
  and untouched; only the UI is off.

## API envelope (overrides the global "consistent API envelope")

- Every route, old and new, goes through `withErrorHandler` (`api/_lib/errors.ts`): success
  is `{ data: … }` with status 200, errors are `{ error: { code, message, details? } }` with the
  old codes and status numbers (`details` only outside production). The old frontend reads
  this shape during the parallel run, and one shape keeps one parsing path in `core/api-client`.
- Existing routes keep their payload shapes inside `data`.
- A changed route may add fields but must not remove or retype one the old app reads.

## Sync, undo and notifications

- **AR-WRITE-PATTERN.** Every write: update the cache first → send → reconcile with the
  server row on success → roll back and show "Couldn't save · Retry" on failure → queue when
  offline. No full-list reloads after a write.
- **AR-UNDO-KINDS.** Reversible actions use one of the two undo kinds in
  `docs/plan/architecture.md` §3.3 (commit-now-and-reverse, or hold-until-the-toast-closes
  with a `keepalive` flush on `pagehide`). Nothing that is undoable asks for confirmation.
- **AR-ONE-SENDER.** Only one deployment sends scheduled notifications at a time
  (migration-cutover.md step 4). The new app's send job (a Vercel Schedule, or the fallback
  cron) stays disabled until then.
- **AR-NO-PROD-WRITES-WITHOUT-ASK (D18).** Deploying to the live project, `supabase db push`,
  production SQL writes and env-var changes need the user's explicit go-ahead each time.
