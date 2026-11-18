# Architecture

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Web app | **React 19 + Vite** (single-page app, lazy-loaded routes), **React Router**, React Compiler on | Every screen is being redesigned anyway, and the reusable logic moves into framework-free `packages/domain`. So the old Angular code isn't what decides the framework. React gives a smaller baseline bundle than Angular and the **stable** TanStack Query adapter (the Angular one is experimental). It also has the best tooling for this repo's review and e2e agents. Chosen 2026-11-16 because the user wants "whatever makes it fastest and smoothest". |
| Server data | **TanStack Query (React, stable)** + `@tanstack/query-sync-storage-persister` / IndexedDB persister, wrapped in our own hooks (`apps/web/src/data/*`) | Caching, background refresh, updates shown before the server confirms (with rollback), retries, offline queue and cache saved on the device, without building that ourselves |
| UI | **Tailwind CSS v4** reading our design tokens + **React Aria Components** (accessible slider, dialog, popover, list box, date field; touch-friendly) + our own components; `@tanstack/react-virtual` for long lists; `@dnd-kit` for meal drag-and-drop | Accessible primitives with zero visual opinion, so the Fresh Ledger look is entirely ours |
| Fonts | **Inter Tight** (UI) + **IBM Plex Mono** (numbers), self-hosted with `@fontsource` | Matches Fresh Ledger; Inter Tight includes Vietnamese; self-hosting keeps the strict CSP (`font-src 'self'`) |
| API | **Vercel serverless**, still a single router function (`api/handler.ts`, Hobby plan limit) | Proven setup; we port it and fix its bugs instead of rewriting it |
| Database | **Supabase** (same project, D2): Postgres + RLS + Auth + Storage + **Realtime** | Realtime adds live sync between devices on the shared login (F-KB-16) |
| Shared code | `packages/contracts` (zod schemas + TS types) and `packages/domain` (pure logic) | The web app and API cannot drift apart again (the old app had two definitions of "low stock") |
| Tests | Vitest (unit), Playwright (e2e at **1280×800 tablet** and **390×844 phone**, light + dark), local Supabase for integration | Matches the global testing rules |
| Fire tablet notifications | **Capacitor Android shell** sideloaded on the Fire, using **local notifications**. Decided after a spike on the real device (§6). | Web push cannot work on Fire OS |

## 2. Repo layout (npm workspaces)

```text
ChatChiu/
├── apps/
│   ├── web/                         React + Vite app
│   │   ├── src/
│   │   │   ├── core/                api-client, auth, supabase client, toast+undo, offline, realtime, errors
│   │   │   ├── data/                query-client config + one hooks module per domain
│   │   │   │   ├── inventory.ts   locations.ts   categories.ts   shopping.ts   meals.ts
│   │   │   │   └── recipes.ts     waste.ts       stats.ts        ai.ts         preferences.ts
│   │   │   ├── ui/                  design-system components (Button, Chip, UsageSlider, ResponsivePanel,
│   │   │   │                        Toast, Field, Select, DateField, Segmented, EmptyState, Skeleton, Icon)
│   │   │   ├── shell/               AppShell, NavRail (tablet), BottomNav (phone), UpdatePrompt
│   │   │   ├── features/
│   │   │   │   ├── kitchen-board/   item-panel/   inventory/   item-form/   receipt-scan/
│   │   │   │   └── shopping/        meals/        stats/       settings/    auth/
│   │   │   ├── styles/              tokens.css  base.css  fonts.css
│   │   │   ├── routes.tsx  main.tsx
│   │   └── e2e/                     Playwright specs + fixtures
│   └── fire-shell/                  Capacitor Android project (only if the §6 spike confirms it)
├── api/                             Vercel functions, ported from the old app (must stay at the repo root)
│   ├── handler.ts   _lib/   _routes/
├── packages/
│   ├── contracts/                   zod request/response schemas, shared TS types
│   └── domain/                      expiry status, % left, quantities, run-out, recipe matching, units
├── supabase/
│   ├── migrations/                  0001–0011 copied VERBATIM from the old repo + new 0012+
│   └── seed.sql                     test-only seed for local Supabase
├── docs/plan/                       this plan
└── .claude/                         harness governance (specs, workflows, constitution overrides)
```

