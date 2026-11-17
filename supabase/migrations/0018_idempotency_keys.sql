-- ============================================================================
-- 0018 Idempotent writes (roadmap step 4.3b, SPEC-API-001 AC-API-25).
-- The web app queues writes while offline and retries them after a timeout, so the
-- same request can reach the server twice. A client-made Idempotency-Key lets the API
-- recognise the repeat and return the first response instead of running it again.
-- Additive only (AR-ADDITIVE-ONLY): a new table and new functions; the old app never
-- sends a key and is unaffected.
--
-- Delivery is at-least-once in one narrow case: if the process dies after a write committed
-- but before its response was recorded, the key is taken over after the lease below and the
-- write runs again. That beats locking the key for weeks, and it needs a crash inside a window
-- of milliseconds. A caller can write its own rows here (they are keyed by auth.uid()); it can
-- only harm its own keys.
-- ============================================================================

create table public.idempotency_keys (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key          text not null check (key ~ '^[A-Za-z0-9_-]{1,100}$'),
  -- What the first request was; a reuse of the key for anything else is refused.
  method       text not null check (char_length(method) <= 10),
  path         text not null check (char_length(path) <= 512),
  request_hash text not null check (char_length(request_hash) <= 128),
  state        text not null default 'in_progress' check (state in ('in_progress', 'done')),
  status       integer,
  response     jsonb check (octet_length(response::text) <= 1048576),
  -- When the request started; refreshed when a stale claim is taken over.
  created_at   timestamptz not null default now(),
  primary key (user_id, key),
  check (state = 'in_progress' or status is not null)
);

create index idempotency_keys_user_created_idx on public.idempotency_keys (user_id, created_at);

alter table public.idempotency_keys enable row level security;

create policy idempotency_keys_own on public.idempotency_keys
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Only what the functions need (no TRUNCATE, REFERENCES or TRIGGER); anon nothing.
revoke all on public.idempotency_keys from anon, authenticated;
grant select, insert, update, delete on public.idempotency_keys to authenticated;

-- Claim a key. Returns the state: 'new' (this call owns it and should run the request),
-- 'in_progress' (an earlier call is still running), 'done' (with the stored status and
-- response to replay) or 'mismatch' (the key was used for a different request).
--  - A claim that has been 'in_progress' for more than 2 minutes (longer than the API's 60 s
--    limit) belongs to a call that died: it is taken over and reported 'new'.
--  - Keys older than 35 days are pruned (200 at a time, per user), when a new key is stored:
--    35 days is longer than the 30-day offline queue, so a write that ran but whose answer
--    was lost is still recognised on replay.
-- Must run as its own transaction (each PostgREST call is): it relies on READ COMMITTED, where a
-- second caller waits for the first's insert to commit and then sees it.
create function public.idempotency_begin(p_key text, p_method text, p_path text, p_request_hash text)
returns table (state text, status integer, response jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_row public.idempotency_keys;
  v_count integer;
begin
  if v_user is null then
    raise exception 'idempotency_begin requires an authenticated user' using errcode = '28000';
  end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{1,100}$'
     or p_method is null or p_path is null or p_request_hash is null then
    raise exception 'invalid idempotency arguments' using errcode = '22023';
  end if;

  loop
    insert into public.idempotency_keys (user_id, key, method, path, request_hash)
    values (v_user, p_key, p_method, p_path, p_request_hash)
    on conflict (user_id, key) do nothing;
    get diagnostics v_count = row_count;
    if v_count = 1 then
      delete from public.idempotency_keys k
      where (k.user_id, k.key) in (
        select o.user_id, o.key from public.idempotency_keys o
        where o.user_id = v_user and o.created_at < now() - interval '35 days'
        limit 200);
      return query select 'new'::text, null::integer, null::jsonb;
      return;
    end if;

    select * into v_row from public.idempotency_keys k where k.user_id = v_user and k.key = p_key;
    if not found then
      continue; -- released between the insert and the read: claim it again
    end if;

    if v_row.method <> p_method or v_row.path <> p_path or v_row.request_hash <> p_request_hash then
      return query select 'mismatch'::text, null::integer, null::jsonb;
      return;
    end if;
    if v_row.state = 'done' then
      return query select 'done'::text, v_row.status, v_row.response;
      return;
    end if;

    -- Still running, unless its owner died: the update takes the row lock, so only one taker wins.
    update public.idempotency_keys k set created_at = now()
    where k.user_id = v_user and k.key = p_key and k.state = 'in_progress'
      and k.created_at < now() - interval '2 minutes';
    get diagnostics v_count = row_count;
    if v_count = 1 then
      return query select 'new'::text, null::integer, null::jsonb;
    else
      return query select 'in_progress'::text, null::integer, null::jsonb;
    end if;
    return;
  end loop;
end $$;

-- Record the response of the request that owns the key. A finished key is never overwritten.
create function public.idempotency_finish(p_key text, p_status integer, p_response jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.idempotency_keys
  set state = 'done', status = p_status, response = p_response
  where user_id = auth.uid() and key = p_key and state = 'in_progress'
$$;

-- Release a key whose request failed in a way that should be tried again (a server error).
-- A finished key is never removed.
create function public.idempotency_abandon(p_key text)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.idempotency_keys
  where user_id = auth.uid() and key = p_key and state = 'in_progress'
$$;

revoke all on function public.idempotency_begin(text, text, text, text) from public, anon;
grant execute on function public.idempotency_begin(text, text, text, text) to authenticated;
revoke all on function public.idempotency_finish(text, integer, jsonb) from public, anon;
grant execute on function public.idempotency_finish(text, integer, jsonb) to authenticated;
revoke all on function public.idempotency_abandon(text) from public, anon;
grant execute on function public.idempotency_abandon(text) to authenticated;
