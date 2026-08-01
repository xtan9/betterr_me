-- ralph-ci: true
-- Exercise the Habit Reminder Configuration boundary as an authenticated owner.
-- The transaction covers create, replace, remove, retry, ownership, source
-- deletion, and rollback without leaving test data behind.
begin;

select public.ralph_ci_create_auth_user(
  '65600000-0000-0000-0000-000000000001',
  'habit-reminders@example.test'
);

select public.ralph_ci_create_auth_user(
  '65600000-0000-0000-0000-000000000002',
  'other-habit-reminders@example.test'
);

select set_config('request.jwt.claims', '', false);
select set_config(
  'request.jwt.claim.sub',
  '65600000-0000-0000-0000-000000000001',
  false
);

insert into public.habits (id, user_id, name, frequency, status)
values
  (
    '65600000-0000-0000-0000-000000000101',
    '65600000-0000-0000-0000-000000000001',
    'Habit with reminder',
    '{"type":"daily"}'::jsonb,
    'active'
  ),
  (
    '65600000-0000-0000-0000-000000000103',
    '65600000-0000-0000-0000-000000000001',
    'Habit with rollback reminder',
    '{"type":"daily"}'::jsonb,
    'active'
  ),
  (
    '65600000-0000-0000-0000-000000000104',
    '65600000-0000-0000-0000-000000000001',
    'Habit that will be deleted',
    '{"type":"daily"}'::jsonb,
    'active'
  ),
  (
    '65600000-0000-0000-0000-000000000106',
    '65600000-0000-0000-0000-000000000001',
    'Habit with deletion rollback',
    '{"type":"daily"}'::jsonb,
    'active'
  );

select set_config(
  'request.jwt.claim.sub',
  '65600000-0000-0000-0000-000000000002',
  false
);
insert into public.habits (id, user_id, name, frequency, status)
values (
  '65600000-0000-0000-0000-000000000201',
  '65600000-0000-0000-0000-000000000002',
  'Private habit',
  '{"type":"daily"}'::jsonb,
  'active'
);

select set_config(
  'request.jwt.claim.sub',
  '65600000-0000-0000-0000-000000000001',
  false
);
reset role;

create function pg_temp.reject_habit_reminder_replacement()
returns trigger
language plpgsql
as $$
begin
  if old.source_id = '65600000-0000-0000-0000-000000000103'::uuid then
    raise exception 'forced Habit Reminder Configuration failure';
  end if;
  return old;
end
$$;

create trigger reject_habit_reminder_replacement
before delete on public.reminders
for each row execute function pg_temp.reject_habit_reminder_replacement();

create function pg_temp.reject_habit_deletion()
returns trigger
language plpgsql
as $$
begin
  if old.id = '65600000-0000-0000-0000-000000000106'::uuid then
    raise exception 'forced Habit deletion failure';
  end if;
  return old;
end
$$;

create trigger reject_habit_deletion
before delete on public.habits
for each row execute function pg_temp.reject_habit_deletion();

set local role authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.configure_habit_reminders(uuid,uuid,jsonb,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks Habit Reminder Configuration execute privilege';
  end if;

  if has_function_privilege(
    'anon',
    'public.configure_habit_reminders(uuid,uuid,jsonb,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'anonymous Habit Reminder Configuration execute privilege leaked';
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname = 'betterr_habit_lifecycle'
      and (
        rolcanlogin or rolsuper or rolcreatedb or rolcreaterole
        or rolinherit or rolreplication or rolbypassrls
      )
  ) then
    raise exception 'Habit lifecycle owner role has unsafe attributes';
  end if;

  if has_schema_privilege('betterr_habit_lifecycle', 'public', 'CREATE') then
    raise exception 'Habit lifecycle owner retained schema create privilege';
  end if;

  if exists (
    select 1
    from pg_proc routine
    where routine.oid =
      'public.configure_habit_reminders(uuid,uuid,jsonb,timestamptz)'::regprocedure
      and (
        pg_get_userbyid(routine.proowner) <> 'betterr_habit_lifecycle'
        or not routine.prosecdef
        or not coalesce(
          routine.proconfig @> array['search_path=pg_catalog, public'],
          false
        )
      )
  ) then
    raise exception 'Habit Reminder Configuration security settings are unsafe';
  end if;

  if has_table_privilege('authenticated', 'public.reminders', 'INSERT')
    or has_table_privilege('authenticated', 'public.reminders', 'DELETE') then
    raise exception 'authenticated retained direct Habit Reminder Configuration writes';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reminders'::regclass
      and conname = 'reminders_habit_owner_fkey'
  ) then
    raise exception 'Habit reminder owner foreign key is unavailable';
  end if;
