-- Harden the private Preference document before any new owner-facing
-- Current Profile contracts are introduced.
--
-- The preflight blocks malformed supported data and unsupported Week Start
-- values before the backfill runs. Unknown keys and dormant date_format are
-- intentionally not included in the supported contract and are preserved by
-- the merge-only backfill.

-- Inventory private keys first. The inventory is deliberately limited to key
-- names and aggregate counts; it never emits a Preference value.
do $$
declare
  unknown_key_count bigint;
  unknown_key_names text;
begin
  select count(*), string_agg(key, ', ' order by key)
  into unknown_key_count, unknown_key_names
  from (
    select distinct preference_key as key
    from public.profiles
    cross join lateral jsonb_object_keys(
      case
        when jsonb_typeof(preferences) = 'object' then preferences
        else '{}'::jsonb
      end
    ) as preference_key
    where jsonb_typeof(preferences) = 'object'
      and preference_key not in (
      'date_format',
      'theme',
      'week_start_day',
      'weight_unit',
      'email_notifications_enabled',
      'quiet_hours_start',
      'quiet_hours_end'
    )
  ) as inventory;

  raise notice
    'Preference storage preflight unknown keys (%): %',
    unknown_key_count,
    coalesce(unknown_key_names, '<none>');
end
$$;

-- Reject malformed supported data before changing any profile document. A
-- null document is treated as an entirely missing Preference document and is
-- backfilled to the assigned defaults. A one-sided quiet window is
-- intentionally valid preflight input: it is the legacy state that the
-- following backfill repairs to disabled.
do $$
declare
  malformed_profile_count bigint;
  unsupported_week_start_count bigint;
