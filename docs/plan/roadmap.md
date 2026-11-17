# Roadmap

Each step lists the **files** to create or edit, the **artifact** it produces, and how it is **verified**.
Feature steps run through the harness `new-feature` workflow:
spec → risk → RED tests → baseline → code → review → quality evaluation → audit.
`OLD/` means `../Inventory_Tracking_App/`.

---

## Phase 0: foundation and spikes

Status 2026-11-16: every step is built and committed. Checks that wait on the user, her devices or approvals are deferred to [7.0](#70-deferred-configuration-and-checks) (rows 7.0.1–7.0.10).

| Step | Files | Artifact | Verified by |
|---|---|---|---|
| 0.1 Workspace scaffold | `package.json` (workspaces), `apps/web/` (Vite `react-ts` template, React Compiler, Tailwind v4, ESLint + Prettier, Vitest + Testing Library), `packages/contracts/package.json`, `packages/domain/package.json`, `tsconfig.base.json`, `.editorconfig`, `.gitignore`, `.nvmrc` (Node 24 to match the old `engines`) | Empty app that builds | `npm run build` and `npm test` pass in CI |
| 0.2 Copy migrations verbatim | `supabase/migrations/0001…0011_*.sql` ← `OLD/supabase/migrations/`, `supabase/config.toml` | Identical migration history | `diff -r` against OLD is empty; `supabase start` + `supabase db reset` locally applies cleanly |
| 0.3 Port the API unchanged | `api/handler.ts`, `api/_lib/*`, `api/_routes/**` ← OLD `api/`; `api/package.json`, `api/tsconfig.json` | The same API, running in this repo | `npm run typecheck -w api`; Phase 2 contract tests run against local Supabase |
| 0.4 Env and deploy config | `.env.example` (union of OLD `.env.example`), `vercel.json` (from OLD; **cron entry left out** until cutover, see migration-cutover.md) | Preview deploy on a new Vercel project | Preview URL serves the empty shell; `/api/health` returns 200 |
| 0.5 CI | `.github/workflows/ci.yml`: install → lint → typecheck → unit → build → bundle budget → e2e (Playwright + local Supabase) → `npm audit --omit=dev` | Green pipeline | A PR shows every job passing |
| 0.6 **Fire notification spike** | `apps/web/src/features/diagnostics/DiagnosticsPage.tsx` (dev only, also run on her iPhone from the Home Screen) | A report from her Fire Max 11 | Screenshot of the results recorded with harness `record_decision`; decides whether 5.9 happens |
| 0.8 **Why iPhone push never arrives** (read-only on production) | Notes added to `docs/plan/feature-inventory.md` (F-NT-01) | A root cause for D17 | Check each link in the chain: (1) old Vercel cron logs: does `/api/cron/check-expirations` run daily, or return `skipped: VAPID keys not configured` / 401? (2) env vars present: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `NG_APP_VAPID_PUBLIC_KEY` (do the client and server keys match?); (3) `push_subscriptions` has rows for her user, with an `web.push.apple.com` endpoint; (4) were any items actually due (`notification_enabled`, within `days_before`, `last_notified_at`)? (5) `POST /api/push/test` from her Home Screen app. Each finding is recorded with harness `record_decision`, and the fix carries into step 5.8. |
| 0.7 Behaviour check on the live old app | `docs/plan/feature-inventory.md` (update the *(suspected)* rows) | Confirmed statuses | Each suspected row changed to ✅ / ⚠️ / ❌ |

## Phase 1: specs (harness: Constitution → Spec)

Status 2026-11-16: steps 1.1–1.5 are done. 14 specs validated and approved by the user (`active`). Risk (step 1.5): **high** (human checkpoint + security review) for SPEC-DATA, SPEC-API, SPEC-AU, SPEC-NT, SPEC-RS; **medium** for SPEC-KB, SPEC-QP, SPEC-IN, SPEC-SL, SPEC-SE, SPEC-AP, SPEC-ST (raised from low at the user's request: money totals); **low** for SPEC-IF, SPEC-MP. New deferred row: 7.0.11 (Vercel Schedules, needed by 5.8).

| Step | Files | Artifact | Verified by |
|---|---|---|---|
| 1.1 Constitution overrides | `.claude/constitution/architecture.md`, `.claude/constitution/coding-standards.md` (React / hooks / data-hook rules: screens never call the API directly; undo pattern, additive-only DB rule while the old app is live) | Project law | Harness `get_constitution` returns the merged rules |
| 1.2 Data spec | `.claude/specifications/SPEC-DATA-001.yaml` (data.inventory; from `templates/spec.data.yaml`): tables, the per-unit price rule, the %-based low-stock rule, the additive-only rule | Validated spec | Harness `validate_spec` passes |
| 1.3 API spec | `.claude/specifications/SPEC-API-001.yaml` (api): every route (old + new), request/response schemas pointing at `packages/contracts` | Validated spec | `validate_spec` |
| 1.4 Feature specs, one per section of feature-inventory.md | `.claude/specifications/SPEC-<AREA>-001.yaml`, one per section (see the name map below). Each `F-xx-nn` becomes an acceptance criterion; undo, rollback and offline states are listed in its state machine. | 12 validated specs | `validate_spec` on each; `trace_artifact` links each spec to its feature-inventory rows |
| 1.5 Risk | — | Risk record per spec (auth, notifications, migrations ≥ high) | Harness `assess_risk` entries in `audit_report` |

**Spec file names.** The harness only accepts ids of the form `SPEC-<AREA>-<NNN>`, and `create_spec` writes `<id>.yaml` (decided 2026-11-16, Phase 1). The names used elsewhere in this plan map to files as follows; the area code is the feature-inventory prefix.

| Plan name | Spec file | Feature-inventory rows |
|---|---|---|
| `data.inventory.yaml` | `SPEC-DATA-001.yaml` | data rules |
| `api.yaml` | `SPEC-API-001.yaml` | every route |
| `feature.auth.yaml` | `SPEC-AU-001.yaml` | F-AU-01…06 |
| `feature.kitchen-board.yaml` | `SPEC-KB-001.yaml` | F-KB-01…16 |
| `feature.item-panel.yaml` | `SPEC-QP-001.yaml` | F-QP-01…10 |
| `feature.inventory.yaml` | `SPEC-IN-001.yaml` | F-IN-01…14 |
| `feature.item-form.yaml` | `SPEC-IF-001.yaml` | F-IF-01…16 |
| `feature.receipt-scan.yaml` | `SPEC-RS-001.yaml` | F-RS-01…10 |
| `feature.shopping.yaml` | `SPEC-SL-001.yaml` | F-SL-01…08 |
| `feature.meals.yaml` | `SPEC-MP-001.yaml` | F-MP-01…12 |
| `feature.stats.yaml` | `SPEC-ST-001.yaml` | F-ST-01…08 |
| `feature.settings.yaml` | `SPEC-SE-001.yaml` | F-SE-01…07 |
| `feature.notifications.yaml` | `SPEC-NT-001.yaml` | F-NT-01…04 |
| `feature.app-shell.yaml` | `SPEC-AP-001.yaml` | F-AP-01…05 |

## Phase 2: database and API

Status 2026-11-16: steps 2.1–2.4 are built, reviewed (typescript, database and security reviewers) and user-approved at each human checkpoint; verified on **local** Supabase (Postgres 17) only, nothing was pushed to production. Extra changes the user approved along the way: `POST /api/recipes` fixed (42P10), `DELETE /api/categories/:id` 409 when in use. New deferred rows: 7.0.12 (preview bundle check) and 7.0.13 (security leftovers).

| Step | Files | Artifact | Verified by |
|---|---|---|---|
| 2.1 Shared contracts | `packages/contracts/src/{inventory,shopping,meals,recipes,waste,locations,categories,ai,stats,preferences}.ts` (moved from `api/_lib/schemas.ts`, extended); `api/_lib/schemas.ts` re-exports them | One source of schemas | Unit tests: each schema accepts/rejects fixtures |
| 2.2 Domain logic | `packages/domain/src/expiry.ts` (status, days left; ported from `OLD/src/app/utils/date.utils.ts`), `quantity.ts` (from `OLD/src/app/utils/quantity.utils.ts`), `low-stock.ts`, `run-out.ts`, `recipe-match.ts`, `units.ts` | Pure, tested functions | Vitest ≥ 90% coverage; the old `date.utils.spec.ts` and `quantity.utils.spec.ts` cases are ported and pass |
| 2.3 Migrations 0012–0017 | `supabase/migrations/0012_log_item_usage.sql` … `0017_bulk_ops.sql` (see architecture.md §3.4) | Additive SQL | `supabase db reset` locally; pgTAP or SQL tests in `supabase/tests/*.sql`; **old-route regression suite `api/__tests__/old-routes.test.ts` passes against the migrated local DB** (the old app has no API tests; decided 2026-11-16) |
| 2.4 New and changed routes | `api/_routes/bootstrap.ts`, `inventory/bulk.ts`, `inventory/[id]/restock.ts`, `inventory/[id]/usage-undo.ts`, `shopping-list/clear-purchased.ts`, `recipes/suggestions.ts`, `stats/overview.ts`, `preferences.ts`; edit `inventory/[id]/usage.ts`, `waste/index.ts`, `meal-plans/index.ts`, `cron/check-expirations.ts`, `categories/[id].ts` (409 when in use, AC-DATA-14); register them in `api/handler.ts` | API v2 (a superset of v1) | Integration tests `api/__tests__/*.test.ts` against local Supabase, two users (RLS isolation), quota paths |

## Phase 3: design system and shell

Status 2026-11-17: steps 3.1–3.4 are built, reviewed and user-approved at each commit (3.1–3.3: react, typescript and a11y reviewers, independent live-browser quality evaluation 4.5/5 on the shell; 3.4: code review, no HIGH findings). Changes the user decided along the way: four prototype colours moved to the nearest WCAG AA shade; the dark theme is **Fresh Ledger Dark** instead of Night Kitchen (D5); ExpiryChip is a rounded tag with a glyph; a 6-item rail with Stats and a `/more` page on the phone. Lighthouse 12 has no PWA category, so 3.4's installability check is a CI e2e test (`Page.getInstallabilityErrors`) plus a one-off Lighthouse 11.7.1 PWA run (score 100). New deferred rows: 7.0.14 (PWA on her devices) and 7.0.15 (bundle headroom, needed by 4.1).

| Step | Files | Artifact | Verified by |
|---|---|---|---|
| 3.1 Tokens and fonts | `apps/web/src/styles/tokens.css`, `base.css`, `fonts.css`; `@fontsource/inter-tight`, `@fontsource/ibm-plex-mono` | Light + dark themes | Contrast check script `apps/web/scripts/check-contrast.mjs` (AA for every token pair) |
| 3.2 UI components | `apps/web/src/ui/{Button,IconButton,Chip,ExpiryChip,Segmented,Field,Select,DateField,UsageSlider,ResponsivePanel,Toast,EmptyState,Skeleton,Icon}.tsx` (+ `*.test.tsx`) | Component library | Unit tests (keyboard, ARIA, the usage-slider down-only and 4 px guard); Playwright component screenshots in light and dark |
| 3.3 Shell | `apps/web/src/shell/{AppShell,NavRail,BottomNav,UpdatePrompt}.tsx`, `apps/web/src/routes.tsx` (lazy routes via `React.lazy`), `vite-plugin-pwa` config in `apps/web/vite.config.ts` | Navigation on tablet and phone | e2e: nav works at 390, 768, 1280 widths; screenshots |
| 3.4 Logo and icons | `apps/web/public/` ← OLD `public/icons/*`, `chac-chiu-icon.png`, `favicon.ico`; `manifest.webmanifest` (fix `theme_color` #1976d2 → the teal token) | Branded PWA | `e2e/shell.spec.ts` installability test (Chrome `Page.getInstallabilityErrors` empty, in CI) and `apps/web/scripts/manifest.test.mjs`; one-off Lighthouse 11.7.1 PWA run scored 100 (Lighthouse 12 has no PWA category) |

## Phase 4: core and data layer

| Step | Files | Artifact | Verified by |
|---|---|---|---|
| 4.1 Supabase and auth | `core/supabase.client.ts`, `core/auth.tsx` (AuthProvider + `useSession`; ported from `OLD/src/app/core/supabase-auth.service.ts`), `core/RequireAuth.tsx` (route guard); token attachment lives in `core/api-client.ts` | Session handling | Unit tests; e2e sign-in |
| 4.2 API client + errors | `core/api-client.ts` (from `OLD/src/app/core/api-client.service.ts`), `core/errors.ts` | Typed client returning `packages/contracts` types | Unit tests for the error mapping (QUOTA_EXCEEDED, RATE_LIMITED, 401, offline) |
| 4.3 Query client | `data/query-client.ts` (cache times, retry, IndexedDB persistence, offline mutation queue) | Cache that survives a restart | Test: reload while offline still shows the board |
| 4.4 Repositories | `data/{inventory,locations,categories,shopping,meals,recipes,waste,stats,ai,preferences}.ts`, each exposing `useXxxQuery` / `useXxxMutation` hooks with the update-first + rollback pattern | Data API used by screens | Unit tests with a mocked API: success, failure-rollback, offline-queue |
| 4.5 Toast and undo | `core/toast.tsx` (provider + `useToast`), `core/undo.ts` (commit-now vs hold-until-close, keepalive flush on `pagehide`) | One undo system | Unit tests including the "app hidden during the Undo window" case |
| 4.6 Realtime | `core/realtime.ts` (subscribe to the three tables, write changes into the cache) | Cross-device sync | e2e with two browser contexts: change in A appears in B within 3 s |

## Phase 5: features (one harness `new-feature` run each, in this order)

| Step | Files (pattern: `apps/web/src/features/<name>/{<Name>Page.tsx, *.tsx, *.test.tsx}` + `apps/web/e2e/<name>.spec.ts`) | Spec | Notes |
|---|---|---|---|
| 5.1 Kitchen board | `features/kitchen-board/{KitchenBoardPage, LocationColumn, BoardRow, BoardFilters}.tsx` | `feature.kitchen-board.yaml` | Uses `ui/usage-slider`, `ui/expiry-chip`; the prototype is the visual reference |
| 5.2 Quick-action panel | `features/item-panel/{ItemPanel, RestockForm, UsageHistory}.tsx` | `feature.item-panel.yaml` | Opened from the board, inventory and search |
| 5.3 Item form | `features/item-form/{ItemFormPage, CategoryPicker, LocationPicker, ExpiryField}.tsx` | `feature.item-form.yaml` | Ports the logic in `OLD/.../item-form/item-form.ts` lines 280–476 (save, per-unit price, expiry maths) |
| 5.4 Inventory list | `features/inventory/{InventoryPage, InventoryTable, InventoryCards, InventoryFilters}.tsx` | `feature.inventory.yaml` | Ports `applyFilters()` from `OLD/.../inventory-list.ts` lines 245–339 into `packages/domain/src/filter.ts` |
| 5.5 Shopping list | `features/shopping/{ShoppingPage, ShoppingRow}.tsx` | `feature.shopping.yaml` | |
| 5.6 Meals | `features/meals/{MealsPage, WeekGrid, MonthGrid, MealDialog, RecipeLibrary, RecipeForm, MealSummary, RecipeSuggestions}.tsx` | `feature.meals.yaml` | Ports `getSummary()` from `OLD/src/app/services/meal-plan.service.ts` lines 48–169 into `packages/domain/src/meal-summary.ts` |
| 5.7 Waste & Stats | `features/stats/{StatsPage, Overview, WasteLog}.tsx`, `features/stats/charts/*.tsx` | `feature.stats.yaml` | Charts follow the dataviz rules (tokens, both themes) |
| 5.8 Settings + web notifications | `features/settings/{SettingsPage, LocationsSection, CategoriesSection, NotificationsSection, AppearanceSection, DataSection}.tsx`; `apps/web/public/sw-push.js` (from OLD) | `feature.settings.yaml`, `feature.notifications.yaml` | Includes timezone and notify hour |
| 5.9 Fire shell (sideloading approved; skipped only if 0.6 = A) | `apps/fire-shell/` (`npx cap init`, Android), `apps/web/src/core/notify/{port.ts, webPush.ts, localNotify.ts}`, `apps/fire-shell/src/live-update.ts`, `apps/fire-shell/README.md` (sideload steps) | `feature.notifications.yaml` | Verified **on her Fire Max 11**: test reminder delivered with the app closed; reminders survive a reboot |
| 5.10 Receipt scan | `features/receipt-scan/{ReceiptScanPage, CaptureStep, ReviewWizard, ReviewTable}.tsx`, `features/receipt-scan/imageCompress.ts` | `feature.receipt-scan.yaml` | Splits the 2,166-line OLD component into five units of ≤ 400 lines each |
| 5.11 Auth pages | `features/auth/{LoginPage, RegisterPage, ResetPasswordPage}.tsx` | `feature.auth.yaml` | Includes the fix for F-AU-03 |

Every feature step is done only when:

- its spec's acceptance criteria all have passing tests;
- the e2e runs at tablet and phone sizes in both themes;
- the `react-reviewer` + `typescript-reviewer` agents plus the harness `request_review` routing have no CRITICAL or HIGH findings;
- harness `evaluate_quality` meets the rubric threshold.

## Phase 6: hardening

| Step | Files | Verified by |
|---|---|---|
| 6.1 Performance | `apps/web/vite.config.ts` (manual chunks), `scripts/check-bundle-budget.mjs` (gzip sizes vs architecture.md §5) | CI budget gate; Lighthouse on the Fire (manual) records LCP |
| 6.2 Accessibility | `e2e/a11y.spec.ts` (axe) | No serious or critical violations; keyboard-only run of the board |
| 6.3 Offline | `e2e/offline.spec.ts` | Drag while offline → queued → back online → saved |
| 6.4 Visual regression | `e2e/visual.spec.ts` at 320, 390, 768, 1024, 1280, 1440; light + dark | Snapshots approved |
| 6.5 Security | — | `security-reviewer` agent pass; CSP check; RLS two-user tests |

## Phase 7: parallel run and cutover

### 7.0 Deferred configuration and checks

**Rule:** a configuration task or check that a phase can't finish (because it waits on the user, a device, an approval or an account) doesn't block that phase. It gets a row here, tagged with its source step, and the phase moves on. Every row must be done before cutover step 2 in [migration-cutover.md](migration-cutover.md). The **Needed by** column shows the earliest step that depends on a row; when that step comes up, do the row first.

| # | From | Task | Files / place | Verified by | Needed by |
|---|---|---|---|---|---|
| 7.0.1 | 0.8 | Confirm the root cause of D17: run [`phase0/push-diagnosis.sql`](phase0/push-diagnosis.sql) (SELECT only) in the production Supabase SQL editor, and press "Send test notification" in the old app's Settings on her iPhone | `docs/plan/feature-inventory.md` (F-NT-01, *Step 0.8 push diagnosis*) | Root cause recorded with harness `record_decision`; F-NT-01 updated | 5.8 |
| 7.0.2 | 0.6 | Run `/diagnostics` on her Fire Max 11 (Silk) and on her iPhone (opened from the Home Screen): local notification, push now, push in 20 s with the app closed | https://chatchiu-zeta.vercel.app/diagnostics | Reports + "banner appeared?" recorded with `record_decision`; outcome A/B decides step 5.9 | 5.9 |
| 7.0.3 | 0.6 | Remove the diagnostics spike after 7.0.2: delete `api/diagnostics.ts`, `api/__tests__/diagnostics.test.ts`, `apps/web/src/features/diagnostics/`, `apps/web/public/sw-diagnostics.js`, the gate in `apps/web/src/main.tsx` and `App.tsx`, and the `api/diagnostics.ts` entry in `vercel.json`; remove the Vercel env vars `DIAGNOSTICS_ENABLED`, `DIAG_VAPID_PUBLIC_KEY`, `DIAG_VAPID_PRIVATE_KEY`, `DIAG_VAPID_SUBJECT`; redeploy without `VITE_ENABLE_DIAGNOSTICS` | listed files; Vercel project `chatchiu` | `/diagnostics` and `/api/diagnostics` return the shell / 404 | 5.8 |
| 7.0.4 | 0.4 | Add the API's env vars to the new Vercel project `chatchiu`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` (+ optional `AI_QUOTA_*`, `VAPID_*`). The CLI can't copy them from the old project, so set them in the dashboard. | Vercel dashboard | `GET /api/health` returns 200 on the new URL | 4.1 (first deploy that calls the API) |
| 7.0.5 | 0.4 | Set the new project's Node.js version to 24.x (it shows 26.x; `package.json` engines pins 24.x) | Vercel project settings | Build log shows Node 24 | Cutover |
| 7.0.6 | 0.5 | ~~Create the GitHub repository, add it as `origin` and push~~ ✅ Done 2026-11-16: `main` pushed straight (user's choice, no PR); CI run 44003353164 on `5273c69` is green in every job (lint, typecheck, unit, additive check, build, budget, pgTAP, API integration, e2e, audit) | `.github/workflows/ci.yml` | A PR shows every CI job passing | 2.3 (migrations should run through CI) |
| 7.0.7 | 0.7 | Optional live check of F-MP-05 on the old app: plan a meal with a new typed name and see whether it appears under Recipes | — | F-MP-05 row notes the live result | 5.6 |
| 7.0.8 | 0.2 | ✅ Done 2026-11-16: production is Postgres 17.6.1.127; `supabase/config.toml` `[db] major_version` set to 17 | `supabase/config.toml` | Matches the dashboard's version | 2.3 |
| 7.0.9 | 0.8 | Give this machine's Supabase CLI access to the app's project (the current login can't see it), then `supabase link` (local files only) | `supabase/.temp/` (gitignored) | `supabase projects list` shows the project | Cutover step 1 (backup) and step 2 (`db push`) |
| 7.0.10 | 0.2 | Account for the hand-run `make-categories-editable.sql` from the old repo (production category data differs from the migration seed). **Spec half done in 1.2**: `SPEC-DATA-001` NC-DATA-NO-SEEDED-CATEGORIES + AC-DATA-07, and constitution rules AR-NO-SEED-ASSUMPTIONS / CS-NO-SEEDED-CATEGORIES. **Test half done in 2.1** (2026-11-16): `api/__tests__/integration/global-setup.ts` converts the local seed the way the hand-run script did, every test creates its own categories, and `no-seeded-categories.test.ts` was RED on a seeded DB and GREEN after conversion. Left: nothing. | `SPEC-DATA-001.yaml`; `api/__tests__/*`, `packages/contracts` tests | Contract and integration tests pass on a DB with no `is_system` categories | 2.1 |
| 7.0.12 | 2.1 | `api/` now imports the workspace packages `@chatchiu/contracts` (and from 2.2 `@chatchiu/domain`) as TypeScript source. Mitigated in 2.1: each package compiles to `dist/` (`tsconfig.build.json`), `exports` sends plain Node to `dist/index.js` (`types`/`development` stay on `src`), and root `npm run build` (the Vercel buildCommand) builds the packages first; plain `node` was checked to load `dist`. **Preview deployed 2026-11-16** (go-ahead given): the build passes and the function loads both packages (it fails later, at `env.ts`, on the missing `SUPABASE_URL`, i.e. 7.0.4). Left: after 7.0.4, `GET /api/health` and one signed-in route answer 200 on a preview. | `packages/*/package.json`, root `package.json`, `vercel.json` | Preview URL: health and `GET /api/categories` return 200 | 4.1 (first deploy that calls the API) |
| 7.0.11 | 1.3 | Check that Vercel Schedules are available to the `chatchiu` project on Hobby (hourly, IANA timezone, how the target route is authenticated). If not, use the fallback in architecture.md §6 (one daily cron at a fixed hour) and update `SPEC-NT-001` and `SPEC-API-001` | Vercel dashboard / CLI (read-only) | Decision recorded with `record_decision`; specs updated if the fallback is used | 5.8 |
| 7.0.13 | 2.4 | Hardening left over from the step 2.4 security/type review (none exploitable across users): (a) the router trusts `?__path=` / `?path=`; derive the path from the rewrite only; (b) column-level grants so users can't write internal columns (`last_expiry_reminder_on`, `low_stock_notified_at`, `channel`) through PostgREST; (c) cap push subscriptions per user (~20); (d) per-user rate limits on the write routes; (e) upper bounds on the **old** schemas' numbers and strict path-id parsing in the old routes (a tightening of old-route input, so decide deliberately); (f) a retention prune for `push_failures`. ~~(g) low-stock quiet hours~~: decided 2026-11-16, no waiting; they go out in the next hourly run, to be tried in real use | `api/handler.ts`, `supabase/migrations/0018_*.sql`, `packages/contracts/src/fields.ts`, `api/_routes/cron/check-expirations.ts` | `security-reviewer` pass with no open MEDIUM; tests for each | 6.5 (security hardening) |
| 7.0.14 | 3.3 | Try the installed PWA on her Fire Max 11 (Silk) and her iPhone (Home Screen): install, reload with the network off (the shell must open), and see the "New version available · Reload" prompt after the next deploy | Preview URL (after 7.0.4) | Each check noted with `record_decision` | Cutover |
| 7.0.15 | 3.3 | Decide how to keep the initial JS under 150 KB once the board, TanStack Query and Supabase arrive. After 3.3 it is 117.3 KB gz: React DOM ~67, React Router ~32, React Aria's button stack ~13, workbox-window ~2. Options from the step 3.3 react review: lazy-load the Supabase client and the update prompt, keep React Aria overlays in route chunks, or declarative React Router (about 10 KB smaller, no route-level lazy or loaders) | `apps/web/src/routes.tsx`, `apps/web/src/core/*`, `scripts/check-bundle-budget.mjs` | Decision recorded with `record_decision`; `npm run check:budget` stays green through 5.1 | 4.1 (first heavy dependency) |
| 7.0.16 | 3.4 | The browser-bar `theme-color` meta tags in `apps/web/index.html` follow the device's light/dark setting, not the in-app theme override (F-SE-06). When the Settings theme control lands, set one `theme-color` meta from JS to match the chosen theme | `apps/web/index.html`, `features/settings/AppearanceSection.tsx` | Picking Dark with the device in light mode turns the browser bar dark (e2e) | 5.8 |

Later phases append their own leftovers to this table the same way.

### 7.1 onward: parallel run and cutover

See [migration-cutover.md](migration-cutover.md).
