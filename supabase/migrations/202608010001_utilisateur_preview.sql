insert into public.tvp_users (profile_key, display_name, role, timezone)
values ('utilisateur', 'Utilisateur', 'learner', 'America/Martinique')
on conflict (profile_key) do update
set
  display_name = excluded.display_name,
  role = excluded.role,
  timezone = excluded.timezone,
  updated_at = clock_timestamp();
