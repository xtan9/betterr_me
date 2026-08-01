-- ralph-ci: true
-- Exercise the Task Reminder Configuration boundary as an authenticated owner.
-- The transaction covers create, replace, remove, retry, ownership, source
-- deletion, and rollback without leaving test data behind.
begin;

select public.ralph_ci_create_auth_user(
  '65500000-0000-0000-0000-000000000001',
  'task-reminders@example.test'
);

select public.ralph_ci_create_auth_user(
  '65500000-0000-0000-0000-000000000002',
  'other-task-reminders@example.test'
);

select set_config('request.jwt.claims', '', false);
select set_config(
  'request.jwt.claim.sub',
  '65500000-0000-0000-0000-000000000001',
  false
);

insert into public.tasks (id, user_id, title, due_date, due_time)
values
  (
    '65500000-0000-0000-0000-000000000101',
    '65500000-0000-0000-0000-000000000001',
    'Task with reminder',
    '2026-08-03',
    '10:00:00'
  ),
  (
    '65500000-0000-0000-0000-000000000102',
    '65500000-0000-0000-0000-000000000001',
    'Task without scheduled date',
    null,
    null
  ),
  (
    '65500000-0000-0000-0000-000000000103',
    '65500000-0000-0000-0000-000000000001',
    'Task with rollback reminder',
    '2026-08-04',
    '11:00:00'
  ),
  (
    '65500000-0000-0000-0000-000000000104',
    '65500000-0000-0000-0000-000000000001',
    'Task that will be deleted',
    '2026-08-05',
    '12:00:00'
  );

select set_config(
  'request.jwt.claim.sub',
  '65500000-0000-0000-0000-000000000002',
  false
);
insert into public.tasks (id, user_id, title, due_date, due_time)
values (
  '65500000-0000-0000-0000-000000000201',
  '65500000-0000-0000-0000-000000000002',
  'Private task',
  '2026-08-03',
  '10:00:00'
);

select set_config(
  'request.jwt.claim.sub',
  '65500000-0000-0000-0000-000000000001',
  false
);
reset role;

create function pg_temp.reject_task_reminder_replacement()
returns trigger
language plpgsql
as $$
begin
  if old.source_id = '65500000-0000-0000-0000-000000000103'::uuid then
    raise exception 'forced Task Reminder Configuration failure';
  end if;
  return old;
end
$$;

create trigger reject_task_reminder_replacement
before delete on public.reminders
for each row execute function pg_temp.reject_task_reminder_replacement();

set local role authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.configure_task_reminders(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks Task Reminder Configuration execute privilege';
  end if;

  if has_function_privilege(
    'anon',
    'public.configure_task_reminders(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'anonymous Task Reminder Configuration execute privilege leaked';
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname = 'betterr_task_lifecycle'
      and (
        rolcanlogin or rolsuper or rolcreatedb or rolcreaterole
        or rolinherit or rolreplication or rolbypassrls
      )
  ) then
    raise exception 'Task lifecycle owner role has unsafe attributes';
  end if;

  if has_schema_privilege('betterr_task_lifecycle', 'public', 'CREATE') then
    raise exception 'Task lifecycle owner retained schema create privilege';
  end if;

  if exists (
    select 1
    from pg_proc routine
    where routine.oid =
      'public.configure_task_reminders(uuid,uuid,jsonb)'::regprocedure
      and (
        pg_get_userbyid(routine.proowner) <> 'betterr_task_lifecycle'
        or not routine.prosecdef
        or not (routine.proconfig @> array['search_path=pg_catalog, public'])
      )
  ) then
    raise exception 'Task Reminder Configuration security settings are unsafe';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.reminders'::regclass
      and attname = 'task_source_id'
      and attgenerated = 's'
  ) then
    raise exception 'Task reminder generated source key is unavailable';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reminders'::regclass
      and conname = 'reminders_task_owner_fkey'
  ) then
    raise exception 'Task reminder owner foreign key is unavailable';
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
  outcome := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000101',
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["push", "email"]
    }]'::jsonb
  );
  if outcome->>'type' <> 'configured'
    or jsonb_array_length(outcome->'reminders') <> 1
    or outcome->'reminders'->0->>'source_type' <> 'task'
    or outcome->'reminders'->0->'channels' <> '["email", "push"]'::jsonb
    or (outcome->'reminders'->0->>'fire_at')::timestamptz
      <> timestamptz '2026-08-03 09:45:00+00' then
    raise exception 'Task Reminder Configuration create was incorrect: %', outcome;
  end if;
  reminder_id := (outcome->'reminders'->0->>'id')::uuid;

  begin
    update public.reminders
    set channels = array['email']
    where id = reminder_id;
    raise exception 'direct Task Reminder Configuration update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm <> 'Task Reminder Configuration must use the Task lifecycle boundary' then
        raise;
      end if;
  end;

  retry := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000101',
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["email", "push"]
    }]'::jsonb
  );
  if retry->>'type' <> 'already-applied'
    or (retry->'reminders'->0->>'id')::uuid <> reminder_id then
    raise exception 'Task Reminder Configuration retry was not idempotent: %', retry;
  end if;

  replacement := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000101',
    '[{
      "reminder_type": "absolute",
      "relative_minutes": null,
      "absolute_time": "2026-08-03T12:00:00Z",
      "channels": ["push"]
    }]'::jsonb
  );
  if replacement->>'type' <> 'configured'
    or jsonb_array_length(replacement->'reminders') <> 1
    or (replacement->'reminders'->0->>'id')::uuid = reminder_id
    or (replacement->'reminders'->0->>'fire_at')::timestamptz
      <> timestamptz '2026-08-03 12:00:00+00' then
    raise exception 'Task Reminder Configuration replacement was incorrect: %', replacement;
  end if;
  terminal_reminder_id := (replacement->'reminders'->0->>'id')::uuid;

  outcome := public.transition_reminder_delivery(
    '65500000-0000-0000-0000-000000000001',
    terminal_reminder_id,
    'user',
    'sent',
    '2026-08-03T12:00:00Z',
    '2026-08-01T12:00:00Z',
    'pending',
    '2026-08-03T12:00:00Z',
    null
  );
  if outcome->>'type' <> 'transitioned' then
    raise exception 'Reminder Delivery terminal seed was incorrect: %', outcome;
  end if;

  outcome := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000101',
    '[{
      "reminder_type": "relative",
      "relative_minutes": 30,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  if outcome->>'type' <> 'configured'
    or not exists (
      select 1 from public.reminders
      where id = terminal_reminder_id and status = 'sent'
    ) then
    raise exception 'Task Reminder Configuration replaced delivery history: %', outcome;
  end if;

  outcome := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000101',
    '[]'::jsonb
  );
  if outcome->>'type' <> 'removed'
    or jsonb_array_length(outcome->'reminders') <> 0
    or exists (
      select 1 from public.reminders
      where source_type = 'task'
        and source_id = '65500000-0000-0000-0000-000000000101'
        and status = 'pending'
    ) then
    raise exception 'Task Reminder Configuration removal was incorrect: %', outcome;
  end if;

  retry := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000101',
    '[]'::jsonb
  );
  if retry->>'type' <> 'already-applied' then
    raise exception 'Task Reminder Configuration removal retry was not idempotent: %', retry;
  end if;
