# Coding standards (project override)

> Thin override of the global Harness OS constitution `coding-standards.md`. Only deviations
> and additions for this stack: React 19 + Vite + TanStack Query + Tailwind v4 + React Aria
> (web), Vercel functions + zod 4 (API), Supabase/Postgres (DB). See also
> `.claude/constitution/architecture.md`.

## React and hooks

- **CS-FUNCTION-COMPONENTS.** Function components and hooks only. Rules of Hooks are enforced
  by `eslint-plugin-react-hooks`; its errors are never disabled inline.
- **CS-COMPILER-FIRST.** The React Compiler is on. Do not add `useMemo` / `useCallback` /
  `memo` by habit; add one only with a measured reason in a comment.
- **CS-NO-EFFECT-FETCH.** No data fetching or derived state in `useEffect`. Server state comes
  from TanStack Query hooks in `apps/web/src/data/*`; derived values are computed during render.
  `useEffect` is for subscriptions to external systems (Realtime, `pagehide`, media queries).
- **CS-STATE-HOMES.** Server state: TanStack Query (never copied into component or global
  state). Shareable view state (filters, sort, group, tab, week): the URL. Form state: the
  form library. Per-device conveniences (dismissed tips, card/table override): `localStorage`
  behind a small typed helper that tolerates failure.
- **CS-DATA-HOOKS.** Each module in `apps/web/src/data/` exposes `useXxxQuery` and
  `useXxxMutation` hooks. Mutations implement the update-first + rollback pattern
  (architecture AR-WRITE-PATTERN) and register their undo through `core/undo.ts`.
  Screens never call `core/api-client` (AR-NO-DIRECT-API).
- **CS-UNDO-NOT-CONFIRM.** No `window.confirm`, `alert` or confirm dialog for a reversible
  action; use the Undo toast. A confirm is allowed only for irreversible actions with no undo
  (for example "Reset app cache").
- **CS-ACCESSIBLE-UI.** Interactive primitives come from React Aria Components. Touch targets
  ≥ 44 px. Status is never shown by colour alone (expiry and low stock carry a text label).
  Motion uses transform/opacity only and stops under `prefers-reduced-motion`.
- **CS-TOKENS.** Colours, spacing, radius and type come from `apps/web/src/styles/tokens.css`;
  no hard-coded palette values in components.

## TypeScript and validation

- **CS-STRICT-TS.** `strict` on; no `any` (use `unknown` and narrow); no non-null `!` on data
  from the network.
- **CS-ZOD4-NO-UPDATE-DEFAULTS.** The API uses zod 4, which applies `.default()` inside
  `.partial()` fields. Update (PATCH) schemas must not carry defaults, or a partial update
  resets fields it didn't mention (commit `b095809`: `notificationEnabled`,
  `notificationDaysBefore`, `isFavorite`). Create schemas may have defaults; update schemas
  override those fields as plain `.optional()`. Each update schema has a test proving an
  empty body parses to `{}`.
- **CS-CONTRACT-TYPES.** Request/response types are imported from `packages/contracts`,
  never redeclared in the web app or the API.

## Domain rules

- **CS-PER-UNIT-PRICE.** `price` is per unit. Forms take a **total** and store
  `total / quantity`; edit shows `price × quantity` again. Value lost or stock value =
  per-unit price × the relevant quantity (remaining or current), never the raw `price`.
- **CS-PERCENT-LOW-STOCK.** Low stock means `current / initial × 100 ≤ low_stock_threshold`
  (default 20; critical ≤ 10). Implemented once in `packages/domain/src/low-stock.ts`.
- **CS-DAY-MATHS.** Expiry offsets use month = 30 days, year = 365 days (old app parity).
  "Today" for notifications is computed in the user's timezone, not UTC.
- **CS-NUMBERED-CONSTANTS.** Named constants for 5 % slider steps, the 4 px tap guard, the
  3-day "use soon" window, the 5 s undo window and the 1024 px card/table breakpoint.

## SQL and migrations

- **CS-SQL-RPC.** Multi-step writes that must be atomic (usage log + quantity, bulk create,
  bulk delete) are Postgres functions called by RPC, `security invoker`, so RLS applies.
- **CS-MIGRATION-NAMING.** `supabase/migrations/NNNN_snake_case.sql`, numbered after the
  last one, additive only (AR-ADDITIVE-ONLY), each with a test in `supabase/tests/`.

## Tests

- **CS-TEST-IDS.** Every test that covers a spec acceptance criterion names its id in the test
  title (for example `F-KB-04: drag down saves on release and shows Undo`), so
  `validate_coverage` and `trace_artifact` can find it.
- **CS-NO-SEEDED-CATEGORIES.** Tests create the categories and locations they need; they do
  not rely on ids or names from the migration seed (AR-NO-SEED-ASSUMPTIONS).