## 3. Data and sync: making loading and updating smooth

Problems in the old app:

- On the dashboard it calls `getItems()` 2–3 times, plus locations, categories and the dashboard summary, all one after another.
- After **every** action it reloads everything (`loadData()`).
- It shows a full-page spinner, and any write fails when offline.

### 3.1 Reads

1. **One boot request**: `GET /api/bootstrap` returns items, locations, categories and the summary in a single round trip. It is served by `inventory_snapshot()` (one SQL call).
2. **Instant first paint**: the last snapshot is kept on the device in IndexedDB (TanStack persist). When the app opens, the board shows immediately from that snapshot and **refreshes quietly in the background**, without a spinner. A small "Updated just now" note appears only if the data was stale.
3. **Refresh when it matters**: when the tab or app comes back to the foreground, when the network reconnects, and on **pull-to-refresh** on the phone.
4. **Live sync**: a Supabase Realtime subscription on `inventory_items`, `shopping_list` and `meal_plans` (RLS-filtered) applies changes made on another device straight into the cache.
5. **Prefetch**: when the browser is idle after boot, fetch this week's meal plan and the shopping list so those pages also open instantly.
6. **Skeletons that match the final layout** (no layout shift). They appear only when there is truly no cached data, i.e. the very first visit.

### 3.2 Writes (one pattern for every change)

```text
tap/drag ──► update the on-device cache immediately (UI shows the new value)
         ──► send the request (with retry)
         ──► success: replace with the server's row (reconcile)
         ──► failure: roll back the cache + toast "Couldn't save · Retry"
         ──► offline: queue it; badge "1 change waiting to sync"; send when back online
```

### 3.3 Undo: two kinds

| Kind | Used for | How |
|---|---|---|
| **Commit now, reverse on Undo** | usage change, move location, restock, favourite, tick purchased | The server saves immediately. Undo sends the reverse change. For usage, `undo_item_usage(usage_id)` deletes that history row and restores the quantity, so history stays clean. |
| **Hold until the toast closes** | move to waste, remove, delete, clear purchased, delete meal | The item disappears from the UI immediately, but the server call waits for the 5 s Undo window. Leaving the page or hiding the app sends it right away (`fetch keepalive`), so nothing is lost. |

### 3.4 API and database changes (all **additive**: the old app keeps working, D2)

New migrations in `supabase/migrations/`:

| File | Adds | Fixes |
|---|---|---|
| `0012_log_item_usage.sql` | `log_item_usage(item_id, new_current, notes)`: inserts the history row **and** updates `current_quantity` in one transaction, and returns the item plus a `crossed_low_stock` flag. Also `undo_item_usage(usage_id)`. | Old usage route wrote the history row first and then updated the item, and could fail between the two (non-atomic) |
| `0013_inventory_snapshot.sql` | `inventory_snapshot()` for `/api/bootstrap`; `dashboard_summary_v2()` with the **%-based** low-stock rule and **price × current** stock value | F-ST-05, F-ST-06 (the old `dashboard_summary()` is left untouched for the old app) |
| `0014_consumption_stats.sql` | `item_consumption(item_id)` and a per-user batch version: average daily use over the last 30 days → predicted run-out date | F-KB-10, F-ST-06 |
| `0015_ensure_recipe.sql` | `ensure_recipe(name)` → `insert … on conflict (user_id, lower(name)) do nothing` | F-MP-05 |
| `0016_notification_prefs.sql` | `user_preferences` table (timezone, notify hour, expiry alerts on, low-stock alerts on, theme, `last_expiry_reminder_on`); `inventory_items.low_stock_notified_at`; `push_subscriptions.channel` (§6); `push_failures` table (send failures, owner-readable) (decided 2026-11-16, Phase 2) | F-NT-01…03 |
| `0017_bulk_ops.sql` | `create_items(jsonb)`, `delete_items(bigint[])`, `clear_purchased(bigint[])` (only the ids purchased when she tapped; decided 2026-11-16) | F-RS-09, F-IN-10, F-SL-04 |

