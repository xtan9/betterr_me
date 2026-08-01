-- ralph-ci: true
-- Exercises create, update, and delete through the public scheduling lifecycle.
-- The transaction leaves no test identity or schedule data behind.
begin;

select public.ralph_ci_create_auth_user(
  '49900000-0000-0000-0000-000000000001',
  'calendar-delete-lifecycle@example.test'
);

select public.ralph_ci_create_auth_user(
  '49900000-0000-0000-0000-000000000002',
  'other-calendar-delete-lifecycle@example.test'
);

create temporary table ralph_499_ids (
  label text primary key,
  event_id uuid not null,
  reminder_id uuid
) on commit drop;
grant select, insert on ralph_499_ids to authenticated;

create function pg_temp.reject_rollback_event_delete()
returns trigger
language plpgsql
as $$
begin
  if old.title = 'Rollback lifecycle' then
    raise exception 'forced calendar delete failure';
  end if;
  return old;
end
$$;

create trigger reject_rollback_event_delete
before delete on public.calendar_events
for each row execute function pg_temp.reject_rollback_event_delete();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"49900000-0000-0000-0000-000000000001"}',
  true
);

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.delete_calendar_event_with_reminders(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks delete lifecycle execute privilege';
  end if;

  if has_function_privilege(
    'anon',
    'public.delete_calendar_event_with_reminders(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anonymous delete lifecycle execute privilege leaked';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.calendar_events',
    'DELETE'
  ) then
    raise exception 'authenticated retained direct calendar event delete privilege';
  end if;

  if has_schema_privilege(
    'betterr_calendar_lifecycle',
    'public',
    'CREATE'
  ) then
    raise exception 'lifecycle owner retained schema create privilege';
  end if;

  if exists (
    select 1
    from pg_proc routine
    where routine.oid =
      'public.delete_calendar_event_with_reminders(uuid,uuid)'::regprocedure
      and (
        pg_get_userbyid(routine.proowner) <> 'betterr_calendar_lifecycle'
        or not routine.prosecdef
        or not coalesce(
          routine.proconfig @> array['search_path=pg_catalog, public'],
          false
        )
      )
  ) then
    raise exception 'delete lifecycle function security settings are unsafe';
  end if;
end
$$;

-- Create, update, and delete an event with a linked reminder through the
-- lifecycle seam, then observe that neither record remains.
do $$
declare
  created jsonb;
  updated jsonb;
  deleted jsonb;
  event_id uuid;
  reminder_id uuid;
begin
  created := public.create_calendar_event_with_reminder(
    '49900000-0000-0000-0000-000000000001',
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
  reminder_id := (created->'reminders'->0->>'id')::uuid;

  updated := public.update_calendar_event_with_reminders(
    '49900000-0000-0000-0000-000000000001',
    event_id,
    '{"title":"Updated lifecycle event","start_time":"11:00:00"}'::jsonb,
    null
  );

  if updated->'event'->>'title' <> 'Updated lifecycle event'
    or (updated->'reminders'->0->>'id')::uuid <> reminder_id
    or (updated->'reminders'->0->>'fire_at')::timestamptz
      <> timestamptz '2026-08-03 10:45:00+00'
    or not exists (
      select 1
      from public.reminders
      where id = reminder_id
        and source_id = event_id
        and calendar_event_source_id = event_id
    ) then
    raise exception 'update lifecycle outcome was incorrect: %', updated;
  end if;

  deleted := public.delete_calendar_event_with_reminders(
    '49900000-0000-0000-0000-000000000001',
    event_id
  );

  if deleted <> jsonb_build_object(
    'event_id', event_id,
    'deleted', true,
    'reminders_deleted', 1
  ) then
    raise exception 'delete lifecycle outcome was incorrect: %', deleted;
  end if;

  if exists (
    select 1 from public.calendar_events where id = event_id
  ) or exists (
    select 1 from public.reminders where id = reminder_id
  ) then
    raise exception 'delete lifecycle left event or reminder data behind';
  end if;

  deleted := public.delete_calendar_event_with_reminders(
    '49900000-0000-0000-0000-000000000001',
    event_id
  );

  if deleted <> jsonb_build_object(
    'event_id', event_id,
    'deleted', false,
    'reminders_deleted', 0
  ) then
    raise exception 'repeated delete outcome was not idempotent: %', deleted;
  end if;
end
$$;

-- Deleting a recurrence root cleans reminders for the complete event tree.
do $$
declare
  created_parent jsonb;
  created_child jsonb;
  deleted jsonb;
  parent_event_id uuid;
  child_event_id uuid;
  parent_reminder_id uuid;
  child_reminder_id uuid;
begin
  created_parent := public.create_calendar_event_with_reminder(
    '49900000-0000-0000-0000-000000000001',
    '{
      "title": "Recurring lifecycle root",
      "start_date": "2026-08-10",
      "start_time": "10:00:00",
      "end_date": "2026-08-10",
      "end_time": "11:00:00",
      "is_recurring": true,
      "recurrence_rule": {
        "frequency": "weekly",
        "interval": 1,
        "days_of_week": [1]
      }
    }'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  parent_event_id := (created_parent->'event'->>'id')::uuid;
  parent_reminder_id := (created_parent->'reminders'->0->>'id')::uuid;

  created_child := public.create_calendar_event_with_reminder(
    '49900000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'title', 'Recurring lifecycle exception',
      'start_date', '2026-08-17',
      'start_time', '12:00:00',
      'end_date', '2026-08-17',
      'end_time', '13:00:00',
      'recurring_event_id', parent_event_id,
      'original_date', '2026-08-17',
      'is_exception', true
    ),
    '[{
      "reminder_type": "relative",
      "relative_minutes": 30,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  child_event_id := (created_child->'event'->>'id')::uuid;
  child_reminder_id := (created_child->'reminders'->0->>'id')::uuid;

  deleted := public.delete_calendar_event_with_reminders(
    '49900000-0000-0000-0000-000000000001',
    parent_event_id
  );

  if deleted <> jsonb_build_object(
    'event_id', parent_event_id,
    'deleted', true,
    'reminders_deleted', 2
  ) then
    raise exception 'recurrence tree delete outcome was incorrect: %', deleted;
  end if;

  if exists (
    select 1
    from public.calendar_events
    where id in (parent_event_id, child_event_id)
  ) or exists (
    select 1
    from public.reminders
    where id in (parent_reminder_id, child_reminder_id)
  ) then
    raise exception 'recurrence tree delete left event or reminder data behind';
  end if;
end
$$;

-- A same-owner self-reference is legal legacy data. Its traversal is bounded,
-- and its linked reminder is still removed atomically.
do $$
declare
  deleted jsonb;
  cyclic_event_id constant uuid :=
    '49900000-0000-0000-0000-000000000101';
  cyclic_reminder_id uuid;
  updated jsonb;
begin
  insert into public.calendar_events (
    id,
    user_id,
    title,
    start_date,
    start_time,
    end_date,
    end_time,
    recurring_event_id,
    original_date,
    is_exception
  ) values (
    cyclic_event_id,
    '49900000-0000-0000-0000-000000000001',
    'Cyclic lifecycle event',
    '2026-08-18',
    '10:00:00',
    '2026-08-18',
    '11:00:00',
    cyclic_event_id,
    '2026-08-18',
    true
  );

  updated := public.update_calendar_event_with_reminders(
    '49900000-0000-0000-0000-000000000001',
    cyclic_event_id,
    '{}'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 5,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  cyclic_reminder_id := (updated->'reminders'->0->>'id')::uuid;

  deleted := public.delete_calendar_event_with_reminders(
    '49900000-0000-0000-0000-000000000001',
    cyclic_event_id
  );

  if deleted <> jsonb_build_object(
    'event_id', cyclic_event_id,
    'deleted', true,
    'reminders_deleted', 1
  ) then
    raise exception 'cyclic recurrence delete outcome was incorrect: %', deleted;
  end if;

  if exists (
    select 1 from public.calendar_events where id = cyclic_event_id
  ) or exists (
    select 1 from public.reminders where id = cyclic_reminder_id
  ) then
    raise exception 'cyclic recurrence delete left lifecycle data behind';
  end if;
end
$$;

-- Deleting an event with no reminder succeeds and preserves an unrelated
-- schedule owned by either the caller or another user.
select set_config(
  'request.jwt.claims',
  '{"sub":"49900000-0000-0000-0000-000000000002"}',
  true
);

insert into ralph_499_ids(label, event_id, reminder_id)
select
  'other',
  (created->'event'->>'id')::uuid,
  (created->'reminders'->0->>'id')::uuid
from (
  select public.create_calendar_event_with_reminder(
    '49900000-0000-0000-0000-000000000002',
    '{
      "title": "Unrelated schedule",
      "start_date": "2026-08-04",
      "start_time": "09:00:00",
      "end_date": "2026-08-04",
      "end_time": "10:00:00"
    }'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 30,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  ) created
) seeded;

select set_config(
  'request.jwt.claims',
  '{"sub":"49900000-0000-0000-0000-000000000001"}',
  true
);

do $$
declare
  created_target jsonb;
  created_unrelated jsonb;
  deleted jsonb;
  target_event_id uuid;
  same_owner_event_id uuid;
  same_owner_reminder_id uuid;
  task_reminder_id uuid;
  other_event_id uuid;
begin
  select ids.event_id into other_event_id
  from ralph_499_ids ids
  where label = 'other';

  created_target := public.create_calendar_event_with_reminder(
    '49900000-0000-0000-0000-000000000001',
    '{
      "title": "Event only",
      "start_date": "2026-08-05",
      "start_time": "12:00:00",
      "end_date": "2026-08-05",
      "end_time": "12:30:00"
    }'::jsonb
  );
  target_event_id := (created_target->'event'->>'id')::uuid;

  created_unrelated := public.create_calendar_event_with_reminder(
    '49900000-0000-0000-0000-000000000001',
    '{
      "title": "Same-owner unrelated schedule",
      "start_date": "2026-08-05",
      "start_time": "15:00:00",
      "end_date": "2026-08-05",
      "end_time": "16:00:00"
    }'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 20,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  same_owner_event_id := (created_unrelated->'event'->>'id')::uuid;
  same_owner_reminder_id :=
    (created_unrelated->'reminders'->0->>'id')::uuid;

  insert into ralph_499_ids(label, event_id, reminder_id)
  values ('same_owner', same_owner_event_id, same_owner_reminder_id);

  insert into public.reminders (
    user_id,
    source_type,
    source_id,
    reminder_type,
    absolute_time,
    channels,
    fire_at
  ) values (
    '49900000-0000-0000-0000-000000000001',
    'task',
    target_event_id,
    'absolute',
    '2026-08-05 11:00:00+00',
    array['push'],
    '2026-08-05 11:00:00+00'
  )
  returning id into task_reminder_id;

  deleted := public.delete_calendar_event_with_reminders(
    '49900000-0000-0000-0000-000000000001',
    target_event_id
  );

  if deleted <> jsonb_build_object(
    'event_id', target_event_id,
    'deleted', true,
    'reminders_deleted', 0
  ) then
    raise exception 'event-only delete outcome was incorrect: %', deleted;
  end if;

  if exists (
    select 1 from public.calendar_events where id = target_event_id
  ) or not exists (
    select 1 from public.calendar_events where id = same_owner_event_id
  ) or not exists (
    select 1
    from public.reminders
    where id = same_owner_reminder_id
      and source_type = 'calendar_event'
      and source_id = same_owner_event_id
  ) or not exists (
    select 1
    from public.reminders
    where id = task_reminder_id
      and source_type = 'task'
      and source_id = target_event_id
      and calendar_event_source_id is null
  ) then
    raise exception 'event-only delete changed unrelated caller-owned data';
  end if;

  deleted := public.delete_calendar_event_with_reminders(
    '49900000-0000-0000-0000-000000000001',
    other_event_id
  );

  if deleted <> jsonb_build_object(
    'event_id', other_event_id,
    'deleted', false,
    'reminders_deleted', 0
  ) then
    raise exception 'another user schedule was affected: %', deleted;
  end if;
end
$$;

-- A service-role JWT claim cannot bypass authenticated-role caller binding.
-- The MCP path is authorized by its actual database request role, separately
-- covered through the public MCP tool seam.
insert into ralph_499_ids(label, event_id, reminder_id)
select
  'service_claim_spoof_target',
  (created->'event'->>'id')::uuid,
  (created->'reminders'->0->>'id')::uuid
from (
  select public.create_calendar_event_with_reminder(
    '49900000-0000-0000-0000-000000000001',
    '{
      "title": "MCP service-role lifecycle",
      "start_date": "2026-08-07",
      "start_time": "09:00:00",
      "end_date": "2026-08-07",
      "end_time": "10:00:00"
    }'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 10,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  ) created
) seeded;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  service_event_id uuid;
  service_reminder_id uuid;
begin
  if not has_function_privilege(
    'service_role',
    'public.delete_calendar_event_with_reminders(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role lacks delete lifecycle execute privilege';
  end if;

  select ids.event_id, ids.reminder_id
  into service_event_id, service_reminder_id
  from ralph_499_ids ids
  where label = 'service_claim_spoof_target';

  begin
    perform public.delete_calendar_event_with_reminders(
      '49900000-0000-0000-0000-000000000001',
      service_event_id
    );
    raise exception 'service-role claim bypass unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'Cannot delete a schedule for another user' then
        raise;
      end if;
  end;
end
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"49900000-0000-0000-0000-000000000001"}',
  true
);

do $$
declare
  service_event_id uuid;
  service_reminder_id uuid;
begin
  select ids.event_id, ids.reminder_id
  into service_event_id, service_reminder_id
  from ralph_499_ids ids
  where label = 'service_claim_spoof_target';

  if not exists (
    select 1 from public.calendar_events where id = service_event_id
  ) or not exists (
    select 1 from public.reminders where id = service_reminder_id
  ) then
    raise exception 'rejected service-role claim changed lifecycle data';
  end if;
end
$$;

-- Migration cleanup and the composite FK establish the same-owner source
-- invariant before lifecycle deletion is enabled. The FK also serializes
-- reminder writes against event deletion.
do $$
begin
  if exists (
    select 1
    from public.reminders as reminder
    where reminder.source_type = 'calendar_event'
      and not exists (
        select 1
        from public.calendar_events as event
        where event.id = reminder.source_id
          and event.user_id = reminder.user_id
      )
  ) then
    raise exception 'cross-owner or orphan calendar reminder survived cleanup';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.reminders'::regclass
      and attname = 'calendar_event_source_id'
      and attgenerated = 's'
      and not attisdropped
  ) then
    raise exception 'calendar reminder generated source key is unavailable';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reminders'::regclass
      and confrelid = 'public.calendar_events'::regclass
      and conname = 'reminders_calendar_event_owner_fkey'
      and contype = 'f'
      and confdeltype = 'c'
      and pg_get_constraintdef(oid) like
        'FOREIGN KEY (calendar_event_source_id, user_id) REFERENCES %'
  ) then
    raise exception 'same-owner calendar reminder foreign key is unavailable';
  end if;
