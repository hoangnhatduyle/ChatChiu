# 00 Foundation: Style A "Market stall" tokens, fonts, shared UI, shell

Implement this one FIRST, in its own session. Plans 01 to 06 (pages) depend on it and can then go in any order.
Written 2026-11-19 in Plan Mode. No app code was written in that session.

## Shared context (the same block is at the top of all seven plans)

- **Why.** The live app feels plain and soulless on desktop, the tablet and phone layouts are stretched onto it, and
  it has too many scrollbars. Keep everything that works (offline, Undo, accessibility, budgets); add character.
- **Decided, do not re-ask.** Style A "Market stall": warm paper background, one colour per kind of food, shelf-label
  location headers with icons, Bricolage Grotesque for titles, Inter Tight for text (both have Vietnamese), the mono
  font removed (tabular figures instead), teal stays the action colour. The logo is the user's own icon
  `apps/web/public/icons/icon-96x96.png` / `icon-192x192.png` (never draw a pig). Prototype source:
  `docs/plan/ui-refresh/prototype/*.dc.html` (+ `shared.css`); handoff: `docs/plan/ui-refresh/README.md`.
- **User answers 2026-11-19.** (1) Tile rules: **Expired** = already expired (days left < 0). **Use today** = expires
  today through 3 days from now (the existing `USE_SOON_DAYS = 3` in `packages/domain/src/expiry.ts`). **Running low**
  = low on quantity (`!isUsedUp && isLowStock`); an item can be in Running low AND Use today (or Expired). **Fresh**
  = the rest (not in any of the other three). The four tiles together cover every item; their numbers can add up to
  more than the total because Running low overlaps. (2) Yes: additive migration `0021` adds nullable `icon` and
  `color` to `public.locations` (production only after a separate go-ahead).
- **Layout rule.** "Wide" = viewport >= 1024 px (token `--breakpoint-lg`; the Fire in landscape is 1280 px, desktop is
  wider). Wide gets the labelled sidebar and the grids; below 1024 px the 84 px rail (768 to 1023) and the phone bottom
  bar (< 768) stay as they are.
- **Constraints to keep.** Every new colour pair passes `apps/web/scripts/check-contrast.mjs` (4.5:1 text, 3:1
  graphics) in light and dark; axe at zero serious/critical on every screen in both themes (`e2e/a11y.spec.ts`);
  44 px touch targets; reduced motion respected (`styles/base.css`); initial JS gate 175 KB gzipped
  (`scripts/check-bundle-budget.mjs`; fonts and CSS are not JS); migrations from 0012 on are additive only
  (`scripts/check-additive-migrations.mjs`); no hard-coded hex or Tailwind palette classes in `.tsx`
  (`styles/tokens.test.ts`); `ui/` and `shell/` never import `data/`.
- **Gate state at planning time.** `node scripts/check-bundle-budget.mjs` on the existing `apps/web/dist` printed
  "Initial JS 175.6 KB gz, over the 175 KB budget". That dist may be stale: rebuild with the Supabase env (below)
  before trusting it. Raising the gate is the user's call (see the approval stops).
- **Commands** (repo root; put `$HOME/.nvm/versions/node/v24.12.0/bin` first on PATH if `node -v` is not 24):
  unit `npm run test -w @chatchiu/web -- <file>` (domain: `-w @chatchiu/domain`); `npm run typecheck`;
  `npm run lint`; `npx prettier --check <files>` (`api/`, `docs/`, `.claude/` and `supabase/migrations/` are
  prettier-ignored); contrast `npm run check:contrast -w @chatchiu/web`; build + budget in ONE call:
  `export $(node scripts/local-supabase-env.mjs | xargs) && npm run build && npm run check:budget` (a build without
  the env makes every e2e fail with "Supabase is not configured"); e2e `npm run test:e2e -w @chatchiu/web -- e2e/<spec>`
  (build first; only ONE session may run e2e or API integration at a time; run the full suite with
  `run_in_background`; never `pkill -f "playwright test"`).
