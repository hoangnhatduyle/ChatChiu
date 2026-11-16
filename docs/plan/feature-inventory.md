# Feature inventory and parity checklist

Built by reading every screen, service, API route and migration in
`../Inventory_Tracking_App` (commit `0ffa57b`, 2026-09-30).

The **Today** column comes from reading the code, not from running the app. Status can be:

- ✅ the code path looks complete and correct;
- ⚠️ it works, but has a bug, inconsistency or rough edge;
- ❌ it is a placeholder that does nothing, or the code is broken;
- 🙈 hidden in the new app by decision D3.

Statuses marked *(suspected)* still need a quick manual check on the live app (roadmap Phase 0).

Each ID (`F-xx-nn`) becomes an acceptance criterion in the matching spec under `.claude/specifications/`.

---

## 1. Sign-in and account (old: `components/login`, `core/supabase-auth.service.ts`, `guards/auth.guard.ts`)

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-AU-01 | Sign in with email and password (Supabase Auth) | ✅ | Same. The session persists, so the tablet stays signed in. |
| F-AU-02 | Register (password ≥ 12 characters, confirm password, email confirmation if Supabase requires it) | ✅ | Same. Rarely used because of the shared login (D11). |
| F-AU-03 | "Forgot password": send a reset email | ⚠️ The email sends, but the link lands on `/login` and **nothing lets you set a new password** (`updatePassword()` is never called) | New `/reset-password` page catches Supabase's `PASSWORD_RECOVERY` event and sets the new password |
| F-AU-04 | Session expired: any `401` from the API signs out and shows "Your session expired" | ✅ | Same. Supabase refreshes tokens silently first, so this should be rare. |
| F-AU-05 | Every page except login requires sign-in | ✅ | Same (functional route guard) |
| F-AU-06 | Sign out (also unsubscribes this device from push) | ✅ | Same. Only **this device's** notification registration is removed, because other devices share the login. |

## 2. Kitchen board (old: `components/dashboard`, Board view)

The main screen and the one she uses most. Layout approved in the prototype (D6).

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-KB-01 | One card/column per location (with sub-location as "Fridge - Top shelf"), listing **every** item stored there | ⚠️ **Items whose location was deleted vanish from the board**: they are grouped only into existing locations | Same columns. A **"No location"** column appears whenever such items exist. |
| F-KB-02 | Items sorted by expiry date inside each location | ✅ | Same (soonest first, then name) |
| F-KB-03 | Expiry status per item (expired, expiring ≤3 days, fresh) | ⚠️ An icon only, with the date as "MMM d" | A chip with words: **Expired / Today / 2d / 3 mo**. Colour is never the only signal. |
| F-KB-04 | Drag the usage bar to log how much is left (5% steps, can only go **down**, taps under 4 px ignored) | ⚠️ Works, but **every drag opens a confirm dialog** | Saves on release and shows an **Undo toast** (D6). Same 5% steps, the same ignore-accidental-tap rule, and still down-only on the board. |
| F-KB-05 | Percentage badge plus remaining quantity ("0.6 / 1 L"); tapping the quantity opens Track usage | ✅ | Shows the % and "0.6 of 1 L". Tapping the name opens the **quick-action panel** (F-QP). |
| F-KB-06 | Item menu: Edit, Track usage | ✅ (only 2 options) | Replaced by the quick-action panel (F-QP), which covers both and more |
| F-KB-07 | Low stock at ≤20% changes the bar colour (critical ≤10, warning ≤20) | ✅ | Same thresholds, using the item's own `low_stock_threshold` (default 20) |
| F-KB-08 | When an item hits 0%: dialog asks Refill or Remove | ⚠️ Refill is confusing (user) | Toast: **"Milk used up · Add to shopping list · Remove"** (D8). The item stays visible at 0% (greyed out) until she chooses. A **"Used up"** filter chip shows any left there. |
| F-KB-09 | Low-stock notification when dragged to ≤20% | ❌ `checkAndNotifyLowStock()` is empty | Real low-stock alert (F-NT-03) |
| F-KB-10 | "Running low" section under the board: name, %, current/initial, **usage per day**, **predicted run-out** | ❌ The rate and run-out are hard-coded to `null`, so only %/qty show | The **Running low** filter chip on the board, plus run-out shown in the quick panel ("~4 days left at your pace"). Calculated from usage history in SQL, with **no AI and no API cost** (F-ST-06). |
| F-KB-11 | One-time tip: "drag any usage bar…" (dismiss is remembered) | ✅ | Same, as an inline hint on first use |
| F-KB-12 | Greeting, Add item, View all, Shopping list buttons | ✅ | Header: title + date, search, filter chips (**All · Use soon · Running low · Used up**), **Scan receipt**, **+ Add item**. A **+** on each location adds straight into that location. |
| F-KB-13 | Board / Stats toggle | ✅ | Stats move to **Waste & Stats** (D7) |
| F-KB-14 | Empty state: "No items yet · Add first item" | ✅ | Same, redesigned |
| F-KB-15 | (new) Search filters the board in place, keeping the columns | n/a | The prototype's behaviour |
| F-KB-16 | (new) Live updates between devices on the shared login | n/a | Changes made on the phone appear on the tablet within seconds (Supabase Realtime) |