end
$$;

-- Caller identity cannot be spoofed, and the same-owner FK rejects recurrence
-- links across users before either an event or reminder is created.
do $$
declare
  other_event_id uuid;
  other_reminder_id uuid;
  outcome jsonb;
begin
  select ids.event_id, ids.reminder_id
  into other_event_id, other_reminder_id
  from ralph_499_ids ids
  where label = 'other';

  begin
    perform public.delete_calendar_event_with_reminders(
      '49900000-0000-0000-0000-000000000002',
      other_event_id
    );
    raise exception 'delete caller identity spoof unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'Cannot delete a schedule for another user' then
        raise;
      end if;
  end;

  outcome := public.create_calendar_event_with_reminder(
    '49900000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'title', 'Cross-owner recurrence child',
      'start_date', '2026-08-19',
      'start_time', '09:00:00',
      'end_date', '2026-08-19',
      'end_time', '10:00:00',
      'recurring_event_id', other_event_id,
      'original_date', '2026-08-19',
      'is_exception', true
    ),
    '[{
      "reminder_type": "relative",
      "relative_minutes": 10,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  if outcome->>'type' <> 'not-found'
    or outcome->>'related' <> 'recurringEvent' then
    raise exception 'cross-owner recurrence link was not typed: %', outcome;
  end if;

  if exists (
    select 1
    from public.calendar_events
    where user_id = '49900000-0000-0000-0000-000000000001'
      and title = 'Cross-owner recurrence child'
  ) then
    raise exception 'failed cross-owner recurrence left an event behind';
  end if;

  -- The failed create and spoofed delete must leave the foreign lifecycle
  -- intact; the other owner verifies the records below.