- **Process.** Failing test first only for data, security and API behaviour (domain rules, the migration, zod
  schemas); UI gets tests alongside. One review per page (react-reviewer + a11y-architect + typescript-reviewer; verify
  each claim in the code before fixing). e2e once per page, light and dark. Stage explicit files only
  (`git status` + `git diff --cached` before every commit; another session may have edited the tree). **No commit and
  no push without the user's approval.** Test names keep their spec id prefix (`F-KB-12: ...`).

## Context for this plan

Today: `styles/tokens.css` is "Fresh Ledger" (cool grey-green, IBM Plex Mono for numbers, 14 px cards); the shell is
an 84 px icon rail (`shell/NavRail.tsx`) from 768 px and a bottom bar (`shell/BottomNav.tsx`) below; every page frames
itself (`px-4 pt-5 md:px-6 md:pt-6`) and titles itself with `shell/PageTitle.tsx` (a 20 to 24 px h1). 35 `font-mono`
uses sit in 19 files. Category icons/colours live in `features/settings/category-style.ts` (emoji list + 8 named
hexes); system categories carry arbitrary hex (`#FFEB3B` Dairy, `#4CAF50` Produce, ... from migration 0001).
`Location` has no icon or colour yet (plan 06 adds the columns). This plan changes how every screen LOOKS through the
tokens and adds the shared pieces the page plans use. It changes no page layout (the page plans do that).

## Steps

### 0. Preflight (no code)
- Files: none. Run `git status` (expect only `docs/plan/` changes; if anything else is dirty, stop and ask), then the
  baseline: build with env + `npm run check:budget`, `npm run check:contrast -w @chatchiu/web`,
  `npm run test:e2e -w @chatchiu/web -- e2e/a11y.spec.ts`.
- Artifact: baseline numbers (initial JS KB, contrast result, a11y result) written in the session notes.
- Verify: the three commands exit 0, or the gate number is recorded and goes to approval stop A.

### 1. Fonts: add Bricolage Grotesque, remove IBM Plex Mono
- Edit `apps/web/package.json` (add `@fontsource/bricolage-grotesque`; remove `@fontsource/ibm-plex-mono`) and
  `package-lock.json` by the recipe in memory note chatchiu-env-quirks (keep old `packages`, add only new keys, check
  `npm ci --ignore-scripts` in a `git archive` checkout). **Only this session changes dependencies.**
- Edit `apps/web/src/styles/fonts.css`: delete the four IBM Plex Mono `@font-face` blocks; add Bricolage Grotesque
  `latin` and `vietnamese` faces for weights 700 and 800 (`font-display: swap`, ranges copied from the package's
  `unicode.json`). Keep Inter Tight as is. Update the header comment.
- Edit `apps/web/src/styles/fonts.test.ts`: import `@fontsource/bricolage-grotesque/unicode.json` instead of
  `@fontsource/ibm-plex-mono/unicode.json`; assert both subsets, weights 700/800, ranges equal the package's.
- Verify: `npm run test -w @chatchiu/web -- src/styles/fonts.test.ts`; after a build, `ls apps/web/dist/assets | grep
  -i "plex"` is empty and a Bricolage `vietnamese` woff2 exists; `e2e/csp.spec.ts` still passes (`font-src 'self'`).
  Check by eye that "Chắt Chiu" in a 38 px Bricolage heading keeps its diacritics (line-height >= 1.1 for display
  sizes, >= 1.3 for body text; the type scale rule in `tokens.test.ts` stays).

