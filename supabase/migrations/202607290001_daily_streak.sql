create extension if not exists pgcrypto;

create table if not exists public.tvp_users (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique,
  display_name text not null,
  role text not null check (role in ('learner', 'admin')),
  timezone text not null default 'America/Martinique',
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_successful_login_at timestamptz,
  last_successful_login_local_date date,
  last_streak_increment_at timestamptz,
  last_streak_increment_local_date date,
  streak_status text not null default 'new' check (streak_status in ('active', 'broken', 'new')),
  reward_sound_enabled boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.tvp_daily_streak_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tvp_users(id) on delete cascade,
  local_date date not null,
  checked_in_at timestamptz not null default clock_timestamp(),
  unique (user_id, local_date)
);

create index if not exists tvp_daily_streak_check_ins_user_date_idx
  on public.tvp_daily_streak_check_ins (user_id, local_date desc);

create table if not exists public.tvp_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tvp_users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp()
);

create index if not exists tvp_sessions_user_id_idx on public.tvp_sessions (user_id);
create index if not exists tvp_sessions_expires_at_idx on public.tvp_sessions (expires_at);

create table if not exists public.tvp_login_attempts (
  client_key text primary key check (client_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts >= 0),
  blocked_until timestamptz
);

alter table public.tvp_users enable row level security;
alter table public.tvp_daily_streak_check_ins enable row level security;
alter table public.tvp_sessions enable row level security;
alter table public.tvp_login_attempts enable row level security;

revoke all on public.tvp_users from anon, authenticated;
revoke all on public.tvp_daily_streak_check_ins from anon, authenticated;
revoke all on public.tvp_sessions from anon, authenticated;
revoke all on public.tvp_login_attempts from anon, authenticated;

insert into public.tvp_users (profile_key, display_name, role, timezone)
values
  ('aedan-dechavigny', 'Aedan De Chavigny', 'learner', 'America/Martinique'),
  ('yann', 'Yann', 'learner', 'America/Martinique'),
  ('charly-labbetoul', 'Charly Labbetoul', 'admin', 'America/Martinique')
on conflict (profile_key) do update
set
  display_name = excluded.display_name,
  role = excluded.role,
  timezone = excluded.timezone,
  updated_at = clock_timestamp();

create or replace function public.tvp_week_progress(
  p_user_id uuid,
  p_local_date date
)
returns jsonb
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with week_bounds as (
    select (p_local_date - (extract(isodow from p_local_date)::integer - 1))::date as week_start
  ),
  days as (
    select (week_start + offset_value)::date as local_date
    from week_bounds
    cross join generate_series(0, 6) as offset_value
  ),
  check_ins as (
    select local_date, min(checked_in_at) as checked_in_at
    from public.tvp_daily_streak_check_ins
    where user_id = p_user_id
      and local_date between (select min(local_date) from days) and (select max(local_date) from days)
    group by local_date
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'localDate', to_char(days.local_date, 'YYYY-MM-DD'),
        'label', case extract(isodow from days.local_date)::integer
          when 1 then 'Lun.'
          when 2 then 'Mar.'
          when 3 then 'Mer.'
          when 4 then 'Jeu.'
          when 5 then 'Ven.'
          when 6 then 'Sam.'
          else 'Dim.'
        end,
        'state', case
          when days.local_date > p_local_date then 'future'
          when check_ins.checked_in_at is not null and days.local_date = p_local_date then 'today_validated'
          when check_ins.checked_in_at is not null then 'validated'
          else 'missed'
        end,
        'checkedInAt', check_ins.checked_in_at
      )
      order by days.local_date
    ),
    '[]'::jsonb
  )
  from days
  left join check_ins using (local_date);
$$;

create or replace function public.tvp_streak_payload(
  p_user_id uuid,
  p_event text
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'currentStreak', users.current_streak,
    'longestStreak', users.longest_streak,
    'lastSuccessfulLoginAt', users.last_successful_login_at,
    'lastStreakIncrementAt', users.last_streak_increment_at,
    'lastStreakIncrementLocalDate', users.last_streak_increment_local_date,
    'status', users.streak_status,
    'timezone', users.timezone,
    'event', p_event,
    'shouldCelebrate', p_event in ('started', 'incremented'),
    'shouldPlaySound', p_event in ('started', 'incremented') and users.reward_sound_enabled,
    'weekProgress', public.tvp_week_progress(
      users.id,
      coalesce(
        users.last_successful_login_local_date,
        (clock_timestamp() at time zone users.timezone)::date
      )
    )
  )
  from public.tvp_users as users
  where users.id = p_user_id;
