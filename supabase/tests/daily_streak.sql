begin;
create extension if not exists pgtap;
select plan(10);

insert into public.tvp_users (profile_key, display_name, role, timezone)
values ('streak-test', 'Test Streak', 'learner', 'America/Martinique')
on conflict (profile_key) do update
set
  current_streak = 0,
  longest_streak = 0,
  last_successful_login_at = null,
  last_successful_login_local_date = null,
  last_streak_increment_at = null,
  last_streak_increment_local_date = null,
  streak_status = 'new';

select is(
  (public.tvp_update_daily_streak_locked(
    (select id from public.tvp_users where profile_key = 'streak-test'),
    '2026-07-20 12:00:00+00'
  )->>'event'),
  'started',
  'first login starts the streak'
);

select is(
  (select current_streak from public.tvp_users where profile_key = 'streak-test'),
  1,
  'first login stores one day'
);

select is(
  (public.tvp_update_daily_streak_locked(
    (select id from public.tvp_users where profile_key = 'streak-test'),
    '2026-07-20 20:00:00+00'
  )->>'event'),
  'already_counted',
  'same local day does not increment'
);

select is(
  (public.tvp_update_daily_streak_locked(
    (select id from public.tvp_users where profile_key = 'streak-test'),
    '2026-07-21 19:59:00+00'
  )->>'event'),
  'incremented',
  'new local day before 24 hours increments'
);

select is(
  (select current_streak from public.tvp_users where profile_key = 'streak-test'),
  2,
  'valid consecutive login stores two days'
);

update public.tvp_users
set
  last_successful_login_at = '2026-07-21 20:00:00+00',
  last_successful_login_local_date = '2026-07-21',
  current_streak = 2,
  streak_status = 'active'
where profile_key = 'streak-test';

select is(
  (public.tvp_update_daily_streak_locked(
    (select id from public.tvp_users where profile_key = 'streak-test'),
    '2026-07-22 20:00:00+00'
  )->>'event'),
  'broken',
  'exactly 24 hours breaks the streak'
);

select is(
  (select current_streak from public.tvp_users where profile_key = 'streak-test'),
  0,
  'broken streak is stored as zero'
);

select is(
  (select longest_streak from public.tvp_users where profile_key = 'streak-test'),
  2,
  'personal record survives a break'
);

select is(
  (public.tvp_update_daily_streak_locked(
    (select id from public.tvp_users where profile_key = 'streak-test'),
    '2026-07-22 21:00:00+00'
  )->>'event'),
  'already_counted',
  'same local day after a break stays broken'
);

select is(
  (public.tvp_update_daily_streak_locked(
    (select id from public.tvp_users where profile_key = 'streak-test'),
    '2026-07-23 05:00:00+00'
  )->>'event'),
  'started',
  'next local day restarts at one'
);

select * from finish();
rollback;