## 3. Quick-action panel (new; replaces the usage dialog, refill dialog and item menu)

Opens as a **side panel on the tablet** or a **bottom sheet on the phone**, from the board, the inventory list and search results.

| ID | Action | Old equivalent | Notes |
|---|---|---|---|
| F-QP-01 | Big slider, can go **up or down** (to fix mistakes) | Update-usage dialog slider | Saves on release, with Undo |
| F-QP-02 | Quick buttons: **Used 10% · Used 25% · Used half · Used it all** | "Mark as empty" button | |
| F-QP-03 | Exact amount: "Used ___ g" or "Left ___ g" with an optional note | Update-usage dialog inputs + notes | Notes are stored in `usage_history.notes`, as today |
| F-QP-04 | **Add to shopping list** (name, "full amount + unit", note "Low stock (x% left)", category) | Usage dialog "Add to shopping list" | **De-duplicates**: if it's already on the list unpurchased, says "Already on your list" (old app added duplicates) |
| F-QP-05 | **Move to waste** (logs to the waste log, removes the item) | Inventory list "Mark as wasted" (browser `confirm()`) | No confirm; Undo toast. The server call is held back until the Undo window closes. |
| F-QP-06 | **Restock** ("I bought this again"): pre-filled with the item's last full amount, plus an optional new expiry date (AI suggestion available) and price. One tap refills the **same** item to 100%. | Refill dialog (add/replace modes) | **One simple mode** (D13). Sets quantity = initial = current; does not create a second item. Any leftover is treated as part of the new amount, so she just enters what's there now. |
| F-QP-07 | **Stored in**: move to another location | Only via full edit | Saves immediately, with Undo |
| F-QP-08 | Run-out prediction + recent usage history (last 5 entries) | `GET /inventory/:id/usage` existed, but the UI never showed it | New, read-only |
| F-QP-09 | "Recipes that use this" when the item expires within 3 days | — | From recipe suggestions (F-MP-12) |
| F-QP-10 | **Edit all details** → item form; **Delete** (with Undo) | Edit / Delete | |

## 4. Inventory list (old: `components/inventory-list`)

The secondary "everything" view: a table on the tablet, cards on the phone.

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-IN-01 | Search name, notes and barcode | ✅ | Name and notes (barcode is hidden by D3) |
| F-IN-02 | Filter by category, location and status (all / expired / expiring ≤3d / fresh) | ✅ | Same. Filters live in the **URL**, so Back keeps them and a refresh doesn't lose them. |
| F-IN-03 | Sort by expiry, name, quantity or recently added | ✅ | Same |
| F-IN-04 | Group by none, category or location | ✅ | Same |
| F-IN-05 | Card view vs table view (switches automatically at 1024 px, can be overridden) | ✅ | Same breakpoint, with the choice remembered |
| F-IN-06 | Paginate 20 per page | ✅ | Virtual scrolling instead (smooth, no paging) |
| F-IN-07 | Expired / expiring-soon counters that act as quick filters | ✅ | Same |
| F-IN-08 | Drag usage bar on cards (confirm dialog) | ⚠️ | Same as F-KB-04 (Undo toast) |
| F-IN-09 | Per item: Edit, Update usage, Refill, Mark wasted, Delete, View image | ✅ / 🙈 image | Tap the row → quick-action panel. Image is hidden. |
| F-IN-10 | Select mode: select all/none, **delete selected** | ✅ | Same, plus Undo. Uses one bulk request (old: one request per item). |
| F-IN-11 | Mark-as-wasted value = per-unit price × remaining | ✅ math correct | Same, shown in the waste toast |
| F-IN-12 | Scan barcode to search | 🙈 | Hidden (D3) |
| F-IN-13 | Scan receipt button | ✅ | Same |
| F-IN-14 | Filter state saved between visits (`localStorage`) | ✅ | URL + remembered last state |