$$;

create or replace function public.tvp_update_daily_streak_locked(
  p_user_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_state public.tvp_users%rowtype;
  local_date_now date;
  elapsed interval;
  event_name text;
  next_streak integer;
begin
  select *
  into user_state
  from public.tvp_users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Unknown TradeVisionPro user';
  end if;

  local_date_now := (p_now at time zone user_state.timezone)::date;

  if user_state.last_successful_login_at is null then
    event_name := 'started';
    insert into public.tvp_daily_streak_check_ins (user_id, local_date, checked_in_at)
    values (p_user_id, local_date_now, p_now)
    on conflict (user_id, local_date) do nothing;

    update public.tvp_users
    set
      current_streak = 1,
      longest_streak = greatest(longest_streak, 1),
      last_successful_login_at = p_now,
      last_successful_login_local_date = local_date_now,
      last_streak_increment_at = p_now,
      last_streak_increment_local_date = local_date_now,
      streak_status = 'active',
      updated_at = p_now
    where id = p_user_id;

  elsif user_state.last_successful_login_local_date = local_date_now then
    event_name := 'already_counted';
    update public.tvp_users
    set
      last_successful_login_at = p_now,
      updated_at = p_now
    where id = p_user_id;

  else
    elapsed := p_now - user_state.last_successful_login_at;

    if elapsed >= interval '24 hours' then
      event_name := 'broken';
      update public.tvp_users
      set
        current_streak = 0,
        last_successful_login_at = p_now,
        last_successful_login_local_date = local_date_now,
        streak_status = 'broken',
        updated_at = p_now
      where id = p_user_id;

    else
      event_name := case
        when user_state.streak_status = 'broken' or user_state.current_streak = 0 then 'started'
        else 'incremented'
      end;
      next_streak := case
        when event_name = 'started' then 1
        else user_state.current_streak + 1
      end;

      insert into public.tvp_daily_streak_check_ins (user_id, local_date, checked_in_at)
      values (p_user_id, local_date_now, p_now)
      on conflict (user_id, local_date) do nothing;

      update public.tvp_users
      set
        current_streak = next_streak,
        longest_streak = greatest(longest_streak, next_streak),
        last_successful_login_at = p_now,
        last_successful_login_local_date = local_date_now,
        last_streak_increment_at = p_now,
        last_streak_increment_local_date = local_date_now,
        streak_status = 'active',
        updated_at = p_now
      where id = p_user_id;
    end if;
  end if;

  return public.tvp_streak_payload(p_user_id, event_name);
end;
$$;

create or replace function public.tvp_login_and_update_streak(
  p_profile_key text,
  p_session_hash text,
  p_session_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_user public.tvp_users%rowtype;
  selected_user_id uuid;
  streak_result jsonb;
  server_now timestamptz := clock_timestamp();
begin
  select *
  into selected_user
  from public.tvp_users
  where profile_key = p_profile_key;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  selected_user_id := selected_user.id;

  insert into public.tvp_sessions (user_id, token_hash, expires_at, created_at, last_seen_at)
  values (selected_user_id, p_session_hash, p_session_expires_at, server_now, server_now);

  streak_result := public.tvp_update_daily_streak_locked(selected_user_id, server_now);

  select *
  into selected_user
  from public.tvp_users
  where id = selected_user_id;

  return jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'id', selected_user.profile_key,
      'name', selected_user.display_name,
      'role', selected_user.role
    ),
    'preferences', jsonb_build_object(
      'rewardSoundEnabled', selected_user.reward_sound_enabled
    ),
    'streak', streak_result
  );
end;
$$;

