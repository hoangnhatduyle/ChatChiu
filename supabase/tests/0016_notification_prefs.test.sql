begin;
\ir _helpers.psql
select plan(23);

select pg_temp.new_user('a@chatchiu.test') as a \gset
select pg_temp.new_user('b@chatchiu.test') as b \gset

select has_table('public', 'user_preferences', 'user_preferences exists');
select ok((select relrowsecurity from pg_class where oid = 'public.user_preferences'::regclass), 'NC-DATA-RLS: RLS on user_preferences');
select has_column('public', 'user_preferences', 'last_expiry_reminder_on', 'user_preferences.last_expiry_reminder_on exists');
select col_is_null('public', 'inventory_items', 'low_stock_notified_at', 'inventory_items.low_stock_notified_at is nullable');
select col_default_is('public', 'push_subscriptions', 'channel', 'web-push', 'push_subscriptions.channel defaults to web-push');

select pg_temp.act_as(:'a');
insert into public.user_preferences (user_id) values (:'a');
select results_eq(
  $$select timezone, notify_hour, expiry_alerts, low_stock_alerts, theme from public.user_preferences$$,
  $$values ('UTC'::text, 9, true, true, 'system'::text)$$,
  'AC-API-17: column defaults are UTC, 9:00, both alerts on, theme system'
);
select throws_ok($$update public.user_preferences set notify_hour = 24$$, '23514', null, 'notify_hour must be 0–23');
select throws_ok($$update public.user_preferences set theme = 'sepia'$$, '23514', null, 'theme must be system, light or dark');
-- the old app's subscribe upsert does not send a channel
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (:'a', 'https://web.push.apple.com/x', 'p', 'k');
select is((select channel from public.push_subscriptions where user_id = :'a'), 'web-push', 'AC-DATA-02: old-app subscribe rows get channel web-push');
select throws_ok(
  format($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, channel) values (%L, 'https://e/2', 'p', 'k', 'sms')$$, :'a'),
  '23514', null, 'channel is web-push or local'
);
select throws_ok(
  format($$insert into public.push_failures (user_id, endpoint, message) values (%L, 'https://e', 'x')$$, :'a'),
  '42501', null, 'NC-DATA-RLS: users cannot write push_failures (only the send job can)'
);

select pg_temp.act_as(:'b');
select is((select count(*)::int from public.user_preferences), 0, 'AC-DATA-06: B cannot see A''s preferences');
select throws_ok(
  format($$insert into public.user_preferences (user_id) values (%L)$$, :'a'),
  '42501', null, 'AC-DATA-06: B cannot create preferences for A'
);
update public.user_preferences set notify_hour = 5;
select pg_temp.as_admin();
select is((select notify_hour from public.user_preferences where user_id = :'a'), 9, 'AC-DATA-06: B cannot change A''s preferences');

insert into public.push_failures (user_id, endpoint, status_code, message) values (:'a', 'https://e', 410, 'Gone');
select ok((select relrowsecurity from pg_class where oid = 'public.push_failures'::regclass), 'NC-DATA-RLS: RLS on push_failures');
select pg_temp.act_as(:'a');
select is((select count(*)::int from public.push_failures), 1, 'AC-DATA-16: she can read her own send failures');
select pg_temp.act_as(:'b');
select is((select count(*)::int from public.push_failures), 0, 'AC-DATA-06: B cannot read A''s send failures');

select pg_temp.act_as(:'b');
delete from public.user_preferences where user_id = :'a';
select pg_temp.as_admin();
select is((select count(*)::int from public.user_preferences where user_id = :'a'), 1, 'AC-DATA-06: B cannot delete A''s preferences');
select pg_temp.act_as(:'a');
select throws_ok($$update public.user_preferences set timezone = 'Mars/Base'$$, '22023', null, 'an unknown time zone is rejected on write');
select lives_ok($$update public.user_preferences set timezone = 'Asia/Ho_Chi_Minh'$$, 'a valid IANA zone is accepted');
select throws_ok($$update public.push_failures set message = 'x'$$, '42501', null, 'users cannot update push_failures');
select throws_ok($$delete from public.push_failures$$, '42501', null, 'users cannot delete push_failures');
select pg_temp.as_admin();
set local role anon;
select throws_ok($$select count(*) from public.push_failures$$, '42501', null, 'anon cannot read push_failures');

select * from finish();
rollback;