New or changed API routes under `api/_routes/`:

- **New:**
  - `bootstrap.ts`
  - `inventory/bulk.ts` (POST create many / DELETE many)
  - `inventory/[id]/restock.ts`
  - `inventory/[id]/usage-undo.ts`
  - `shopping-list/clear-purchased.ts`
  - `recipes/suggestions.ts`
  - `stats/overview.ts`
  - `preferences.ts`
- **Changed:**
  - `inventory/[id]/usage.ts` → uses the RPC
  - `waste/index.ts` → joins the category name
  - `meal-plans/index.ts` → `ensure_recipe` RPC; 409 returns the existing id so the UI can offer Replace
  - `cron/check-expirations.ts` → user timezone (UTC when she has no preferences row), at most one expiry run per local day (`last_expiry_reminder_on`), low-stock pass, writes `low_stock_notified_at`, deletes 404/410 subscriptions and records failures in `push_failures`
  - `categories/[id].ts` → deleting a category still used by items answers 409 CONFLICT instead of 500 (AC-DATA-14; added 2026-11-16, Phase 2)
  - `recipes/index.ts` → POST inserts instead of upserting on `(user_id, name)`, which matched no constraint and failed every create with 42P10; a duplicate name (any case) answers 409 CONFLICT (found by the step 2.3 regression suite, fixed in 2.3 at the user's request, 2026-11-16)

Response envelope: keep the old app's shape, since the old frontend depends on it: success is `{ data: … }` and errors are `{ error: { code, message, details? } }` (`api/_lib/errors.ts`). New routes use the same wrapper (decided 2026-11-16, Phase 1).

## 4. Design system

- **Tokens** in `apps/web/src/styles/tokens.css`. These are the light (Fresh Ledger, from the prototype) and dark (Fresh Ledger Dark, its inverted counterpart; replaced Night Kitchen on 2026-11-17, D5) palettes:

  ```text
  --bg, --surface, --ink, --muted, --line, --hair, --accent, --accent-ink, --track, --fill, --low,
  --status-{expired,today,soon,ok}-{bg,fg}
  ```

  - Dark mode applies when `@media (prefers-color-scheme: dark)` matches, or when `[data-theme="dark"]` is set by the Settings override.
- **Spacing and type scale**, with radius 14/8 px. Every touch target is ≥ 44 px.
- **Components** (`apps/web/src/ui/`):
  - `UsageSlider`: built on React Aria `Slider`, accessible by keyboard, with the down-only mode, the 4 px accidental-tap guard and 5% steps
  - `ExpiryChip`, `Chip`, `Button`, `IconButton`, `Segmented`, `Field`, `Select`, `DateField` (with quick chips)
  - `ResponsivePanel`: a side panel on the tablet and a bottom sheet on the phone (React Aria `Modal`/`Dialog`)
  - `Toast` (Undo / Retry / action buttons), `EmptyState`, `Skeleton`, `Icon` (inline SVG set)
- **Layout**:
  - Below 768 px: bottom nav.
  - From 768 px: a 84 px nav rail.
  - Board columns: up to 4 visible on the Fire in landscape; scrolls sideways with snapping when there are more locations; portrait shows 2.
- **Motion**: 150–250 ms transform/opacity only; turned off under `prefers-reduced-motion`.
- **Accessibility**: WCAG 2.2 AA contrast (checked for both palettes); expiry status always has a text label, never colour alone; focus rings drawn by us.

## 5. Performance budgets (checked in CI)

| Metric | Target |
|---|---|
| Initial JS (shell + board route), gzipped | ≤ 200 KB (150 until step 5.1, 170 until step 5.6; raised to 200 by the user on 2026-11-18 when the initial JS reached 171.4 KB; trimming is in step 6.1) |
| Each lazy route, gzipped | ≤ 120 KB |
| LCP on the Fire Max 11, cold (no cache) | < 2.5 s |
| Board visible on the Fire, warm (cached snapshot) | < 1 s |
| Drag → bar updates | next frame; the save never blocks the UI |
| INP | < 200 ms |
| CLS | < 0.1 |

## 6. Notifications (D10: must work on the Fire tablet)

**Why it never worked on the Fire.**

- Chromium-based browsers deliver web push through Google's FCM service ([Chrome developer blog](https://developer.chrome.com/blog/push-notifications-on-the-open-web)).
- Fire OS has no Google Play Services, and without them push registration does not happen ([Braze troubleshooting](https://www.braze.com/docs/developer_guide/push_notifications/troubleshooting)).
- A PWA vendor states that Fire OS does not support web push at all ([Progressier](https://intercom.help/progressier/en/articles/9327962-does-fire-os-support-pwa-installation-and-push-notifications)). That is a vendor claim, so Phase 0 confirms it on her device.
- Separately, the git history shows three "Notification bug fix" commits on 2026-08-06, right after the move from an APK to the web.

**Plan.**

1. **Phase 0 spike on the real Fire Max 11.**
   - Open a diagnostics page (`/diagnostics`, dev builds only) in Silk.
   - It reports `serviceWorker`, `PushManager`, `Notification.permission`, and the result of a real subscribe → send → receive test.
   - Outcome A (unexpected): it works → keep web push only.
   - Outcome B (expected): it fails → step 2.
2. **Fire tablet: Capacitor Android shell** (`apps/fire-shell/`).
   - It is the same web build, wrapped as an APK and sideloaded (approved 2026-11-16), the way the app originally shipped.
   - App updates: the shell bundles the web build. On launch it checks `/version.json` on the live site and downloads the new bundle when one exists, so web updates reach the tablet without reinstalling the APK. Only changes to the native shell need a new APK. Approach confirmed in step 5.9.
   - Notifications are **scheduled on the device** with `@capacitor/local-notifications`, so no Google services are needed:
     - Every time the data syncs (boot, foreground, Realtime event), the app re-schedules one reminder per item at `expiry − days_before`, at the hour she picked, grouped per day.
     - A periodic background sync (`@capacitor/background-runner`, every ~6 h) keeps the schedule fresh even if the app hasn't been opened.
     - Low-stock alerts fire immediately on the device where usage was logged. Changes made on the phone reach the tablet at its next sync.
3. **Her iPhone: web push**, which works only when the app is **added to the Home Screen** from Safari (iOS 16.4+); push is not available in a normal Safari tab. Settings detects a plain tab and shows the "Share → Add to Home Screen" steps. The cron sends both expiry and low-stock pushes. The new URL means a fresh subscription. The old iPhone setup **never delivered** (D17), so before reusing anything, Phase 0 step 0.8 finds out why.
4. **No duplicates.** Each device registers its channel (`web-push` or `local`) in `push_subscriptions` (an additive `channel` column). The cron only pushes to `web-push` devices; the Fire handles itself.
5. **When the server sends.** Vercel Hobby crons run once a day, in UTC, at any minute within the hour, so they can't honour a picked notify hour. The send job is triggered instead by a **Vercel Schedule** (Hobby: as often as every 15 min, IANA timezone): it runs hourly and pushes to each user whose local notify hour has arrived and who hasn't had today's reminder (decided 2026-11-16, Phase 1). Availability is checked in roadmap 7.0.11; if Schedules aren't available, the fallback is one daily cron at a fixed hour derived from her timezone, with the time shown read-only in Settings.
6. **Settings → Notifications** shows this device's status, a test button, her timezone and notify hour, and the expiry/low-stock toggles.

**Fallback if sideloading is unacceptable:** a daily email digest through Supabase/Resend, plus an in-app "Today" banner. This is listed in open-questions.md.

## 7. Security (carried over and kept)

- RLS on every table; the API uses a client bound to the user's JWT.
- The service role is used only by the cron.
- Every request body is validated with zod.
- AI quotas are enforced in SQL before the OpenAI call.
- Receipt MIME sniffing.
- Strict CSP: add `wss://*.supabase.co` for Realtime.
- HSTS and the other security headers.
- No secrets in the repo: `.env.example` only; Vercel environment variables hold the real values.
