-- ============================================================================
-- 0020 Per-user write budget (roadmap step 6.5, row 7.0.13(d)).
-- A signed-in user could send writes as fast as the API answers. The API now asks this function once per write
-- (POST, PATCH, PUT, DELETE) and answers 429 when a user has used up her budget for the current minute.
-- Additive only (AR-ADDITIVE-ONLY): a new table and a new function. The table is reachable only through the
-- SECURITY DEFINER function (no policies, no grants), so a user cannot reset her own counter through PostgREST.
-- The old app never calls it and is unaffected.
-- ============================================================================

create table public.api_write_budget (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  writes       integer     not null default 0 check (writes >= 0),
  primary key (user_id, window_start)
);

alter table public.api_write_budget enable row level security;
-- RLS with no policy denies everything to a normal role; the grants go too, so even a mistaken policy would not open it.
revoke all on public.api_write_budget from anon, authenticated;

-- Counts one write for the caller in the current minute and says whether she is still within `p_limit`.
-- Windows older than an hour are dropped on the way, so the table stays small.
create function public.consume_write_budget(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_writes integer;
begin
  if v_user is null then
    raise exception 'consume_write_budget requires a signed-in user' using errcode = '28000';
  end if;
  insert into public.api_write_budget as b (user_id, window_start, writes)
  values (v_user, date_trunc('minute', now()), 1)
  on conflict (user_id, window_start) do update set writes = b.writes + 1
  returning b.writes into v_writes;
  delete from public.api_write_budget where user_id = v_user and window_start < now() - interval '1 hour';
  return v_writes <= p_limit;
end;
$$;

revoke all on function public.consume_write_budget(integer) from public, anon;
grant execute on function public.consume_write_budget(integer) to authenticated;