### 2. Tokens: Style A palette in light and both dark blocks
- Edit `apps/web/src/styles/tokens.css` (the three blocks `:root`, `:root:not([data-theme='light'])` in the dark
  media query and `:root[data-theme='dark']` must stay identical), and the `@theme inline` map so each new token has a
  utility (`bg-tint-red`, `text-tint-red-ink`, `bg-loc-sand`, ...). Values (light / proposed dark; the gate has the
  last word, adjust a dark value only to pass it):
  - Surfaces: `--bg #fbf6ec / #17130e` (paper), `--surface #fffdf9 / #211b14` (card), `--ink #2b2218 / #f3eadb`,
    `--muted #6b5e4e / #b9aa94`, `--line #e8dfcf / #3a3226`, `--hair #efe6d6 / #2a2318`,
    `--field-line #8a7d6b / #8a7d6b`, `--scrim rgb(43 34 24 / .32) / rgb(0 0 0 / .5)`.
  - Action and bars: keep `--accent #0b6e75 / #4fc2b8`, `--accent-ink`, `--focus`, `--fill`; `--track #ece6da / #3a3226`,
    `--low #a84708 / #f0955c` (darkened from the prototype #b4500c: it was 4.3 on the tinted hover and icon surfaces); `--chip-on` follows `--ink`.
  - Rail and sidebar: `--rail #f4ecdc / #1e1812`, `--rail-ink #4a3f31 / #d5c8b3`; keep `--rail-on` / `--rail-on-ink`
    (soft pill used by the 84 px rail and the phone bar) and ADD `--sidebar-on #0b6e75 / #4fc2b8`,
    `--sidebar-on-ink #ffffff / #062321` (solid pill, wide sidebar only).
  - Soft tints (new, semantic pairs): `--tint-red/-ink #f8ddd6 #8f2d1f / #3d1d17 #f2a99a`, `--tint-amber #fce7c2
    #8a4b00 / #3f2f12 #f7c77e`, `--tint-orange #fbe3d3 #8f3d06 / #3d2616 #f5b08a`, `--tint-green #ddeedc #2f6b3a /
    #1f3322 #a9d9a0`, `--tint-teal #ddf0ef #0a4f54 / #173a37 #8fe0d7`, `--tint-neutral #ece6da #4a3f31 / #2a2318
    #d5c8b3`. Expiry status tokens `--status-expired-*` = red pair, `--status-today-*` and `--status-soon-*` = amber
    pair (the prototype used teal for 1 to 7 days; amber keeps the "Use today" tile, its chips and its colour in
    agreement, confirm at the screenshot stop), `--status-ok-*` = neutral pair.
  - Danger button (it used the solid `--status-expired-bg`): add `--danger #a3341a / #ef6a52`, `--danger-ink #ffffff /
    #1a0805`; keep the existing `graphic('status-expired-bg', 'surface')` pair but point it at `danger`.
  - Location tints: `--loc-sand #f6e8c9`, `--loc-ice #dcebf7`, `--loc-mint #ddf0ea`, `--loc-clay #f4dfd0`,
    `--loc-teal #ddf0ef`, `--loc-rose #f7dfe4`, `--loc-saffron #f6e3b9`, `--loc-lilac #e6e3f5` (dark proposals:
    `#3b3224 #1f2f3b #1d332d #3d2a20 #1b3533 #3d252b #3d3217 #2e2a40`), plus `--loc-ink #3a3024 / #f3eadb` and
    `--loc-ink-soft #5d5040 / #d5c8b3`.
  - Meal-type tint (plan 04): `--tint-indigo #e3e6f7 / ink #2b3478` (dark `#262a4a / #b9c0f2`; ratios 9.1 and 7.9);
    meal types map breakfast = amber, lunch = green, dinner = indigo.
  - Shape and shadow: `--radius-card 16px`, `--radius-panel 20px`, `--radius-tile 18px`, `--radius-control 10px`
    (pills stay); `--shadow-card: 0 1px 0 rgb(43 34 24 / .04), 0 8px 22px rgb(43 34 24 / .06)`, `--shadow-lift:
    0 14px 30px rgb(43 34 24 / .12)` (dark: `none` and a darker lift); `--spacing-sidebar: 232px`.
  - Fonts: delete `--font-mono`; add `--font-display: 'Bricolage Grotesque', 'Inter Tight', ui-sans-serif,
    system-ui, sans-serif` (utility `font-display`); add `--text-display: 2.375rem` (38 px, line-height 1.1,
    digits and short titles only) and `--text-tile: 2.125rem` for the tile numbers.
- Edit `apps/web/scripts/check-contrast.mjs` (`PAIRS`): add text pairs `tint-<red|amber|orange|green|teal|neutral>-ink`
  on `tint-*`; `ink` and `muted` on `bg`, `surface`, `rail`; `ink` and `loc-ink-soft` on each of the 8 `loc-*`;
  `sidebar-on-ink` on `sidebar-on`; `danger-ink` on `danger`; `rail-ink` on `rail`; graphics `focus` on `rail`,
  `sidebar-on` vs `rail`, `danger` vs `surface`, `field-line` on `surface`/`bg`, `fill`/`low` on `track`. Remove pairs
  for tokens that no longer exist. I computed the light pairs and the proposed dark pairs with the gate's own
  `contrastRatio` on 2026-11-19: every one passes (ink 14.5, muted 5.8, red/amber/green tints 5.3 to 6.4, low 4.8,
  dark ink 15.5, dark tints 7.7 to 8.4), so a failure after implementation means a typo.
- Edit `apps/web/scripts/check-contrast.test.mjs` for the new pair list and the three-block parity check.
- Edit `apps/web/src/styles/tokens.test.ts`: radius assertions become 16/10 (card/control) and add panel/tile; the
  "F-AP-05" font test asserts `--font-sans` Inter Tight and `--font-display` Bricolage and that `--font-mono` is gone.
- Artifact: one palette, three identical blocks. Verify: `npm run check:contrast -w @chatchiu/web` (it also fails on
  drift between the two dark blocks), `npm run test -w @chatchiu/web -- src/styles`.

### 3. Remove the mono font from the components
- Edit every `.tsx` that uses `font-mono` (35 uses, 19 files, list them with `grep -rn "font-mono" apps/web/src`;
  representative: `features/kitchen-board/BoardRow.tsx`, `features/shopping/ShoppingRow.tsx`,
  `features/stats/Overview.tsx`, `ui/Chip.tsx`, `ui/DateField.tsx`, `features/meals/MonthGrid.tsx`): replace
  `font-mono` by `tabular` (the utility already defined in `styles/base.css` `.tabular`). Where a number was big, use
  `font-display tabular`.
- Verify: `grep -rn "font-mono" apps/web/src` prints nothing; `npm run test -w @chatchiu/web` (chips.test.tsx,
  basics.test.tsx, kitchen-board.test.tsx keep passing; no test asserts the class).

### 4. Shared UI pieces (new, each with a test)
- Create `apps/web/src/ui/Card.tsx`: a `<div|section|article>` (prop `as`) with `rounded-card border border-line
  bg-surface shadow-card`, optional `lift` (hover: translateY(-2px) + `shadow-lift`, transform and opacity only,
  honours reduced motion through `base.css`), optional `tone` header band slot. Reuse `ui/cx.ts`. Test `ui/card.test.tsx`.
- Create `apps/web/src/ui/category-colours.ts` (move `CATEGORY_ICONS` and `CATEGORY_COLOURS` out of
  `features/settings/category-style.ts`; delete that file) and `apps/web/src/ui/CategoryStyle.tsx`: `categoryVars(color)`
  returns `{ '--cat': color }` for a safe hex (anything else becomes a neutral grey), `<CategoryPill name color />`
  (tint = `color-mix(in srgb, var(--cat) 16%, var(--surface))`, text = `var(--ink)`, so it follows the theme) and
  `<CategoryEdge />`/`<CategoryDot />` (the raw colour; decorative, the name is always written next to it). Add a
  `@supports not (color: color-mix(in srgb, red, blue))` fallback to `--tint-neutral`. Edit
  `features/settings/CategoryFields.tsx` to import from `ui/category-colours`. Test `ui/category-style.test.tsx`:
  for all 12 system colours from migration 0001 and the 8 named ones, mix 16 % over `--surface` in both themes and
  assert ink on the result >= 4.5 using `contrastRatio` from `apps/web/scripts/check-contrast.mjs`.
  **Browser-feature note:** `color-mix()` needs Chrome 111 / Safari 16.2 / Firefox 113; the Fire Max 11 (Silk) and
  the iPhone must be checked (roadmap 7.0.14 device row); the fallback keeps it readable without it.
- Create `apps/web/src/ui/BrandMark.tsx`: `<BrandMark size={44} />` renders the user's icon (`/icons/icon-96x96.png` up
  to 48 px, `/icons/icon-192x192.png` above), explicit width/height, `alt=""` or `alt="Chắt Chiu"` by prop. Move the
  `BRAND_ICON` constants from `shell/NavRail.tsx` and `features/auth/AuthLayout.tsx` here. Test `ui/brand-mark.test.tsx`.
