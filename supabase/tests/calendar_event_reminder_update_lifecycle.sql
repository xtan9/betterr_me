-- ralph-ci: true
-- Run after `supabase db reset` against the local instance. Each assertion
-- observes the public update lifecycle; the transaction leaves no data behind.
begin;

select public.ralph_ci_create_auth_user(
  '49100000-0000-0000-0000-000000000001',
  'calendar-update-lifecycle@example.test'
);

select public.ralph_ci_create_auth_user(
  '49100000-0000-0000-0000-000000000002',
  'other-calendar-update-lifecycle@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"49100000-0000-0000-0000-000000000002"}',
  true
);

create temporary table ralph_491_other_ids(event_id uuid, reminder_id uuid) on commit drop;
insert into ralph_491_other_ids
select
  (created->'event'->>'id')::uuid,
  (created->'reminders'->0->>'id')::uuid
from (
  select public.create_calendar_event_with_reminder(
    '49100000-0000-0000-0000-000000000002',
    '{
      "title": "Other user event",
      "start_date": "2026-08-04",
      "start_time": "09:00:00",
      "end_date": "2026-08-04",
      "end_time": "10:00:00"
    }'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 20,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  ) created
) seed;

select set_config(
  'request.jwt.claims',
  '{"sub":"49100000-0000-0000-0000-000000000001"}',
  true
);

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.update_calendar_event_with_reminders(uuid,uuid,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks update lifecycle execute privilege';
  end if;

  if has_function_privilege(
    'anon',
    'public.update_calendar_event_with_reminders(uuid,uuid,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'anonymous update lifecycle execute privilege leaked';
  end if;

  if exists (
    select 1
    from pg_proc function_definition
    cross join lateral aclexplode(function_definition.proacl) privilege
    where function_definition.oid =
      'public.update_calendar_event_with_reminders(uuid,uuid,jsonb,jsonb)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC update lifecycle execute privilege leaked';
  end if;

  if has_table_privilege('authenticated', 'public.calendar_events', 'UPDATE') then
    raise exception 'authenticated retained direct calendar event update privilege';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.transition_calendar_event_reminder(uuid,uuid,text,timestamptz,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks reminder transition execute privilege';
  end if;

  if exists (
    select 1 from pg_roles
    where rolname = 'betterr_calendar_lifecycle'
      and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole
        or rolinherit or rolreplication or rolbypassrls)
  ) then
    raise exception 'lifecycle owner role has unsafe attributes';
  end if;

  if has_schema_privilege('betterr_calendar_lifecycle', 'public', 'CREATE') then
    raise exception 'lifecycle owner retained schema create privilege';
  end if;

  if exists (
    select 1
    from pg_proc routine
    where routine.oid in (
      'public.create_calendar_event_with_reminder(uuid,jsonb,jsonb)'::regprocedure,
      'public.update_calendar_event_with_reminders(uuid,uuid,jsonb,jsonb)'::regprocedure,
      'public.transition_calendar_event_reminder(uuid,uuid,text,timestamptz,timestamptz)'::regprocedure
    )
      and (
        pg_get_userbyid(routine.proowner) <> 'betterr_calendar_lifecycle'
        or not routine.prosecdef
        or not (routine.proconfig @> array['search_path=pg_catalog, public'])
      )
  ) then
    raise exception 'lifecycle function ownership or security settings are unsafe';
  end if;
end
$$;

do $$
declare
  created jsonb;
  outcome jsonb;
  event_id uuid;
  original_reminder_id uuid;
  snoozed_reminder_id uuid;
begin
  created := public.create_calendar_event_with_reminder(
    '49100000-0000-0000-0000-000000000001',
    '{
      "title": "Lifecycle event",
      "start_date": "2026-08-03",
      "start_time": "10:00:00",
      "end_date": "2026-08-03",
      "end_time": "11:00:00"
    }'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  event_id := (created->'event'->>'id')::uuid;
  original_reminder_id := (created->'reminders'->0->>'id')::uuid;

  begin
    update public.calendar_events set title = 'Direct bypass' where id = event_id;
    raise exception 'direct authenticated event update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.reminders (
      user_id, source_type, source_id, reminder_type,
      relative_minutes, channels, fire_at
    ) values (
      '49100000-0000-0000-0000-000000000001', 'calendar_event', event_id,
      'relative', 5, array['push'], '2026-08-03 09:55:00+00'
    );
    raise exception 'direct calendar reminder insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  update public.reminders set fire_at = '2026-08-03 09:00:00+00'
  where id = original_reminder_id;
  if found then
    raise exception 'direct calendar reminder update unexpectedly succeeded';
  end if;

  delete from public.reminders where id = original_reminder_id;
  if found then
    raise exception 'direct calendar reminder delete unexpectedly succeeded';
  end if;

  insert into public.reminders (
    user_id, source_type, source_id, reminder_type,
    absolute_time, channels, fire_at
  ) values (
    '49100000-0000-0000-0000-000000000001', 'task',
    '49100000-0000-0000-0000-000000000301', 'absolute',
    '2026-08-03 09:00:00+00', array['push'], '2026-08-03 09:00:00+00'
  );
  update public.reminders set fire_at = '2026-08-03 09:05:00+00'
  where user_id = '49100000-0000-0000-0000-000000000001'
    and source_type = 'task';
  if not found then
    raise exception 'non-calendar reminder update was blocked';
  end if;
  delete from public.reminders
  where user_id = '49100000-0000-0000-0000-000000000001'
    and source_type = 'task';
  if not found then
    raise exception 'non-calendar reminder delete was blocked';
  end if;

  -- Moving the event with omitted reminder intent preserves its relationship
  -- and recalculates its derived schedule.
  outcome := public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    event_id,
    '{"start_time": "11:00:00"}'::jsonb
  );
  if jsonb_array_length(outcome->'reminders') is distinct from 1
    or (outcome->'reminders'->0->>'id')::uuid
      is distinct from original_reminder_id
    or (outcome->'reminders'->0->>'fire_at')::timestamptz
      is distinct from timestamptz '2026-08-03 10:45:00+00' then
    raise exception 'moving the event did not reconcile its reminder: %', outcome;
  end if;

  -- Supplying unchanged intent on the normal edit path still recalculates a
  -- moved event without replacing the reminder relationship.
  outcome := public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    event_id,
    '{"start_time": "12:00:00"}'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  if jsonb_array_length(outcome->'reminders') is distinct from 1
    or (outcome->'reminders'->0->>'id')::uuid
      is distinct from original_reminder_id
    or (outcome->'reminders'->0->>'fire_at')::timestamptz
      is distinct from timestamptz '2026-08-03 11:45:00+00' then
    raise exception 'moving with unchanged reminder intent did not reconcile: %', outcome;
  end if;

  -- An unrelated event update leaves the reminder record and schedule stable.
  outcome := public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    event_id,
    '{"title": "Renamed lifecycle event"}'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  if jsonb_array_length(outcome->'reminders') is distinct from 1
    or (outcome->'reminders'->0->>'id')::uuid
      is distinct from original_reminder_id
    or (outcome->'reminders'->0->>'fire_at')::timestamptz
      is distinct from timestamptz '2026-08-03 11:45:00+00' then
    raise exception 'unrelated update changed the reminder: %', outcome;
  end if;

  -- Moving and changing intent in one invocation schedules exactly one
  -- reminder from the updated event time.
  outcome := public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    event_id,
    '{"start_time": "13:00:00"}'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 30,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  if jsonb_array_length(outcome->'reminders') is distinct from 1
    or (outcome->'reminders'->0->>'relative_minutes')::integer
      is distinct from 30
    or (outcome->'reminders'->0->>'fire_at')::timestamptz
      is distinct from timestamptz '2026-08-03 12:30:00+00' then
    raise exception 'moving with changed reminder intent did not reconcile: %', outcome;
  end if;

  perform public.transition_calendar_event_reminder(
    '49100000-0000-0000-0000-000000000001',
    (outcome->'reminders'->0->>'id')::uuid,
    'pending',
    '2026-08-03 12:45:00+00',
    null
  );
  if not exists (
    select 1 from public.reminders
    where id = (outcome->'reminders'->0->>'id')::uuid
      and status = 'pending'
      and fire_at = timestamptz '2026-08-03 12:45:00+00'
  ) then
    raise exception 'calendar reminder snooze transition failed';
  end if;

  snoozed_reminder_id := (outcome->'reminders'->0->>'id')::uuid;
  perform public.transition_calendar_event_reminder(
    '49100000-0000-0000-0000-000000000001',
    snoozed_reminder_id,
    'snoozed'
  );

  begin
    perform public.transition_calendar_event_reminder(
      '49100000-0000-0000-0000-000000000001',
      snoozed_reminder_id,
      'pending',
      '2026-08-03 12:50:00+00'
    );
    raise exception 'inactive snoozed reminder was resurrected';
  exception
    when raise_exception then
      if sqlerrm <> 'Inactive snoozed calendar reminders cannot be transitioned' then
        raise;
      end if;
  end;

  outcome := public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    event_id,
    '{}'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 30,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  if jsonb_array_length(outcome->'reminders') is distinct from 1
    or (select count(*) from public.reminders
        where source_id = event_id and status = 'pending') is distinct from 1
    or not exists (select 1 from public.reminders
        where id = snoozed_reminder_id and status = 'snoozed') then
    raise exception 'snoozed history produced duplicate active reminders: %', outcome;
  end if;

  perform public.transition_calendar_event_reminder(
    '49100000-0000-0000-0000-000000000001',
    (outcome->'reminders'->0->>'id')::uuid,
    'sent',
    null,
    '2026-08-03 10:00:01+00'
  );

  -- Terminal delivery history is immutable and cannot be scheduled again.
  begin
    perform public.transition_calendar_event_reminder(
      '49100000-0000-0000-0000-000000000001',
      (outcome->'reminders'->0->>'id')::uuid,
      'pending',
      '2026-08-03 13:00:00+00'
    );
    raise exception 'terminal reminder was resurrected';
  exception
    when raise_exception then
      if sqlerrm <> 'Terminal calendar reminders cannot be transitioned' then
        raise;
      end if;
  end;

  begin
    perform public.transition_calendar_event_reminder(
      '49100000-0000-0000-0000-000000000001',
      (outcome->'reminders'->0->>'id')::uuid,
      'failed'
    );
    raise exception 'terminal reminder was reclassified';
  exception
    when raise_exception then
      if sqlerrm <> 'Terminal calendar reminders cannot be transitioned' then
        raise;
      end if;
  end;

  perform public.transition_calendar_event_reminder(
    '49100000-0000-0000-0000-000000000001',
    (outcome->'reminders'->0->>'id')::uuid,
    'sent'
  );

  -- Replacing reminder intent creates exactly the requested relationship.
  outcome := public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    event_id,
    '{}'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 30,
      "absolute_time": null,
      "channels": ["email"]
    }]'::jsonb
  );
  if jsonb_array_length(outcome->'reminders') is distinct from 1
    or (outcome->'reminders'->0->>'relative_minutes')::integer
      is distinct from 30
    or outcome->'reminders'->0->'channels'
      is distinct from '["email"]'::jsonb then
    raise exception 'changed reminder intent was not reconciled: %', outcome;
  end if;
  if (
    select count(*) is distinct from 1
    from public.reminders
    where source_id = event_id
      and status = 'sent'
  ) then
    raise exception 'changed intent replaced terminal reminder history';
  end if;

  -- Equivalent requested timestamps collapse to one pending relationship.
  outcome := public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    event_id,
    '{}'::jsonb,
    '[{
      "reminder_type": "absolute",
      "relative_minutes": null,
      "absolute_time": "2026-08-03T12:00:00Z",
      "channels": ["push"]
    }, {
      "reminder_type": "absolute",
      "relative_minutes": null,
      "absolute_time": "2026-08-03T12:00:00.000Z",
      "channels": ["push"]
    }]'::jsonb
  );
  if jsonb_array_length(outcome->'reminders') is distinct from 1 then
    raise exception 'equivalent reminder intent produced duplicates: %', outcome;
  end if;

  -- Unused fields and channel ordering do not create duplicate intent.
  outcome := public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    event_id,
    '{}'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 20,
      "absolute_time": "2026-08-03T12:00:00Z",
      "channels": ["push", "email"]
    }, {
      "reminder_type": "relative",
      "relative_minutes": 20,
      "absolute_time": null,
      "channels": ["email", "push", "push"]
    }]'::jsonb
  );
  if jsonb_array_length(outcome->'reminders') is distinct from 1 then
    raise exception 'equivalent relative intent produced duplicates: %', outcome;
  end if;

  -- Empty intent removes the reminder while preserving the event.
  outcome := public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    event_id,
    '{"title": "Event remains"}'::jsonb,
    '[]'::jsonb
  );
  if outcome->'event'->>'title' is distinct from 'Event remains'
    or outcome->'reminders' is distinct from '[]'::jsonb then
    raise exception 'reminder removal did not preserve the event: %', outcome;
  end if;
