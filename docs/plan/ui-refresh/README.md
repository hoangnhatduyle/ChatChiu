# UI refresh: handoff for the planning session

Status 2026-11-19: **decisions made, plans not written yet.** The user chose to write the plans in a fresh session
("plan mode"), seven files, then implement each in its own later session. Nothing in the app has changed for this yet.

## Why

After using the live app on desktop the user found it plain and soulless: Phase 3 built a strict design system
(contrast, touch targets, tokens) with no personality, and the tablet/phone layouts are stretched onto desktop.
The old app had colourful location headers, icons and the pig-chef logo. Goal: keep everything that works
(offline, undo, accessibility, budgets) and give the app a character, with the desktop given real attention.

## Decided (do not re-ask)

- **Style A, "Market stall"**: warm paper background, one colour per kind of food, shelf-label location headers
  with icons, Bricolage Grotesque for titles and Inter Tight for text (both have Vietnamese), the mono font removed
  (tabular figures instead). Teal stays the action colour. Style B ("Fresh Ledger, refined") was rejected.
- **The logo is the user's own icon** (`apps/web/public/icons/icon-96x96.png` and `icon-192x192.png`; the 1254 px
  source is `apps/web/public/chac-chiu-icon.png`, too heavy for UI). Never draw a replacement pig.
- **Plan split, seven files** in this folder, in this order: `00-foundation.md`, `01-dashboard.md`, `02-stock.md`,
  `03-shopping.md`, `04-meals.md`, `05-stats.md`, `06-settings-locations.md`. Foundation is implemented first; the
  pages can then go in any order.
- **Prototype** (clickable, real item names): https://claude.ai/artifact/8HYgd2mBsu6PsuPYAoE1uG (private to the
  user). A copy of its source is in `prototype/` (open the `.dc.html` files as the visual reference; `Main.dc.html`
  is the Dashboard, `SettingsLocations.dc.html` the icon picker). `DashboardB.dc.html` is the rejected style.

## Dashboard (page 01), user feedback in full

1. Show **all locations** in a responsive grid (no horizontal scroller, no nested scrollbars): the page scrolls
   once. Each card shows its **5 most urgent items** (expired, then today, then low, then soonest) and
   "Show all N" expands the card in place (remembered). Phone and portrait tablet keep the swipe carousel; desktop
   and the Fire in landscape (1280 px) use the grid.
2. Where something still scrolls: scrollbar hidden until hover, soft fade and a "N more" pill that go away at the end.
3. **Four clickable cards on top: Expired, Use today, Running low, Fresh.** They must look clickable (hover lift,
   "Tap to filter ›"). One line of hint: *"Tap a card to see only those items, grouped by place. Tap it again to
   show everything."* Tapping filters but items stay in their location cards (places with no match are left out).
   **No "Showing… / Clear filter" bar**: tapping the selected card again clears it; state is `aria-pressed`, and a
   visually hidden live region says "Showing 7 expired items in 4 places".
4. **Remove the tip** ("Tip: drag any bar down to log what you used…"): delete `BoardHint.tsx`, its stored flag and
   spec F-KB-11.
5. **Live percentage while sliding**: while the bar is dragged the percent (and "0.35 of 1 pcs") updates
   continuously; the write still happens once on release with one Undo (`ui/UsageSliderImpl.tsx` already has the
   draft value; expose it through a new `onDraft` prop that `features/kitchen-board/BoardRow.tsx` and
   `features/inventory/InventoryCards.tsx` use).
6. Each location has a **user-chosen icon and colour** (page 06); the card header uses them, with a name-based
   fallback (freezer, fridge, ...) for locations that have none.

## Other pages (from the user's feedback and the prototype)

- **Stock (02)**: default "Shelves" view grouped by location (sticky coloured group headers, item cards with a
  category-coloured edge, category pill, expiry chip, inline usage bar, 2 to 3 columns on desktop); colourful filter
  tiles (Expired, Expiring this week, Fresh); the table stays as a second view. Files: `features/inventory/*`.
- **Shopping (03)**: two panes on desktop. Left: quick add, the list grouped by category with big round ticks;
  right: bought-progress ring and "Running low" suggestions (one tap adds; data from `data/stats.ts`). Friendly
  empty state with the logo. Files: `features/shopping/*`.
- **Meals (04)**: week board (today highlighted, coloured meal cards by meal type), "Use soon" suggestions rail
  (`features/meals/RecipeSuggestions.tsx` exists), recipe cards. Files: `features/meals/*`.
- **Stats (05)**: starts with a plain-language headline, stat tiles, a stock-value ring by category (CSS conic
  gradient, no chart library), running-low list with runway, a 14-day expiry strip, stock by place; data tables stay
  behind the existing toggle for accessibility. Files: `features/stats/*`.
- **Settings, Locations (06)**: the new icon (15) and colour (8) picker with live Kitchen-card preview. Needs data:
  additive migration `0021` adding nullable `icon` and `color` to `public.locations`, `packages/contracts/src/locations.ts`
  (`LOCATION_ICONS`, `LOCATION_COLORS`), `ui/Icon.tsx` paths, `features/settings/LocationsSection.tsx`.
- **Foundation (00)**: `styles/tokens.css`, `styles/fonts.css`, `ui/Card.tsx`, `ui/CategoryStyle.tsx` (replaces
  `features/settings/category-style.ts`), `ui/BrandMark.tsx` (user's icon), `ui/ScrollFade.tsx`,
  `ui/location-style.ts`, `shell/NavRail.tsx` (labelled sidebar on desktop with counts), `shell/AppShell.tsx`.

## Still open (ask the user at the start of the session, one message)

1. Tile meaning: is **Use today** "expires today" (the old chip "Use soon" was within 3 days)? Is **Fresh** "more than
   7 days left"? (Real counts today: 7 expired, 3 expiring, 6 low, 61 fresh.)
2. OK to add `icon` and `color` columns to her `locations` table (additive, old app unaffected; applying to production
   only with her go-ahead)?

## How to write the plans (rules)

- Use **Plan Mode**. Every step names the exact files to create or edit, the existing function or utility to reuse
  (with path), the artifact produced and how it is verified (the global rule NC-PLANMODE-PATHS).
- One file per page in this folder; each stands alone for a later session (context, steps, tests, risks, approval stops).
- Specs to amend, per page: `.claude/specifications/SPEC-KB-001.yaml` (F-KB-11 removed, F-KB-12 tiles),
  `SPEC-IN-001`, `SPEC-SL-001`, `SPEC-MP-001`, `SPEC-ST-001`, `SPEC-SE-001`.
- Constraints to keep: every new colour pair passes `scripts/check-contrast.mjs` (4.5:1); axe at zero on every screen
  in light and dark; 44 px targets; reduced-motion respected; initial JS gate 175 KB (fonts and CSS are not JS; the
  gate may be raised if truly needed); migrations from 0012 on are additive only; no push without the user's go-ahead.
- Process the user prefers for wrap-up style work: failing test first only for data, security and API behaviour; one
  review per page; e2e once per page (light and dark); commit only after approval; explicit staged files.
- Never publish a design that depends on an unverified browser feature without saying so.