- Create `apps/web/src/ui/ScrollFade.tsx`: wraps a scroll area (`axis` x or y), hides the scrollbar until hover/focus
  (`scrollbar-width: none`, thin on hover), draws a soft edge fade where more content remains, and an optional "N more"
  pill (`moreLabel`) that disappears at the end. Uses two IntersectionObserver sentinels (no scroll handler), is a
  plain region (the pill is `aria-hidden`; the content stays keyboard reachable: the scroller has `tabIndex={0}` and an
  accessible name), and the fade never blocks pointer events. Test `ui/scroll-fade.test.tsx` (IntersectionObserver
  faked) plus an e2e check in plans 01 and 04 that the last row can still be reached by keyboard.
- Create `apps/web/src/ui/LocationHeader.tsx` (pure: icon square, name, status line, count, tint from
  `ui/location-style.ts`), shared by the Dashboard (01), the Settings preview (06) and Stats with no cross-feature
  import. Test `ui/location-header.test.tsx`.
- Create `apps/web/src/ui/location-style.ts`: `locationStyle(location: { name: string; icon?: string | null; color?:
  string | null })` returns `{ icon: IconName, tint: LocationColor }`: the stored values when valid, else a guess from
  the name (`/freez|ice/` snow, `/fridge|refrig/` fridge, `/counter/` counter, `/shelf|pantry/` shelf, `/refill/`
  refill, `/snack|drink/` cookie, `/spice/` spice, else pin; colour by the same rule, else sand). Accepts missing
  columns, so the pages work before plan 06 lands. Test `ui/location-style.test.ts` (each rule, unknown icon and
  colour fall back, null).