end
$$;

-- An owned missing event must retain the SQLSTATE consumed by the HTTP
-- not-found mapping.
do $$
begin
  perform public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    '49100000-0000-0000-0000-000000000199',
    '{"title": "Missing"}'::jsonb
  );
  raise exception 'missing event update unexpectedly succeeded';
exception
  when no_data_found then null;
end
$$;

-- A reminder failure after the event update must roll the whole invocation
-- back, including restoration of the reminder deleted during reconciliation.
do $$
declare
  event_id uuid;
  reminder_id uuid;
begin
  select id into event_id
  from public.calendar_events
  where user_id = '49100000-0000-0000-0000-000000000001';

  perform public.update_calendar_event_with_reminders(
    '49100000-0000-0000-0000-000000000001',
    event_id,
    '{}'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 10,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  select id into reminder_id
  from public.reminders
  where source_id = event_id and status = 'pending';

  begin
    perform public.update_calendar_event_with_reminders(
      '49100000-0000-0000-0000-000000000001',
      event_id,
      '{"title": "Must roll back"}'::jsonb,
      '[{
        "reminder_type": "absolute",
        "relative_minutes": null,
        "absolute_time": null,
        "channels": ["push"]
      }]'::jsonb
    );
    raise exception 'invalid reminder update unexpectedly succeeded';
  exception
    when integrity_constraint_violation then null;
  end;

  if not exists (
    select 1
    from public.calendar_events
    where id = event_id
      and title = 'Event remains'
  ) or not exists (
    select 1
    from public.reminders
    where id = reminder_id
  ) then
    raise exception 'failed reconciliation left the schedule inconsistent';
  end if;