end
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"49900000-0000-0000-0000-000000000002"}',
  true
);

do $$
declare
  deleted jsonb;
  unrelated_event_id uuid;
  unrelated_reminder_id uuid;
begin
  select ids.event_id, ids.reminder_id
  into unrelated_event_id, unrelated_reminder_id
  from ralph_499_ids ids
  where label = 'other';

  if not exists (
    select 1 from public.calendar_events where id = unrelated_event_id
  ) or not exists (
    select 1 from public.reminders where id = unrelated_reminder_id
  ) then
    raise exception 'unrelated schedule did not survive another user delete';
  end if;

  deleted := public.delete_calendar_event_with_reminders(
    '49900000-0000-0000-0000-000000000002',
    unrelated_event_id
  );
  if deleted <> jsonb_build_object(
    'event_id', unrelated_event_id,
    'deleted', true,
    'reminders_deleted', 1
  ) then
    raise exception 'other owner delete outcome was incorrect: %', deleted;
  end if;
end
$$;

-- A failure after reminder deletion must roll the entire lifecycle invocation
-- back, leaving the event and reminder linked and present.
select set_config(
  'request.jwt.claims',
  '{"sub":"49900000-0000-0000-0000-000000000001"}',
  true
);

do $$
declare
  same_owner_event_id uuid;
  same_owner_reminder_id uuid;
