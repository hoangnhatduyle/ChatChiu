# Migration and cutover

Goal: she switches to the new app without losing anything, and the old app keeps working as a safety net until we are sure.

## Principles

1. **One database, two apps.** The old and new apps both talk to the same Supabase project (D2).
2. **Additive-only schema changes while the old app is live.**
   - New functions, tables and columns only; nothing renamed or dropped.
   - The old `dashboard_summary()` is left as it is (the new app uses `dashboard_summary_v2()`).
   - Enforced by a CI check in `scripts/check-additive-migrations.mjs`, which fails on `drop`, `rename` or `alter … type` in migrations ≥ 0012.
3. **Same data semantics.** Price stays per unit and quantities stay as `quantity` / `initial_quantity` / `current_quantity`, so either app can edit the same item safely.
   - The new app treats a missing `initial_quantity` / `current_quantity` as `quantity` (the old app's fallback); it does not rewrite existing rows.
4. **Only one sender of notifications at a time** (see Step 3).

## Steps

| Step | What | Done when |
|---|---|---|
| 1. Back up | Run `supabase db dump` (schema + data) and `supabase storage` export of `inventory-images`, stored outside the repo | The dump file restores into a local Supabase |
| 2. Apply new migrations to production | `supabase db push` with 0012–0017, **after** they have passed locally together with the old app's API tests | The old app still works (smoke test: board loads, drag usage, add item, shopping tick) |
| 3. Parallel run (about 1–2 weeks) | New app on its **own new, permanent Vercel project** (D16). She adds it to the iPhone Home Screen next to the old icon and installs the Fire APK; she uses it as the main app on the Fire and her phone; the old app is still reachable. **The new app's send job (Schedule or cron) stays disabled**, so the old cron keeps sending the expiry push to the phone. The Fire shell's local reminders are on. | No data problems reported; every feature-inventory row ticked in real use |
| 4. Move notifications to the new app | Enable the new app's send job (a Vercel Schedule, or the fallback cron in `vercel.json`; see architecture.md §6) and redeploy. In the **old** project, remove its cron (or change its `CRON_SECRET`) so only one app sends. On the iPhone: enable notifications in the new Home Screen app (new URL = new subscription). The same VAPID keys can be reused. On the Fire: the APK's on-device reminders are already on. | A test push arrives on the iPhone from the new app; the Fire shows a test reminder with the app closed; the old cron no longer runs |
| 5. Switch her over | Remove the old Home Screen icon from the iPhone and the old bookmark on the Fire. The new URL and the APK are now the only way in. | She uses only the new app for a few days with no problems |
| 6. Rollback plan | The old Vercel project is **still deployed** and points at the same database. Because every database change was additive, she can just open the old URL again. | Old URL checked once after the new migrations are applied (cutover step 2) |
| 7. Retire the old app | After 30 quiet days, and only with your go-ahead: delete the old Vercel project (`inventory-tracking-app-five`), archive the `Inventory_Tracking_App` repo, and optionally clean up unused DB objects (`dashboard_summary()`) in a later migration | Old project deleted; harness `record_decision` logged |

## Data that is not touched

- `item_images` rows and bucket files.
- `barcode_mappings`.
- `ai_usage_log` (quotas continue across both apps; it is the same table).
- Existing `push_subscriptions` rows. The old cron never cleans up dead subscriptions (`api/_lib/push.ts` ignores 404/410). The **new** cron deletes a subscription when the push service answers 404 or 410, so old-origin endpoints disappear by themselves after cutover.
