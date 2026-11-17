# Chắt Chiu rewrite: plan overview

Status: **draft for review**, not yet approved. No application code exists yet.
Repo: `ChatChiu` (this repo). Source being rewritten: `../Inventory_Tracking_App`.

## Why this rewrite

The old app works, but it was built quickly and it shows:

- It behaves inconsistently.
- The UI is clunky because each page styles itself, with no shared design system.
- Several features are placeholders that silently do nothing.
- Every action reloads whole lists from the server.

The goal is **the same app, with the same data, everything that exists today working properly, a new UI, and much smoother loading and updating.**

## Documents

| File | What it holds |
|---|---|
| [feature-inventory.md](feature-inventory.md) | Every screen and interaction in the old app: what it is *meant* to do, whether it actually works today, and how the new app handles it. **This is the parity checklist.** |
| [architecture.md](architecture.md) | Stack, repo layout, data and sync strategy (instant loads, updates shown before the server confirms, undo, offline), design system, notifications. |
| [roadmap.md](roadmap.md) | Phased implementation steps with exact file paths, what each step produces, and how it is verified. |
| [migration-cutover.md](migration-cutover.md) | How we move from the old app to the new one on the **same Supabase project** without breaking anything or losing data. |
| [open-questions.md](open-questions.md) | Things I am not sure about and need answered before or during the build. |

## Decisions already made (2026-11-16)

| # | Decision | Source |
|---|---|---|
| D1 | Keep the name **Chắt Chiu** and the chef-pig logo | User |
| D2 | Reuse the **same Supabase project and data**. Database changes are additive only while the old app is still live. | User |
| D3 | Scope is **feature parity**, except **item photos and barcode scanning are hidden** (data kept, can be re-enabled on request). Receipt scanning stays. | User |
| D4 | Main device is the **Fire Max 11 tablet in landscape**; phones must be first-class too | User |
| D5 | Look: **Fresh Ledger** for light mode and **Fresh Ledger Dark** (the same design inverted: same cool green-grey neutrals and teal accent) for dark mode. Follows the device setting, with an override in Settings. Changed 2026-11-17 in step 3.3: the prototype's Night Kitchen dark palette (orange accent) read as a different design, not the dark theme of Fresh Ledger. | User |
| D6 | The dashboard **keeps the board layout** (one column per location, every item visible). Usage changes save immediately with an **Undo toast** instead of a confirm dialog. Tapping an item opens a **quick-action panel**. | User + girlfriend (approved prototype) |
| D7 | The dashboard's Stats view **moves to a "Waste & Stats" page** | User |
| D8 | When an item hits 0%, the only choices are **Add to shopping list** or **Remove**. The old empty-item Refill dialog is dropped. | User |
| D9 | Make the placeholder features work: **low-stock alerts, run-out prediction, recipe suggestions, money stats** | User |
| D10 | **Fire tablet notifications must actually work** (they never did on the web version) | User |
| D11 | **One shared login.** Data stays per-user in the database; several devices use the same account at once. | User |
| D12 | Stack: **React 19 + Vite** with **TanStack Query** (stable adapter) for data, **Tailwind v4 + React Aria** for our own components, **Vercel functions** for the API, **Supabase** for the database. Changed from Angular on 2026-11-16 because the user asked for "whatever makes it fastest and smoothest". | Me |
| D13 | **Restock** = "I bought this again". It refills the *same* item to a new full amount, with an optional new expiry date and price. It does not create a second item. | User |
| D14 | **Sideloading an APK on the Fire Max 11 is OK**, so the Fire gets on-device reminders | User |
| D15 | Her phone is an **iPhone**: notifications need the app added to the Home Screen | User |
| D16 | The new app gets its **own new Vercel project and URL**. The old project (`inventory-tracking-app-five.vercel.app`) stays untouched as a fallback during the parallel run, then is deleted. On her iPhone, the old Home Screen icon is removed and the new one added. | User |
| D17 | **Notifications don't arrive on her iPhone either**, even though the old app is on the Home Screen with notifications on. So the old push pipeline is broken beyond the Fire problem; it gets diagnosed in Phase 0 (step 0.8). | User |
| D18 | This machine may log in to **Vercel and Supabase**. I still ask before any production-facing write (deploy to the live project, `db push`, env changes). | User |

The prototype is at https://claude.ai/artifact/Hne1sPMHaXmxVYfs7A4rVJ, in the "Kitchen board" row.

## How the work is governed

This repo is under Harness OS (`.claude/harness.json`). Every feature follows
**Constitution → Spec → Tests (RED) → Code → Review → Quality evaluation**, using
the `new-feature` workflow in `.claude/workflows/new-feature.yaml`. Each row of
`feature-inventory.md` becomes acceptance criteria in a spec under
`.claude/specifications/`, so no existing behaviour can be dropped without anyone noticing.