begin
  select ids.event_id, ids.reminder_id
  into same_owner_event_id, same_owner_reminder_id
  from ralph_499_ids ids
  where label = 'same_owner';

  if not exists (
    select 1 from public.calendar_events where id = same_owner_event_id
  ) or not exists (
    select 1
    from public.reminders
    where id = same_owner_reminder_id
      and source_id = same_owner_event_id
      and source_type = 'calendar_event'
  ) then
    raise exception 'other owner delete changed the caller schedule';
  end if;
end
$$;

do $$
declare
  created jsonb;
  event_id uuid;
  reminder_id uuid;
begin
  created := public.create_calendar_event_with_reminder(
    '49900000-0000-0000-0000-000000000001',
    '{
      "title": "Rollback lifecycle",
      "start_date": "2026-08-06",
      "start_time": "14:00:00",
      "end_date": "2026-08-06",
      "end_time": "15:00:00"
    }'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 10,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  event_id := (created->'event'->>'id')::uuid;
  reminder_id := (created->'reminders'->0->>'id')::uuid;

  begin
    perform public.delete_calendar_event_with_reminders(
      '49900000-0000-0000-0000-000000000001',
      event_id
    );
    raise exception 'rollback lifecycle unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'forced calendar delete failure' then
        raise;
      end if;
  end;

  if not exists (
    select 1 from public.calendar_events where id = event_id
  ) or not exists (
    select 1
    from public.reminders
    where id = reminder_id
      and source_type = 'calendar_event'
      and source_id = event_id
  ) then
    raise exception 'failed delete left a partial lifecycle outcome';
  end if;
end
$$;

reset role;
rollback;