## 5. Item form, add and edit (old: `components/item-form`)

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-IF-01 | Name (required) | ✅ | Same, plus autocomplete from existing item names |
| F-IF-02 | Category (required) via bottom-sheet picker; can add a new category inline | ✅ | Same picker style (sheet/popover) |
| F-IF-03 | Location (required) via picker; can add a new one inline | ✅ | Same. Pre-filled when started from a location's **+** on the board. |
| F-IF-04 | Quantity (> 0) + unit (piece, kg, g, lb, oz, L, ml, gallon, cup, box, can, bottle, bag, pack) | ✅ | Same list |
| F-IF-05 | Purchase date (defaults to today) | ✅ | Same |
| F-IF-06 | Expiry: a date picker **or** "in N days/weeks/months/years" from the purchase date (month = 30 days, year = 365) | ✅ | Same, plus quick chips (3d · 1w · 2w · 1m · 3m · 6m · 1y) |
| F-IF-07 | Expiry cannot be before purchase date | ✅ | Same, shown as an inline error (not a snackbar) |
| F-IF-08 | **AI expiry suggestion** (OpenAI; monthly quota; "accept" dialog with days + note) | ✅ | Same; it fills the field with an inline "Suggested: 7 days — keep refrigerated" and an Undo link |
| F-IF-09 | Price: entered as the **total**, stored **per unit** (`price / quantity`); edit shows the total again | ✅ | Same semantics (the existing data depends on it) |
| F-IF-10 | Notes | ✅ | Same |
| F-IF-11 | Expiry notifications on/off (days-before fixed at 3) | ✅ | Same toggle; days-before becomes editable under "More options" (the column already exists) |
| F-IF-12 | Edit mode keeps initial/current quantities | ⚠️ **Changing "quantity" while editing doesn't change what's left**, which looks like a bug to the user | Edit shows **"Full amount"** (initial) and **"Left now"** (current) explicitly |
| F-IF-13 | Photo (camera/gallery, one primary image) | 🙈 | Hidden (D3). Existing photos stay in storage untouched. |
| F-IF-14 | Barcode scan + "learn" mapping (prefills next time) | 🙈 | Hidden (D3). `barcode_mappings` data stays untouched. |
| F-IF-15 | Low-stock threshold | Not in the UI (DB default 20) | Under "More options" |
| F-IF-16 | Save → snackbar → go back | ✅ | Save → the item appears immediately where you came from (no reload), with a toast |

## 6. Receipt scan (old: `components/receipt-scan`, 2,166 lines)

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-RS-01 | Take a photo or choose from the gallery; shrink large images before upload | ✅ (fixed in Mar/Sep commits) | Same: compressed on the device before upload |
| F-RS-02 | Upload to a private bucket (`<uid>/receipts/<uuid>.jpg`) through a signed URL | ✅ | Same API |
| F-RS-03 | AI reads the items (name, qty, unit, line price, category hint, shelf-life hint); monthly quota; friendly errors for quota, busy and bad image | ✅ | Same |
| F-RS-04 | Receipt date sets the purchase date for every item | ✅ | Same |
| F-RS-05 | Per-item expiry default from category (dairy 14d, produce 7d, meat 3d, seafood 2d, frozen 90d, pantry 365d…) | ⚠️ **Ignores the AI's shelf-life hint**, and **ignores the AI's unit** (always "piece") | Uses the AI hint first, then the category default. Uses the AI's unit when it's in our unit list. |
| F-RS-06 | Default location = the first location | ⚠️ Falls back to a **hard-coded id 1**, which may not be hers | Falls back to the last-used location; if there is none, she must pick one |
| F-RS-07 | Review modes: **wizard** (one item at a time, skip/include) or **table** (inline cell editing) | ✅ | Keeps both: "one by one" on the phone, "table" on the tablet |
| F-RS-08 | Edit name, qty, unit, total price, category, location, purchase date, expiry (date or N units), notes, notify flag; AI expiry per item | ✅ | Same fields |
| F-RS-09 | Add selected items with a progress bar | ⚠️ One request per item, run one after another (slow) | **One bulk request**; the items appear on the board immediately |
| F-RS-10 | Done screen ("N items added") | ✅ | Same, plus "View on board" |