end
$$;

-- The authenticated caller cannot spoof another owner or reach another
-- owner's event through an otherwise valid caller identity.
do $$
declare
  other_event_id uuid;
  other_reminder_id uuid;
begin
  select event_id, reminder_id into other_event_id, other_reminder_id
  from ralph_491_other_ids;
  begin
    perform public.update_calendar_event_with_reminders(
      '49100000-0000-0000-0000-000000000002',
      other_event_id,
      '{"title": "Spoofed owner"}'::jsonb,
      '[]'::jsonb
    );
    raise exception 'cross-user owner spoof unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'Cannot update a schedule for another user' then
        raise;
      end if;
  end;

  begin
    perform public.update_calendar_event_with_reminders(
      '49100000-0000-0000-0000-000000000001',
      other_event_id,
      '{"title": "Cross-user event"}'::jsonb,
      '[]'::jsonb
    );
    raise exception 'cross-user event update unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;

  begin
    perform public.transition_calendar_event_reminder(
      '49100000-0000-0000-0000-000000000001',
      other_reminder_id,
      'sent'
    );
    raise exception 'cross-user reminder transition unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;
end
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"49100000-0000-0000-0000-000000000002"}',
  true
);

do $$
declare
  other_event_id uuid;
  other_reminder_id uuid;
begin
  select event_id, reminder_id
  into other_event_id, other_reminder_id
  from ralph_491_other_ids;
  if not exists (
    select 1
    from public.calendar_events
    where id = other_event_id
      and user_id = '49100000-0000-0000-0000-000000000002'
      and title = 'Other user event'
      and start_time = time '09:00:00'
  ) then
    raise exception 'cross-user attempt changed the other user event';
  end if;

  if not exists (
    select 1
    from public.reminders
    where id = other_reminder_id
      and user_id = '49100000-0000-0000-0000-000000000002'
      and source_id = other_event_id
      and relative_minutes = 20
      and status = 'pending'
      and fire_at = timestamptz '2026-08-04 08:40:00+00'
  ) then
    raise exception 'cross-user attempt changed the other user reminder';
  end if;
end
$$;

reset role;
rollback;