begin
  select count(*)
  into malformed_profile_count
  from public.profiles
  where (
      preferences is not null
      and jsonb_typeof(preferences) <> 'object'
    )
    or (
      preferences ? 'theme'
      and (
        jsonb_typeof(preferences->'theme') <> 'string'
        or preferences->>'theme' not in ('system', 'light', 'dark')
      )
    )
    or (
      preferences ? 'week_start_day'
      and (
        jsonb_typeof(preferences->'week_start_day') <> 'number'
        or case
          when jsonb_typeof(preferences->'week_start_day') = 'number' then
            (preferences->>'week_start_day')::numeric
              <> trunc((preferences->>'week_start_day')::numeric)
          else false
        end
      )
    )
    or (
      preferences ? 'weight_unit'
      and (
        jsonb_typeof(preferences->'weight_unit') <> 'string'
        or preferences->>'weight_unit' not in ('kg', 'lbs')
      )
    )
    or (
      preferences ? 'email_notifications_enabled'
      and jsonb_typeof(preferences->'email_notifications_enabled') <> 'boolean'
    )
    or (
      preferences ? 'quiet_hours_start'
      and case jsonb_typeof(preferences->'quiet_hours_start')
        when 'null' then false
        when 'string' then (preferences->>'quiet_hours_start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        else true
      end
    )
    or (
      preferences ? 'quiet_hours_end'
      and case jsonb_typeof(preferences->'quiet_hours_end')
        when 'null' then false
        when 'string' then (preferences->>'quiet_hours_end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        else true
      end
    )
    or (
      jsonb_typeof(preferences->'quiet_hours_start') = 'string'
      and jsonb_typeof(preferences->'quiet_hours_end') = 'string'
      and preferences->>'quiet_hours_start' = preferences->>'quiet_hours_end'
    );

  if malformed_profile_count > 0 then
    raise exception using
      errcode = '22023',
      message = format(
        'Preference storage preflight rejected %s profile(s) with malformed supported data',
        malformed_profile_count
      );
  end if;

  select count(*)
  into unsupported_week_start_count
  from public.profiles
  where preferences ? 'week_start_day'
    and jsonb_typeof(preferences->'week_start_day') = 'number'
    and (preferences->>'week_start_day')::numeric
      = trunc((preferences->>'week_start_day')::numeric)
    and (preferences->>'week_start_day')::numeric not in (0, 1);

  if unsupported_week_start_count > 0 then
    raise exception using
      errcode = '22023',
      message = format(
        'Preference storage preflight found %s unsupported Week Start value(s); explicit review required',
        unsupported_week_start_count
      );
  end if;
end
$$;

alter table public.profiles
  add column preference_revision bigint not null default 0;

-- Backfill only supported keys. JSONB concatenation preserves unknown keys and
-- dormant date_format exactly as stored. A valid one-sided window is repaired
-- to the disabled representation and reported as one aggregate count.
do $$
declare
  one_sided_quiet_window_count bigint;
  missing_theme_count bigint;
  missing_week_start_count bigint;
  missing_weight_unit_count bigint;
  missing_email_count bigint;
  changed_profile_count bigint;
begin
  select count(*)
  into one_sided_quiet_window_count
  from public.profiles
  where (
    jsonb_typeof(preferences->'quiet_hours_start') = 'string'
    and jsonb_typeof(preferences->'quiet_hours_end') is distinct from 'string'
  )
  or (
    jsonb_typeof(preferences->'quiet_hours_start') is distinct from 'string'
    and jsonb_typeof(preferences->'quiet_hours_end') = 'string'
  );

  select
    count(*) filter (where not coalesce(preferences ? 'theme', false)),
    count(*) filter (where not coalesce(preferences ? 'week_start_day', false)),
    count(*) filter (where not coalesce(preferences ? 'weight_unit', false)),
    count(*) filter (where not coalesce(preferences ? 'email_notifications_enabled', false))
  into
    missing_theme_count,
    missing_week_start_count,
    missing_weight_unit_count,
    missing_email_count
  from public.profiles;

  update public.profiles
  set preferences = coalesce(preferences, '{}'::jsonb)
    || jsonb_build_object(
      'theme', case
        when preferences ? 'theme' then preferences->'theme'
        else to_jsonb('system'::text)
      end,
      'week_start_day', case
        when preferences ? 'week_start_day' then preferences->'week_start_day'
        else '1'::jsonb
      end,
      'weight_unit', case
        when preferences ? 'weight_unit' then preferences->'weight_unit'
        else to_jsonb('kg'::text)
      end,
      -- Preserve the legacy consent value while the nested Preference is
      -- absent; the legacy column's false default supplies the stable default.
      'email_notifications_enabled', case
        when preferences ? 'email_notifications_enabled'
          then preferences->'email_notifications_enabled'
        else to_jsonb(coalesce(email_notifications_enabled, false))
      end,
      'quiet_hours_start', case
        when jsonb_typeof(preferences->'quiet_hours_start') = 'string'
          and jsonb_typeof(preferences->'quiet_hours_end') = 'string'
          then preferences->'quiet_hours_start'
        else 'null'::jsonb
      end,
      'quiet_hours_end', case
        when jsonb_typeof(preferences->'quiet_hours_start') = 'string'
          and jsonb_typeof(preferences->'quiet_hours_end') = 'string'
          then preferences->'quiet_hours_end'
        else 'null'::jsonb
      end
    )
  where preferences is null
    or not coalesce(preferences ? 'theme', false)
    or not coalesce(preferences ? 'week_start_day', false)
    or not coalesce(preferences ? 'weight_unit', false)
    or not coalesce(preferences ? 'email_notifications_enabled', false)
    or not coalesce(
      (preferences ? 'quiet_hours_start')
        and (preferences ? 'quiet_hours_end'),
      false
    )
    or (
      jsonb_typeof(preferences->'quiet_hours_start') = 'string'
      and jsonb_typeof(preferences->'quiet_hours_end') is distinct from 'string'
    )
    or (
      jsonb_typeof(preferences->'quiet_hours_start') is distinct from 'string'
      and jsonb_typeof(preferences->'quiet_hours_end') = 'string'
    );
  get diagnostics changed_profile_count = row_count;

  raise notice
    'Preference storage backfill: changed profiles %, defaults theme %, week start %, weight unit %, reminder email %, repaired one-sided Push Quiet Windows %',
    changed_profile_count,
    missing_theme_count,
    missing_week_start_count,
    missing_weight_unit_count,
    missing_email_count,
    one_sided_quiet_window_count;
end
$$;

alter table public.profiles
  alter column preferences set default '{
    "date_format": "MM/DD/YYYY",
    "week_start_day": 1,
    "theme": "system",
    "weight_unit": "kg",
    "email_notifications_enabled": false,
    "quiet_hours_start": null,
    "quiet_hours_end": null
  }'::jsonb,
  alter column preferences set not null;

alter table public.profiles
  add constraint profiles_preference_revision_nonnegative_check
    check (preference_revision >= 0),
  add constraint profiles_preferences_object_check
    check (jsonb_typeof(preferences) = 'object');

alter table public.profiles
  add constraint profiles_supported_preferences_check
    check (
      preferences ? 'theme'
      and jsonb_typeof(preferences->'theme') = 'string'
      and preferences->>'theme' in ('system', 'light', 'dark')
      and preferences ? 'week_start_day'
      and case
        when jsonb_typeof(preferences->'week_start_day') = 'number' then
          (preferences->>'week_start_day')::numeric
            = trunc((preferences->>'week_start_day')::numeric)
            and (preferences->>'week_start_day')::numeric in (0, 1)
        else false
      end
      and preferences ? 'weight_unit'
      and jsonb_typeof(preferences->'weight_unit') = 'string'
      and preferences->>'weight_unit' in ('kg', 'lbs')
      and preferences ? 'email_notifications_enabled'
      and jsonb_typeof(preferences->'email_notifications_enabled') = 'boolean'
    ),
  add constraint profiles_push_quiet_window_pair_check
    check (
      preferences ? 'quiet_hours_start'
      and preferences ? 'quiet_hours_end'
      and (
        (
          jsonb_typeof(preferences->'quiet_hours_start') = 'null'
          and jsonb_typeof(preferences->'quiet_hours_end') = 'null'
        )
        or (
          jsonb_typeof(preferences->'quiet_hours_start') = 'string'
          and jsonb_typeof(preferences->'quiet_hours_end') = 'string'
          and preferences->>'quiet_hours_start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and preferences->>'quiet_hours_end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and preferences->>'quiet_hours_start'
            <> preferences->>'quiet_hours_end'
        )
      )
    );

-- Preference Revision is assigned by the database whenever the JSON document
-- changes. Caller-supplied revision values are ignored rather than accepted.
create or replace function public.assign_profile_preference_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.preference_revision := 0;
  elsif new.preferences is distinct from old.preferences then
    new.preference_revision := old.preference_revision + 1;
  else
    new.preference_revision := old.preference_revision;
  end if;

  return new;
end;
$$;

create trigger profiles_preference_revision
  before insert or update on public.profiles
  for each row
  execute function public.assign_profile_preference_revision();

revoke execute on function public.assign_profile_preference_revision()
  from public, anon, authenticated, service_role;

-- Keep the compatibility RPC's validation aligned with the constrained
-- document. Its JSONB merge remains intentionally non-replacing so legacy
-- callers preserve unrelated private keys while the trigger assigns revision.
create or replace function public.update_profile_preferences(
  profile_id uuid,
  preference_patch jsonb
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  updated_profile public.profiles;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
  ) is distinct from 'service_role'
  and coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
    )::uuid is distinct from profile_id then
    raise exception 'Cannot update preferences for another user';
  end if;

  if preference_patch is null
    or jsonb_typeof(preference_patch) <> 'object'
    or preference_patch = '{}'::jsonb then
    raise exception using
      errcode = '22023',
      message = 'Preference patch must be a non-empty object';
  end if;

  if preference_patch - array[
    'date_format',
    'week_start_day',
    'theme',
    'weight_unit',
    'quiet_hours_start',
    'quiet_hours_end',
    'email_notifications_enabled'
  ] <> '{}'::jsonb then
    raise exception using
      errcode = '22023',
      message = 'Preference patch contains unsupported keys';
  end if;

  if preference_patch ? 'date_format'
    and (
      jsonb_typeof(preference_patch->'date_format') <> 'string'
      or length(preference_patch->>'date_format') not between 1 and 50
    ) then
    raise exception using errcode = '22023', message = 'Invalid date_format';
  end if;

  if preference_patch ? 'week_start_day'
    and (
      jsonb_typeof(preference_patch->'week_start_day') <> 'number'
      or (preference_patch->>'week_start_day')::numeric not in (0, 1)
      or trunc((preference_patch->>'week_start_day')::numeric)
        <> (preference_patch->>'week_start_day')::numeric
    ) then
    raise exception using errcode = '22023', message = 'Invalid week_start_day';
  end if;

  if preference_patch ? 'theme'
    and (
      jsonb_typeof(preference_patch->'theme') <> 'string'
      or preference_patch->>'theme' not in ('system', 'light', 'dark')
    ) then
    raise exception using errcode = '22023', message = 'Invalid theme';
  end if;

  if preference_patch ? 'weight_unit'
    and (
      jsonb_typeof(preference_patch->'weight_unit') <> 'string'
      or preference_patch->>'weight_unit' not in ('kg', 'lbs')
    ) then
    raise exception using errcode = '22023', message = 'Invalid weight_unit';
  end if;

  if preference_patch ? 'quiet_hours_start'
    and jsonb_typeof(preference_patch->'quiet_hours_start') not in ('null', 'string') then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_start';
  end if;

  if jsonb_typeof(preference_patch->'quiet_hours_start') = 'string'
    and (preference_patch->>'quiet_hours_start')
      !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_start';
  end if;

  if preference_patch ? 'quiet_hours_end'
    and jsonb_typeof(preference_patch->'quiet_hours_end') not in ('null', 'string') then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_end';
  end if;

  if jsonb_typeof(preference_patch->'quiet_hours_end') = 'string'
    and (preference_patch->>'quiet_hours_end')
      !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_end';
  end if;

  if preference_patch ? 'email_notifications_enabled'
    and jsonb_typeof(preference_patch->'email_notifications_enabled') <> 'boolean' then
    raise exception using
      errcode = '22023',
      message = 'Invalid email_notifications_enabled';
  end if;

  update public.profiles
  set preferences = preferences || preference_patch
  where id = profile_id
  returning * into updated_profile;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = format('Profile not found for user %s', profile_id);
  end if;

  return to_jsonb(updated_profile);
end;
$$;

alter function public.update_profile_preferences(uuid, jsonb)
  security definer;
alter function public.update_profile_preferences(uuid, jsonb)
  owner to betterr_profile_preferences;
revoke execute on function public.update_profile_preferences(uuid, jsonb)
  from public, anon;
grant execute on function public.update_profile_preferences(uuid, jsonb)
  to authenticated, service_role;