create or replace function public.tvp_session_snapshot(
  p_session_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_user public.tvp_users%rowtype;
  selected_session public.tvp_sessions%rowtype;
  server_now timestamptz := clock_timestamp();
begin
  select sessions.*
  into selected_session
  from public.tvp_sessions as sessions
  where sessions.token_hash = p_session_hash
    and sessions.expires_at > server_now
  for update;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  update public.tvp_sessions
  set last_seen_at = server_now
  where id = selected_session.id;

  select *
  into selected_user
  from public.tvp_users
  where id = selected_session.user_id;

  return jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'id', selected_user.profile_key,
      'name', selected_user.display_name,
      'role', selected_user.role
    ),
    'preferences', jsonb_build_object(
      'rewardSoundEnabled', selected_user.reward_sound_enabled
    ),
    'streak', public.tvp_streak_payload(selected_user.id, 'already_counted')
  );
end;
$$;

create or replace function public.tvp_set_reward_sound(
  p_session_hash text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_session public.tvp_sessions%rowtype;
begin
  select *
  into selected_session
  from public.tvp_sessions
  where token_hash = p_session_hash
    and expires_at > clock_timestamp();

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  update public.tvp_users
  set reward_sound_enabled = p_enabled, updated_at = clock_timestamp()
  where id = selected_session.user_id;

  return jsonb_build_object('ok', true, 'rewardSoundEnabled', p_enabled);
end;
$$;

create or replace function public.tvp_logout(
  p_session_hash text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with deleted as (
    delete from public.tvp_sessions where token_hash = p_session_hash returning 1
  )
  select exists(select 1 from deleted);
$$;

create or replace function public.tvp_allow_login_attempt(
  p_client_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attempt_state public.tvp_login_attempts%rowtype;
  server_now timestamptz := clock_timestamp();
  retry_seconds integer;
begin
  insert into public.tvp_login_attempts (client_key, window_started_at, attempts)
  values (p_client_key, server_now, 0)
  on conflict (client_key) do nothing;

  select *
  into attempt_state
  from public.tvp_login_attempts
  where client_key = p_client_key
  for update;

  if attempt_state.blocked_until is not null and attempt_state.blocked_until > server_now then
    retry_seconds := ceil(extract(epoch from (attempt_state.blocked_until - server_now)))::integer;
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', retry_seconds);
  end if;

  if attempt_state.window_started_at <= server_now - interval '15 minutes' then
    update public.tvp_login_attempts
    set window_started_at = server_now, attempts = 1, blocked_until = null
    where client_key = p_client_key;
    return jsonb_build_object('allowed', true, 'remaining', 7);
  end if;

  if attempt_state.attempts >= 7 then
    update public.tvp_login_attempts
    set attempts = attempts + 1, blocked_until = server_now + interval '15 minutes'
    where client_key = p_client_key;
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 900);
  end if;

  update public.tvp_login_attempts
  set attempts = attempts + 1, blocked_until = null
  where client_key = p_client_key;

  return jsonb_build_object('allowed', true, 'remaining', 7 - (attempt_state.attempts + 1));
end;
$$;

create or replace function public.tvp_clear_login_attempt(
  p_client_key text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.tvp_login_attempts where client_key = p_client_key;
$$;

revoke all on function public.tvp_week_progress(uuid, date) from public, anon, authenticated;
revoke all on function public.tvp_streak_payload(uuid, text) from public, anon, authenticated;
revoke all on function public.tvp_update_daily_streak_locked(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.tvp_login_and_update_streak(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tvp_session_snapshot(text) from public, anon, authenticated;
revoke all on function public.tvp_set_reward_sound(text, boolean) from public, anon, authenticated;
revoke all on function public.tvp_logout(text) from public, anon, authenticated;
revoke all on function public.tvp_allow_login_attempt(text) from public, anon, authenticated;
revoke all on function public.tvp_clear_login_attempt(text) from public, anon, authenticated;

grant execute on function public.tvp_login_and_update_streak(text, text, timestamptz) to service_role;
grant execute on function public.tvp_session_snapshot(text) to service_role;
grant execute on function public.tvp_set_reward_sound(text, boolean) to service_role;
grant execute on function public.tvp_logout(text) to service_role;
grant execute on function public.tvp_allow_login_attempt(text) to service_role;
grant execute on function public.tvp_clear_login_attempt(text) to service_role;
