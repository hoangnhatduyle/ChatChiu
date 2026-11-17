begin;
\ir _helpers.psql
select plan(7);

select pg_temp.new_user('a@chatchiu.test') as a \gset
select pg_temp.new_user('b@chatchiu.test') as b \gset

select pg_temp.act_as(:'a');
select public.ensure_recipe('Pho bo') as r1 \gset
select ok(:r1 is not null, 'F-MP-05: a new typed meal name becomes a recipe');
select is(public.ensure_recipe('PHO BO'), :r1::bigint, 'AC-DATA-12: a case variant returns the same recipe');
select is(public.ensure_recipe('  Pho bo  '), :r1::bigint, 'surrounding spaces are ignored');
select is((select count(*)::int from public.recipes where lower(name) = 'pho bo'), 1, 'AC-DATA-12: no duplicate recipe');
select is((select ingredients from public.recipes where id = :r1), '', 'the new recipe has no ingredients yet');
select throws_ok($$select public.ensure_recipe('   ')$$, '22023', null, 'a blank name is rejected');

select pg_temp.act_as(:'b');
select isnt(public.ensure_recipe('Pho bo'), :r1::bigint, 'AC-DATA-06: B gets her own recipe, not A''s');

select * from finish();
rollback;