end
$$;

do $$
declare
  outcome jsonb;
  retry jsonb;
  replacement jsonb;
  reminder_id uuid;
  terminal_reminder_id uuid;
begin
  outcome := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000101',
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["push", "email"]
    }]'::jsonb,
    '2026-08-03T10:00:00Z'
  );
  if outcome->>'type' <> 'configured'
    or jsonb_array_length(outcome->'reminders') <> 1
    or outcome->'reminders'->0->>'source_type' <> 'habit'
    or outcome->'reminders'->0->'channels' <> '["email", "push"]'::jsonb
    or (outcome->'reminders'->0->>'fire_at')::timestamptz
      <> timestamptz '2026-08-03 09:45:00+00' then
    raise exception 'Habit Reminder Configuration create was incorrect: %', outcome;
  end if;
  reminder_id := (outcome->'reminders'->0->>'id')::uuid;

  begin
    update public.reminders
    set channels = array['email']
    where id = reminder_id;
    raise exception 'direct Habit Reminder Configuration update unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'Habit Reminder Configuration must use the Habit lifecycle boundary' then
        raise;
      end if;
  end;

  retry := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000101',
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["email", "push"]
    }]'::jsonb,
    '2026-08-03T10:00:00Z'
  );
  if retry->>'type' <> 'already-applied'
    or (retry->'reminders'->0->>'id')::uuid <> reminder_id then
    raise exception 'Habit Reminder Configuration retry was not idempotent: %', retry;
  end if;

  replacement := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000101',
    '[{
      "reminder_type": "absolute",
      "relative_minutes": null,
      "absolute_time": "2026-08-03T12:00:00Z",
      "channels": ["push"]
    }]',
    null
  );
  if replacement->>'type' <> 'configured'
    or jsonb_array_length(replacement->'reminders') <> 1
    or (replacement->'reminders'->0->>'id')::uuid = reminder_id
    or (replacement->'reminders'->0->>'fire_at')::timestamptz
      <> timestamptz '2026-08-03 12:00:00+00' then
    raise exception 'Habit Reminder Configuration replacement was incorrect: %', replacement;
  end if;
  terminal_reminder_id := (replacement->'reminders'->0->>'id')::uuid;

  update public.reminders
  set status = 'sent', sent_at = '2026-08-01T12:00:00Z'
  where id = terminal_reminder_id;

  outcome := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000101',
    '[{
      "reminder_type": "relative",
      "relative_minutes": 30,
      "absolute_time": null,
      "channels": ["push"]
    }]',
    '2026-08-03T10:00:00Z'
  );
  if outcome->>'type' <> 'configured'
    or not exists (
      select 1 from public.reminders
      where id = terminal_reminder_id and status = 'sent'
    ) then
    raise exception 'Habit Reminder Configuration replaced delivery history: %', outcome;
  end if;

  outcome := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000101',
    '[]'::jsonb,
    null
  );
  if outcome->>'type' <> 'removed'
    or jsonb_array_length(outcome->'reminders') <> 0
    or exists (
      select 1 from public.reminders
      where source_type = 'habit'
        and source_id = '65600000-0000-0000-0000-000000000101'
        and status = 'pending'
    ) then
    raise exception 'Habit Reminder Configuration removal was incorrect: %', outcome;
  end if;

  retry := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000101',
    '[]'::jsonb,
    null
  );
  if retry->>'type' <> 'already-applied' then
    raise exception 'Habit Reminder Configuration removal retry was not idempotent: %', retry;
  end if;
end
$$;

do $$
declare
  outcome jsonb;