- Edit `packages/contracts/src/locations.ts`: export `LOCATION_ICONS` (15: counter, snow, fridge, shelf, refill,
  cookie, spice, jar, bowl, bag, bottle, leaf, bread, box, pin) and `LOCATION_COLORS` (8: sand, ice, mint, clay, teal,
  rose, saffron, lilac) as `as const` lists with their `LocationIcon` / `LocationColor` types (constants only; the zod
  fields and the DB come in plan 06). Test in `packages/contracts/src/schemas.test.ts` (lists have no duplicates).
- Edit `apps/web/src/ui/Icon.tsx`: add the missing path data to `PATHS` (counter, shelf, refill, cookie, spice, bag,
  bottle, leaf, bread; fridge, snow, jar, bowl, pin, box exist) using the prototype's `<symbol id="k-...">` paths in
  `prototype/SettingsLocations.dc.html`. `ui/location-style.ts` asserts at compile time that every `LOCATION_ICONS`
  entry is an `IconName`. Test: extend `ui/basics.test.tsx` to render each location icon.
- Verify: `npm run test -w @chatchiu/web -- src/ui`, `npm run test -w @chatchiu/contracts`, `npm run typecheck`.

### 5. Shell: labelled sidebar, page header, nav counts
- Edit `apps/web/src/shell/NavRail.tsx` so the same `<nav aria-label="Main">` is the 84 px rail at 768 to 1023 px and
  the 232 px sidebar from 1024 px, with CSS only (no JS breakpoint): from `lg:` the links go `flex-row`, show the
  label at 15 px (`text-base font-semibold`), the active link is `bg-sidebar-on text-sidebar-on-ink` with
  `aria-current="page"` kept, the brand block shows `<BrandMark size={44} />` plus "Chắt Chiu" in `font-display` and
  "Keep what you buy". Keep the touch height (`min-h-touch`), focus ring and the active "not colour alone" cue.