## 7. Shopping list (old: `components/shopping-list`)

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-SL-01 | Add an item: name (required), quantity (free text), notes | ✅ | Same; quick-add field always visible |
| F-SL-02 | Tick purchased / untick | ⚠️ Reloads the whole list after every tap | Instant tick, saved in the background |
| F-SL-03 | Delete an item | ✅ (reloads everything) | Instant, with Undo |
| F-SL-04 | Clear all purchased (with confirm) | ⚠️ One delete request per item | One bulk request, with Undo |
| F-SL-05 | Show/hide purchased; group by category; purchased items sink to the bottom | ✅ | Same |
| F-SL-06 | Export/share as text ("Shopping List:\n- Eggs (10)") via the share sheet, falling back to the clipboard | ✅ | Same |
| F-SL-07 | Items arrive from the inventory (low stock, used up) with category and note | ✅ | Same, de-duplicated (F-QP-04) |
| F-SL-08 | Pending / purchased counts | ✅ | Same |

## 8. Meal plan + recipe library (old: `components/meal-plan`, `recipe-manager`)

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-MP-01 | Weekly calendar: 7 days × breakfast/lunch/dinner; prev/next week; Today | ✅ | Same; on the tablet the whole week is visible |
| F-MP-02 | Monthly calendar; tapping a day jumps to that week | ✅ | Same |
| F-MP-03 | Add a meal to a slot: date, type, name (autocomplete from the library), notes | ✅ | Same |
| F-MP-04 | **One meal per slot** (database rule); adding to a filled slot returns "already planned" | ⚠️ The UI shows lists per cell, but the DB allows only one, so the error is confusing | One meal per slot. A filled slot offers **Replace**. |
| F-MP-05 | Free-text meal names are added to the recipe library automatically | ❌ *(suspected)* Server upsert uses `onConflict: 'user_id,name'`, but the only unique index is on `lower(name)`, so it fails silently | Fixed with an `ensure_recipe()` RPC (insert … on conflict do nothing) |
| F-MP-06 | Edit and delete a meal (delete has a `confirm()`) | ✅ | Edit; delete with Undo |
| F-MP-07 | Favourite (belongs to the meal, not the slot; new plans of a favourited meal inherit it) | ✅ | Same |
| F-MP-08 | Drag a meal to another slot = **copy** (with confirm) | ⚠️ Fails with an unhandled error if the target slot is filled | Copy on drop; a filled target asks Replace or Cancel |
| F-MP-09 | Recipe library tab ("Meals"): list, search name/ingredients, add/edit/delete (name, comma-separated ingredients, prep time, servings, instructions) | ✅ | Same |
| F-MP-10 | Summary tab: total meals, this week, streak, completion %, by type, top 5 meals, favourites, recent 10, monthly breakdown; tap to edit | ✅ | Same numbers, redesigned |
| F-MP-11 | `/recipe-manager` standalone route | ✅ (not in the nav) | Folded into Meal plan → Recipes |
| F-MP-12 | (D9) **Recipe suggestions**: recipes from her library whose ingredients match items expiring soon | ❌ `getRecipeSuggestions()` returns `[]` | Real matching. No AI and no API cost: ingredient words matched against names of items expiring within 3 days, ranked by the number of matches. Shown at the top of Meal plan and in the quick panel. |

