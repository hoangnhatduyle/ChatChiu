-- A place can have an icon and a colour (UI refresh 06). Both are optional: a place without them keeps
-- the name-based fallback in the app. Additive only; the allowed values are checked by the API (zod enum),
-- not by a constraint, so the list can grow without a migration.
alter table public.locations
  add column icon text,
  add column color text;
