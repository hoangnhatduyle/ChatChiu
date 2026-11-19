begin;
\ir _helpers.psql
select plan(14);

select pg_temp.new_user('a@chatchiu.test') as a \gset
select pg_temp.new_user('b@chatchiu.test') as b \gset

select has_table('public', 'api_write_budget', 'api_write_budget exists');
select ok((select relrowsecurity from pg_class where oid = 'public.api_write_budget'::regclass), 'NC-DATA-RLS: RLS on api_write_budget');
select ok(not has_table_privilege('authenticated', 'public.api_write_budget', 'SELECT'), 'authenticated cannot read the counters');
select ok(not has_table_privilege('authenticated', 'public.api_write_budget', 'UPDATE'), 'authenticated cannot change the counters (no resetting her own budget)');
select ok(not has_table_privilege('anon', 'public.api_write_budget', 'SELECT'), 'anon has no access to the table');
select ok(not has_function_privilege('anon', 'public.consume_write_budget(integer)', 'EXECUTE'), 'anon cannot call consume_write_budget');
select ok(has_function_privilege('authenticated', 'public.consume_write_budget(integer)', 'EXECUTE'), 'authenticated can call consume_write_budget');

select pg_temp.act_as(:'a');
select is(public.consume_write_budget(3), true, 'the 1st write is within a budget of 3');
select is(public.consume_write_budget(3), true, 'the 2nd write is within a budget of 3');
select is(public.consume_write_budget(3), true, 'the 3rd write is within a budget of 3');
select is(public.consume_write_budget(3), false, 'the 4th write in the same minute is over a budget of 3');

select pg_temp.act_as(:'b');
select is(public.consume_write_budget(3), true, 'another user has her own budget');

select pg_temp.as_admin();
select throws_ok($$select public.consume_write_budget(3)$$, '28000', null, 'no signed-in user, no budget');
-- an old window is dropped the next time the owner calls
insert into public.api_write_budget (user_id, window_start, writes) values (:'a', now() - interval '2 hours', 5);
select pg_temp.act_as(:'a');
select public.consume_write_budget(100);
select pg_temp.as_admin();
select is((select count(*)::int from public.api_write_budget where user_id = :'a' and window_start < now() - interval '1 hour'), 0, 'windows older than an hour are pruned');

select * from finish();
rollback;
