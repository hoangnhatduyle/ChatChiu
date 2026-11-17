begin;
\ir _helpers.psql
select plan(38);

select pg_temp.new_user('a@chatchiu.test') as a \gset
select pg_temp.new_user('b@chatchiu.test') as b \gset

select has_table('public', 'idempotency_keys', 'idempotency_keys exists');
select ok((select relrowsecurity from pg_class where oid = 'public.idempotency_keys'::regclass), 'NC-DATA-RLS: RLS on idempotency_keys');
select ok(not has_table_privilege('authenticated', 'public.idempotency_keys', 'TRUNCATE'), 'authenticated cannot TRUNCATE the table (it ignores RLS)');
select ok(not has_table_privilege('anon', 'public.idempotency_keys', 'SELECT'), 'anon has no access to the table');

select pg_temp.act_as(:'a');

-- first sight of a key
select is((select state from public.idempotency_begin('key-1', 'POST', '/inventory', 'h1')), 'new', 'AC-API-25: a new key is "new"');
-- the same key while the first request is still running
select is((select state from public.idempotency_begin('key-1', 'POST', '/inventory', 'h1')), 'in_progress', 'AC-API-25: the same key while running is "in_progress"');
select is((select state from public.idempotency_begin('key-1', 'POST', '/inventory', 'OTHER')), 'mismatch', 'a different request on a running key is "mismatch" (checked before "in_progress")');
-- finish it
select lives_ok($$select public.idempotency_finish('key-1', 200, '{"data":{"id":7}}'::jsonb)$$, 'idempotency_finish stores the response');
select results_eq(
  $$select state, status, response from public.idempotency_begin('key-1', 'POST', '/inventory', 'h1')$$,
  $$values ('done'::text, 200, '{"data":{"id":7}}'::jsonb)$$,
  'AC-API-25: a repeat of a finished request returns the stored response');
select lives_ok($$select public.idempotency_finish('key-1', 500, '{"overwritten":true}'::jsonb)$$, 'a second finish is harmless');
select is((select response from public.idempotency_begin('key-1', 'POST', '/inventory', 'h1')), '{"data":{"id":7}}'::jsonb, 'a finished response is never overwritten');
-- reuse of the key for a different request
select is((select state from public.idempotency_begin('key-1', 'POST', '/inventory', 'OTHER')), 'mismatch', 'AC-API-25: the same key with a different body is "mismatch"');
select is((select state from public.idempotency_begin('key-1', 'PATCH', '/inventory', 'h1')), 'mismatch', '... a different method');
select is((select state from public.idempotency_begin('key-1', 'POST', '/shopping-list', 'h1')), 'mismatch', '... a different path');

-- abandon: a request that failed unexpectedly can be tried again
select is((select state from public.idempotency_begin('key-2', 'POST', '/inventory', 'h2')), 'new', 'key-2 is new');
select lives_ok($$select public.idempotency_abandon('key-2')$$, 'idempotency_abandon removes a running key');
select is((select state from public.idempotency_begin('key-2', 'POST', '/inventory', 'h2')), 'new', 'AC-API-25: after abandon the key is new again');
select lives_ok($$select public.idempotency_abandon('key-1')$$, 'abandon of a finished key does nothing');
select is((select state from public.idempotency_begin('key-1', 'POST', '/inventory', 'h1')), 'done', 'a finished key survives abandon');

-- arguments
select throws_ok($$select * from public.idempotency_begin('bad key!', 'POST', '/inventory', 'h')$$, '22023', null, 'a key with a space or symbol is refused');
select throws_ok($$select * from public.idempotency_begin('', 'POST', '/inventory', 'h')$$, '22023', null, 'an empty key is refused');
select throws_ok(format($$select * from public.idempotency_begin(%L, 'POST', '/inventory', 'h')$$, repeat('x', 101)), '22023', null, 'a key over 100 characters is refused');
select throws_ok($$select * from public.idempotency_begin('k', null, '/inventory', 'h')$$, '22023', null, 'a null method is refused with 22023, not a raw not-null error');

-- a stale claim (its owner died) is taken over; a fresh one is not
select pg_temp.as_admin();
insert into public.idempotency_keys (user_id, key, method, path, request_hash, created_at)
values (:'a', 'stale', 'POST', '/inventory', 'hs', now() - interval '3 minutes'),
       (:'a', 'fresh', 'POST', '/inventory', 'hf', now() - interval '1 minute');
select pg_temp.act_as(:'a');
select is((select state from public.idempotency_begin('stale', 'POST', '/inventory', 'hs')), 'new', 'AC-API-25: a claim running for over 2 minutes is taken over');
select is((select state from public.idempotency_begin('stale', 'POST', '/inventory', 'hs')), 'in_progress', '... and then it is a fresh claim');
select is((select state from public.idempotency_begin('fresh', 'POST', '/inventory', 'hf')), 'in_progress', 'a claim running for under 2 minutes is left alone');
select is((select state from public.idempotency_begin('stale', 'POST', '/inventory', 'OTHER')), 'mismatch', 'a stale claim is not taken over by a different request');

-- another user's keys are separate (RLS)
select pg_temp.act_as(:'b');
select is((select state from public.idempotency_begin('key-1', 'POST', '/inventory', 'h1')), 'new', 'NC-DATA-RLS: B''s "key-1" is not A''s');
select is((select count(*)::int from public.idempotency_keys), 1, 'NC-DATA-RLS: B sees only her own keys');
select lives_ok($$select public.idempotency_finish('fresh', 200, '{}'::jsonb)$$, 'B finishing A''s key is harmless');
select lives_ok($$select public.idempotency_abandon('fresh')$$, 'B abandoning A''s key is harmless');
select throws_ok(format($$insert into public.idempotency_keys (user_id, key, method, path, request_hash) values (%L, 'forged', 'POST', '/x', 'h')$$, :'a'),
  '42501', null, 'NC-DATA-RLS: B cannot insert a key for A');
select throws_ok($$insert into public.idempotency_keys (user_id, key, method, path, request_hash) values (auth.uid(), 'bad key', 'POST', '/x', 'h')$$,
  '23514', null, 'the table itself refuses a malformed key');
select pg_temp.act_as(:'a');
select is((select state from public.idempotency_begin('fresh', 'POST', '/inventory', 'hf')), 'in_progress', 'A''s key was untouched by B');

-- old keys are pruned (kept 35 days, longer than the 30-day offline queue), when a new key is stored
select pg_temp.as_admin();
insert into public.idempotency_keys (user_id, key, method, path, request_hash, state, status, response, created_at)
values (:'a', 'ancient', 'POST', '/inventory', 'h', 'done', 200, '{}', now() - interval '36 days'),
       (:'a', 'recent', 'POST', '/inventory', 'h', 'done', 200, '{}', now() - interval '34 days');
select pg_temp.act_as(:'a');
select lives_ok($$select public.idempotency_begin('key-3', 'POST', '/inventory', 'h3')$$, 'storing a new key prunes');
select is((select array_agg(key order by key) from public.idempotency_keys where key in ('ancient', 'recent')), array['recent'], 'AC-API-25: keys older than 35 days are pruned, newer ones kept');

-- no session, no keys
select pg_temp.as_admin();
select set_config('role', 'anon', true);
select throws_ok($$select * from public.idempotency_begin('k', 'POST', '/x', 'h')$$, '42501', null, 'anon cannot use idempotency_begin');
select throws_ok($$select * from public.idempotency_keys$$, '42501', null, 'anon cannot read the table');

select * from finish();
rollback;
