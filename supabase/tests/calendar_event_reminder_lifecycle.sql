-- Run after `supabase db reset` against the local instance. The transaction
-- leaves no test identity or schedule data behind.
begin;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '48100000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'calendar-lifecycle@example.test',
  crypt('not-used', gen_salt('bf')),
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '48100000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'other-calendar-lifecycle@example.test',
  crypt('not-used', gen_salt('bf')),
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '48100000-0000-0000-0000-000000000001',
  true
);

do $$
begin
  if not has_table_privilege(
    'authenticated',
    'public.calendar_events',
    'UPDATE, DELETE'
  ) or not has_table_privilege(
    'authenticated',
    'public.reminders',
    'UPDATE, DELETE'
  ) then
    raise exception 'authenticated users cannot edit and delete schedules';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.profiles',
    'id',
    'SELECT'
  ) or not has_column_privilege(
    'authenticated',
    'public.profiles',
    'timezone',
    'SELECT'
  ) then
    raise exception 'authenticated users cannot read required profile scheduling columns';
  end if;
end
$$;

-- The public lifecycle seam remains caller-scoped even though authenticated
-- users can read the timezone column through the own-profile SELECT policy.
do $$
begin
  perform public.create_calendar_event_with_reminder(
    '48100000-0000-0000-0000-000000000002',
    '{
      "title": "Another user event",
      "start_date": "2026-08-03",
      "start_time": "09:00:00",
      "end_date": "2026-08-03",
      "end_time": "09:30:00"
    }'::jsonb
  );
  raise exception 'schedule creation for another user unexpectedly succeeded';
exception
  when raise_exception then
    if sqlerrm <> 'Cannot create a schedule for another user' then
      raise;
    end if;
end
$$;

-- Creating an event without a reminder returns an empty reminder collection
-- and leaves no reminder associated with the new event.
do $$
declare
  outcome jsonb;
begin
  outcome := public.create_calendar_event_with_reminder(
    '48100000-0000-0000-0000-000000000001',
    '{
      "title": "Event only",
      "start_date": "2026-08-03",
      "start_time": "09:00:00",
      "end_date": "2026-08-03",
      "end_time": "09:30:00",
      "is_recurring": false,
      "is_exception": false
    }'::jsonb
  );

  if outcome->'event'->>'title' <> 'Event only'
    or outcome->'reminders' <> '[]'::jsonb then
    raise exception 'event-only outcome was incorrect: %', outcome;
  end if;

  if exists (
    select 1
    from public.reminders
    where source_type = 'calendar_event'
      and source_id = (outcome->'event'->>'id')::uuid
  ) then
    raise exception 'event-only creation produced a reminder';
  end if;
end
$$;

-- Creating an event with a relative reminder returns both records with the
-- event relationship and independently worked UTC schedule.
do $$
declare
  outcome jsonb;
begin
  outcome := public.create_calendar_event_with_reminder(
    '48100000-0000-0000-0000-000000000001',
    '{
      "title": "Event with reminder",
      "start_date": "2026-08-03",
      "start_time": "10:00:00",
      "end_date": "2026-08-03",
      "end_time": "11:00:00",
      "is_recurring": false,
      "is_exception": false
    }'::jsonb,
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );

  if jsonb_array_length(outcome->'reminders') <> 1
    or outcome->'reminders'->0->>'source_type' <> 'calendar_event'
    or outcome->'reminders'->0->>'source_id' <> outcome->'event'->>'id'
    or (outcome->'reminders'->0->>'fire_at')::timestamptz
      <> timestamptz '2026-08-03 09:45:00+00' then
    raise exception 'event-with-reminder outcome was incorrect: %', outcome;
  end if;
end
$$;

-- Isolate the rollback case from the successful schedules above so its
-- absence assertions only observe state created by the failing invocation.
reset role;

delete from public.reminders
where user_id = '48100000-0000-0000-0000-000000000001';

delete from public.calendar_events
where user_id = '48100000-0000-0000-0000-000000000001';

set local role authenticated;

-- Force the required reminder insert to fail after the event insert. A
-- statement-level exception must roll the entire function invocation back.
do $$
begin
  perform public.create_calendar_event_with_reminder(
    '48100000-0000-0000-0000-000000000001',
    '{
      "title": "Atomic schedule",
      "start_date": "2026-08-03",
      "start_time": "10:00:00",
      "end_date": "2026-08-03",
      "end_time": "11:00:00",
      "is_recurring": false,
      "is_exception": false
    }'::jsonb,
    '[{
      "reminder_type": "absolute",
      "relative_minutes": null,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb
  );
  raise exception 'schedule creation unexpectedly succeeded';
exception
  when integrity_constraint_violation then null;
end
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.calendar_events
    where user_id = '48100000-0000-0000-0000-000000000001'
      and title = 'Atomic schedule'
  ) then
    raise exception 'event remained after reminder creation failed';
  end if;

  if exists (
    select 1
    from public.reminders
    where user_id = '48100000-0000-0000-0000-000000000001'
  ) then
    raise exception 'reminder remained after schedule creation failed';
  end if;
end
$$;

rollback;