- Create `apps/web/src/shell/nav-counts.ts` (a context + hook `useNavCounts()` returning `{ expired: number }`, default
  zero; no `data/` import) and `apps/web/src/features/nav-counts/NavCountsProvider.tsx` (reads `useBootstrapQuery`
  from `data/inventory.ts` and `useToday` from `core/use-today.ts`, counts expired with `expiryStatus` from
  `@chatchiu/domain`). Edit `apps/web/src/routes.tsx` so the `/` route element is
  `<NavCountsProvider><AppShell banner={<SyncBadge />} /></NavCountsProvider>`. The sidebar shows the number on
  "Stock" as a red-tint badge with an `sr-only` "N expired" (so the link name stays "Stock, 7 expired").
- Create `apps/web/src/shell/PageHeader.tsx` (h1 via the existing `shell/PageTitle.tsx`, restyled `font-display
  text-display`; subtitle line; an `actions` slot; wraps on a phone) and `apps/web/src/shell/page-frame.ts` exporting the
  frame class string (`mx-auto w-full max-w-[1208px] px-4 pt-5 pb-8 md:px-6 md:pt-6 lg:px-9 lg:pt-7`). The page
  plans adopt both. Edit `shell/PageTitle.tsx` for the display font (keep the `<title>` and `tabIndex={-1}`).
- Edit `apps/web/src/shell/AppShell.tsx`: unchanged structure; `PageSkeleton` uses the new frame; the skip link keeps
  working. Edit `apps/web/src/features/auth/AuthLayout.tsx` to use `BrandMark`.
- Tests: update `shell/AppShell.test.tsx` (labels visible in the DOM at all widths because CSS hides them: assert the
  link names, `aria-current`, and the Stock badge text), add `shell/nav-counts.test.tsx`. e2e: extend
  `e2e/shell.spec.ts` with 1280 px (sidebar labels visible, 768 px rail has no visible labels wider than 84 px) and
  1023/1024 px boundary.
- Verify: unit tests above, `npm run lint`, `npm run typecheck`.

### 6. Re-skin the shared controls through tokens
- Edit `apps/web/src/ui/ExpiryChip.tsx` (soft tint pairs, `rounded-control`, glyph kept; text label and `sr-only`
  description unchanged: NC-KB-NO-COLOUR-ONLY), `ui/Button.tsx` (`danger` becomes `bg-danger text-danger-ink`),
  `ui/Chip.tsx`, `ui/Segmented.tsx`, `ui/EmptyState.tsx` (add an optional `brand` prop that shows `BrandMark` instead
  of the icon square), `ui/Toast.tsx`, `ui/Field.tsx`. Edit the two other users of the solid expired colour:
  `features/auth/AuthLayout.tsx` and `features/settings/CategoriesSection.tsx` (error banners) to `bg-danger
  text-danger-ink`.
- Verify: `npm run test -w @chatchiu/web -- src/ui src/features/auth src/features/settings`; the existing tests
  (`chips.test.tsx`, `forms.test.tsx`, `settings.test.tsx`) must pass unchanged except for class assertions.