begin
  outcome := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000199',
    '[]'::jsonb,
    null
  );
  if outcome <> '{"type":"not-found"}'::jsonb then
    raise exception 'Missing Habit was not hidden as not-found: %', outcome;
  end if;

  outcome := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000201',
    '[]'::jsonb,
    null
  );
  if outcome <> '{"type":"not-found"}'::jsonb then
    raise exception 'Cross-owner Habit was not hidden as not-found: %', outcome;
  end if;

  outcome := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000101',
    '[{
      "source_type": "task",
      "reminder_type": "absolute",
      "absolute_time": "2026-08-03T12:00:00Z",
      "channels": ["push"]
    }]'::jsonb,
    null
  );
  if outcome->>'type' <> 'invalid'
    or outcome->>'field' <> 'reminders[0].sourceType' then
    raise exception 'Habit Reminder Configuration accepted another source: %', outcome;
  end if;

  outcome := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000101',
    '[
      {"reminder_type":"absolute", "absolute_time":"2026-08-03T12:00:00Z", "channels":["push"]},
      {"reminder_type":"absolute", "absolute_time":"2026-08-03T12:00:00.000Z", "channels":["push"]}
    ]'::jsonb,
    null
  );
  if outcome->>'type' <> 'conflict' or outcome->>'resource' <> 'reminder' then
    raise exception 'Duplicate Habit Reminder Configuration was not a conflict: %', outcome;
  end if;
end
$$;

-- A failing replacement must restore the deleted pending configuration.
do $$
declare
  created jsonb;
  old_id uuid;
begin
  created := public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000103',
    '[{
      "reminder_type": "absolute",
      "absolute_time": "2026-08-04T10:00:00Z",
      "channels": ["push"]
    }]',
    null
  );
  old_id := (created->'reminders'->0->>'id')::uuid;

  begin
    perform public.configure_habit_reminders(
      '65600000-0000-0000-0000-000000000001',
      '65600000-0000-0000-0000-000000000103',
      '[{
        "reminder_type": "absolute",
        "absolute_time": "2026-08-04T11:00:00Z",
        "channels": ["email"]
      }]',
      null
    );
    raise exception 'Habit Reminder Configuration rollback unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'forced Habit Reminder Configuration failure' then
        raise;
      end if;
  end;

  if not exists (
    select 1
    from public.reminders
    where id = old_id
      and status = 'pending'
      and absolute_time = timestamptz '2026-08-04 10:00:00+00'
  ) then
    raise exception 'Habit Reminder Configuration rollback lost the original intent';
  end if;
end
$$;

-- Source deletion cannot leave a contradictory Habit reminder row.
do $$
declare
  deleted jsonb;
begin
  perform public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000104',
    '[{
      "reminder_type": "absolute",
      "absolute_time": "2026-08-05T12:00:00Z",
      "channels": ["push"]
    }]',
    null
  );

  deleted := public.delete_habit_atomically(
    '65600000-0000-0000-0000-000000000104',
    '65600000-0000-0000-0000-000000000001'
  );
  if deleted <> '{"type":"deleted"}'::jsonb then
    raise exception 'Habit deletion outcome was incorrect: %', deleted;
  end if;
  if exists (
    select 1 from public.habits
    where id = '65600000-0000-0000-0000-000000000104'
  ) or exists (
    select 1 from public.reminders
    where source_type = 'habit'
      and source_id = '65600000-0000-0000-0000-000000000104'
  ) then
    raise exception 'Habit deletion left Reminder Configuration behind';
  end if;
end
$$;

select set_config(
  'request.jwt.claim.sub',
  '65600000-0000-0000-0000-000000000001',
  false
);

do $$
begin
  perform public.configure_habit_reminders(
    '65600000-0000-0000-0000-000000000001',
    '65600000-0000-0000-0000-000000000106',
    '[{
      "reminder_type": "absolute",
      "absolute_time": "2026-08-05T13:00:00Z",
      "channels": ["push"]
    }]'::jsonb,
    null
  );

  begin
    perform public.delete_habit_atomically(
      '65600000-0000-0000-0000-000000000106',
      '65600000-0000-0000-0000-000000000001'
    );
    raise exception 'Habit deletion rollback unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'forced Habit deletion failure' then
        raise;
      end if;
  end;

  if not exists (
    select 1 from public.habits
    where id = '65600000-0000-0000-0000-000000000106'
  ) or not exists (
    select 1 from public.reminders
    where source_type = 'habit'
      and source_id = '65600000-0000-0000-0000-000000000106'
      and status = 'pending'
  ) then
    raise exception 'failed Habit deletion left a partial persisted outcome';
  end if;
end
$$;

rollback;