end
$$;

do $$
declare
  outcome jsonb;
begin
  outcome := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000199',
    '[]'::jsonb
  );
  if outcome <> '{"type":"not-found"}'::jsonb then
    raise exception 'Missing Task was not hidden as not-found: %', outcome;
  end if;

  outcome := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000201',
    '[]'::jsonb
  );
  if outcome <> '{"type":"not-found"}'::jsonb then
    raise exception 'Cross-owner Task was not hidden as not-found: %', outcome;
  end if;

  outcome := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000102',
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  if outcome->>'type' <> 'invalid' or outcome->>'field' <> 'task' then
    raise exception 'Relative reminder without Task schedule was not invalid: %', outcome;
  end if;

  outcome := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000101',
    '[
      {"reminder_type":"absolute", "absolute_time":"2026-08-03T12:00:00Z", "channels":["push"]},
      {"reminder_type":"absolute", "absolute_time":"2026-08-03T12:00:00.000Z", "channels":["push"]}
    ]'::jsonb
  );
  if outcome->>'type' <> 'conflict' or outcome->>'resource' <> 'reminder' then
    raise exception 'Duplicate Task Reminder Configuration was not a conflict: %', outcome;
  end if;
end
$$;

-- A failing replacement must restore the deleted pending configuration.
do $$
declare
  created jsonb;
  old_id uuid;
begin
  created := public.configure_task_reminders(
    '65500000-0000-0000-0000-000000000001',
    '65500000-0000-0000-0000-000000000103',
    '[{
      "reminder_type": "absolute",
      "absolute_time": "2026-08-04T10:00:00Z",
      "channels": ["push"]
    }]'::jsonb
  );
  old_id := (created->'reminders'->0->>'id')::uuid;

  begin
    perform public.configure_task_reminders(
      '65500000-0000-0000-0000-000000000001',
      '65500000-0000-0000-0000-000000000103',
      '[{
        "reminder_type": "absolute",
        "absolute_time": "2026-08-04T11:00:00Z",
        "channels": ["email"]
      }]'::jsonb
    );
    raise exception 'Task Reminder Configuration rollback unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'forced Task Reminder Configuration failure' then
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
    raise exception 'Task Reminder Configuration rollback lost the original intent';
  end if;
end
$$;

-- Source deletion cannot leave a contradictory Task reminder row.
reset role;
delete from public.tasks
where id = '65500000-0000-0000-0000-000000000104'
  and user_id = '65500000-0000-0000-0000-000000000001';

do $$
begin
  if exists (
    select 1 from public.reminders
    where source_type = 'task'
      and source_id = '65500000-0000-0000-0000-000000000104'
  ) then
    raise exception 'Task deletion left Reminder Configuration behind';
  end if;
end
$$;

rollback;