## 9. Waste & Stats (old: `components/waste-tracking` + the dashboard Stats view)

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-ST-01 | Waste log list: name, qty, unit, value, date; delete an entry | ✅ | Same; delete with Undo |
| F-ST-02 | Filters: time range (week / month / year / all) and category | ⚠️ **Category names show "Unknown"** because the API never joins `categories` | Fixed |
| F-ST-03 | Totals: items wasted, value lost (price × qty) | ✅ | Same |
| F-ST-04 | Waste by month and by category | ✅ computed, barely shown | Two small charts |
| F-ST-05 | Dashboard stats: total items, expiring ≤7d, expired, **total value**, by category, by location, recently added, waste (30d) | ⚠️ **Total value adds up per-unit prices** (so 10 eggs at $0.40 count as $0.40) | Stock value = Σ price × **current** quantity (D9) |
| F-ST-06 | Low stock list with usage rate and run-out | ❌ The server's `dashboard_summary` treats the threshold as an **absolute amount** while the app treats it as **%**, and the rate is a stub | One definition everywhere: **% of the full amount ≤ threshold**. Rate = average daily usage over the last 30 days of `usage_history`. |
| F-ST-07 | "Most wasted items" | ❌ The server never returns it | Top 5 by count and by value |
| F-ST-08 | Quick actions card | ✅ | Dropped (the nav covers it) |

## 10. Settings (old: `components/settings`)

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-SE-01 | Locations: add / edit / delete (name + optional sub-location) | ⚠️ Delete warns "items will need to be updated", then they vanish from the board | Delete shows how many items are affected; they move to "No location" (F-KB-01) |
| F-SE-02 | Categories: built-in ones are read-only; add / edit / delete your own (name, icon, colour) | ✅ | Same |
| F-SE-03 | Notifications: enable / disable on this device, send a test | ⚠️ / ❌ on Fire | See section 11 |
| F-SE-04 | Export the inventory as CSV | ✅ | Same |
| F-SE-05 | Check for updates / refresh and empty the cache | ✅ | Automatic "New version — Reload" toast; manual "Reset app cache" kept |
| F-SE-06 | Dark/light mode | ❌ `ThemeService` exists but **no toggle is wired anywhere** | System / Light / Dark switch (D5) |
| F-SE-07 | Sign out | ✅ | Same (F-AU-06) |

## 11. Notifications

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-NT-01 | Daily expiry reminder: items expiring within each item's "days before" (default 3), at most once a day, grouped ("3 items expiring soon"), tap → inventory | ❌ **Never received on the iPhone** (Home Screen app, notifications on; reported 2026-11-16) and ❌ **on the Fire tablet**. Cause for the iPhone is unknown until step 0.8. | Works on **every device she uses**; see architecture.md, Notifications |
| F-NT-02 | Cron runs at 13:00 UTC and calculates "today" in **UTC** | ⚠️ The day can be off by one around midnight local time | Calculated in her timezone (Settings), sent at a time she picks |
| F-NT-03 | (D9) Low-stock alert when an item crosses its threshold | ❌ stub | "Butter is running low (15%)", at most once per item until it's restocked |
| F-NT-04 | Test notification | ✅ | Same, per device, with a status readout ("This device: notifications on ✓") |

## 12. App-wide

| ID | Meant to do | Today | New app |
|---|---|---|---|
| F-AP-01 | Installable app, works offline for reads (service worker, "freshness" cache on API reads) | ✅ reads / ❌ writes fail offline | Reads come instantly from the on-device cache; **offline changes queue and sync** when back online |
| F-AP-02 | Side drawer nav: Dashboard, Inventory, Meal Plan, Shopping List, Waste Tracking, Settings | ✅ | Tablet: nav rail. Phone: bottom bar (Kitchen · Stock · Shopping · Meals · More). |
| F-AP-03 | Snackbars for success / error; a global error dialog | ✅ | One toast system (with Undo and Retry), plus inline errors on forms |
| F-AP-04 | Every change reloads whole lists (`loadData()` after each action) | ⚠️ slow and flickery | Updates shown before the server confirms, with rollback (architecture.md) |
| F-AP-05 | Language: English UI, Vietnamese brand name | ✅ | Same; fonts support Vietnamese diacritics |

## Hidden by D3 (data and API kept, UI off; re-enable on request)

Item photos (`item_images`, bucket `items/` folder, `/api/inventory/:id/images`, `/api/uploads/read`),
barcode scanning and learning (`barcode_mappings`, `/api/barcode-mappings`,
`/api/inventory/by-barcode/:code/images`, ZXing). Receipt photos stay; they are needed by F-RS.