### 7. Gallery, pictures and accessibility
- Edit `apps/web/src/ui-gallery/Gallery.tsx` (dev only, `ui-gallery.html`): add Card, CategoryPill, BrandMark,
  ScrollFade and the location icon grid, in both themes.
- Run `npm run test:e2e -w @chatchiu/web -- e2e/a11y.spec.ts e2e/shell.spec.ts e2e/ui/components.spec.ts`
  and `e2e/visual.spec.ts --update-snapshots` (baselines are local and gitignored; read every changed picture at 320,
  390, 768, 1024, 1280, 1440 in light and dark before accepting it). Edit `e2e/ui/components.spec.ts-snapshots`
  (regenerated).
- Artifact: new baselines, axe zero. Verify: `export $(node scripts/local-supabase-env.mjs | xargs) && npm run build
  && npm run check:budget` and `npm run check:contrast -w @chatchiu/web`. Expect the initial JS to grow by about 1 KB
  (sidebar, Icon paths, nav counts); the real number goes to the approval stop.

### 8. Specs and docs
- Edit `.claude/specifications/SPEC-AP-001.yaml`: F-AP-02 (768 to 1023 px 84 px rail, from 1024 px a 232 px labelled
  sidebar with the Stock expired count; 390 stays the bottom bar), F-AP-05 (fonts: Inter Tight + Bricolage Grotesque,
  no mono), `external_dependencies` (`@fontsource/bricolage-grotesque`), NC-AP-BUDGET (the text says 170 KB, the gate
  is 175: make them agree with whatever the user decides). Edit `.claude/specifications/SPEC-SE-001.yaml` F-SE-06
  (theme names "Market stall" / "Market stall Dark").
- Edit `.claude/tests/SPEC-AP-001.tests.yaml` and `SPEC-SE-001.tests.yaml` by hand to match (keep `traces_to`), or run
  the harness `generate_tests` if the user prefers (ask).
- Edit `docs/plan/architecture.md` (line 10 fonts, line 136 and §4 nav and tokens) and `docs/plan/roadmap.md` row
  7.0.40 (mark foundation done with the commit hash).

## Tests (summary)
Unit: fonts, tokens, contrast script, Card, CategoryStyle (colour maths), BrandMark, ScrollFade, location-style,
contracts lists, Icon, AppShell, nav counts. e2e: a11y (all screens, both themes), shell (1023/1024/1280), ui
components, visual baselines. Gates: contrast, budget, typecheck, lint, prettier.

## Risks
- Initial JS is at or over the gate before any work; the page plans (the board is in the initial bundle) add more.
  Decide the gate at stop A, not at the end.
- A token mistake re-skins every screen at once: do step 2 in its own commit-sized chunk and look at pictures first.
- `color-mix()` and `conic-gradient` (plan 05) are the only newer CSS features; both have fallbacks, verify on the Fire.
- The soft chips lose the old solid red "Expired" punch: the glyph + text stay, and the tile/edge colours carry it.
- Another Claude session once edited the tree during a phase: check `git status` before staging.

## Specs to amend
`SPEC-AP-001` (F-AP-02, F-AP-05, NC-AP-BUDGET, dependencies), `SPEC-SE-001` (F-SE-06 theme names); docs listed in step 8.

## Approval stops
- **A. After step 0 and before step 1:** show the baseline and ask for the JS gate decision (keep 175 and trim, or raise
  to a stated number). Also the dependency change (new font package, remove IBM Plex Mono).
- **B. After step 2:** two screenshots of an unchanged page (Stock and Settings) in light and dark with the new tokens;
  confirm the soon-chip tone (amber vs the prototype's teal) and the dark palette before building on it.
- **C. Before any commit:** the user reads the changed visual baselines and approves. Commit and push only on request;
  stage explicit files.
