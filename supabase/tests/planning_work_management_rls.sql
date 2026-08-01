-- ralph-ci: true
-- Prove planning and work-management ownership at the PostgreSQL RLS seam.
-- The runner's narrow administrative setup helper creates the disposable
-- identities; application claims run through the constrained or anonymous role.
-- The ordinary matrix is rolled back; the independent concurrency seam is
-- self-cleaning because its sessions commit outside that transaction.

-- Remove residue from a prior interrupted concurrency run before opening the
-- fixture transaction. Keeping this statement outside BEGIN avoids a lock
-- cycle with the independent setup session below.
do $concurrency_preflight$
begin
  begin
    perform public.ralph_ci_delete_auth_user(
      '57800000-0000-0000-0000-000000009001'
    );
  exception when others then
    null;
  end;
end
$concurrency_preflight$;

begin;

select public.ralph_ci_create_auth_user(
  '57800000-0000-0000-0000-000000000001',
  'planning-owner@example.test'
);
select public.ralph_ci_create_auth_user(
  '57800000-0000-0000-0000-000000000002',
  'planning-other@example.test'
);

select set_config('request.jwt.claims', '', false);
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);

insert into public.projects (id, user_id, name, section, color)
values
  (
    '57800000-0000-0000-0000-000000000101',
    '57800000-0000-0000-0000-000000000001',
    'Owner project',
    'personal',
    'blue'
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  false
);

insert into public.projects (id, user_id, name, section, color)
values (
    '57800000-0000-0000-0000-000000000102',
    '57800000-0000-0000-0000-000000000002',
    'Other project',
    'work',
    'green'
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);

insert into public.tasks (id, user_id, title, section, priority, project_id)
values
  (
    '57800000-0000-0000-0000-000000000201',
    '57800000-0000-0000-0000-000000000001',
    'Owner task',
    'personal',
    1,
    '57800000-0000-0000-0000-000000000101'
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  false
);

insert into public.tasks (id, user_id, title, section, priority, project_id)
values (
    '57800000-0000-0000-0000-000000000202',
    '57800000-0000-0000-0000-000000000002',
    'Other task',
    'work',
    2,
    '57800000-0000-0000-0000-000000000102'
  );

-- This fixture deliberately exercises the legacy recurring_tasks projection
-- with direct table writes to prove its RLS boundary. Production callers must
-- use the recurring lifecycle RPC; authorize only this controlled fixture.
select set_config('betterr.recurring_lifecycle', 'on', true);

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);

insert into public.recurring_tasks (
  id,
  user_id,
  title,
  recurrence_rule,
  start_date
)
values
  (
    '57800000-0000-0000-0000-000000000301',
    '57800000-0000-0000-0000-000000000001',
    'Owner recurring task',
    '{"frequency":"weekly","interval":1}'::jsonb,
    '2026-08-03'
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  false
);

insert into public.recurring_tasks (
  id,
  user_id,
  title,
  recurrence_rule,
  start_date
)
values (
    '57800000-0000-0000-0000-000000000302',
    '57800000-0000-0000-0000-000000000002',
    'Other recurring task',
    '{"frequency":"daily","interval":1}'::jsonb,
    '2026-08-03'
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);

insert into public.habits (
  id,
  user_id,
  name,
  frequency,
  status
)
values
  (
    '57800000-0000-0000-0000-000000000401',
    '57800000-0000-0000-0000-000000000001',
    'Owner habit',
    '{"type":"daily"}'::jsonb,
    'active'
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  false
);

insert into public.habits (
  id,
  user_id,
  name,
  frequency,
  status
)
values (
    '57800000-0000-0000-0000-000000000402',
    '57800000-0000-0000-0000-000000000002',
    'Other habit',
    '{"type":"daily"}'::jsonb,
    'active'
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);

insert into public.habit_logs (id, habit_id, user_id, logged_date, completed)
values
  (
    '57800000-0000-0000-0000-000000000501',
    '57800000-0000-0000-0000-000000000401',
    '57800000-0000-0000-0000-000000000001',
    '2026-08-03',
    true
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  false
);

insert into public.habit_logs (id, habit_id, user_id, logged_date, completed)
values (
    '57800000-0000-0000-0000-000000000502',
    '57800000-0000-0000-0000-000000000402',
    '57800000-0000-0000-0000-000000000002',
    '2026-08-03',
    true
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);

insert into public.habit_milestones (id, habit_id, user_id, milestone)
values
  (
    '57800000-0000-0000-0000-000000000601',
    '57800000-0000-0000-0000-000000000401',
    '57800000-0000-0000-0000-000000000001',
    7
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  false
);

insert into public.habit_milestones (id, habit_id, user_id, milestone)
values (
    '57800000-0000-0000-0000-000000000602',
    '57800000-0000-0000-0000-000000000402',
    '57800000-0000-0000-0000-000000000002',
    14
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);

insert into public.habit_graduations (
  id,
  habit_id,
  user_id,
  graduated_at,
  graduated_streak
)
values
  (
    '57800000-0000-0000-0000-000000000701',
    '57800000-0000-0000-0000-000000000401',
    '57800000-0000-0000-0000-000000000001',
    '2026-08-01 00:00:00+00',
    30
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  false
);

insert into public.habit_graduations (
  id,
  habit_id,
  user_id,
  graduated_at,
  graduated_streak
)
values (
    '57800000-0000-0000-0000-000000000702',
    '57800000-0000-0000-0000-000000000402',
    '57800000-0000-0000-0000-000000000002',
    '2026-08-01 00:00:00+00',
    14
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);

insert into public.calendar_events (
  id,
  user_id,
  title,
  start_date,
  end_date,
  start_time,
  end_time
)
values
  (
    '57800000-0000-0000-0000-000000000801',
    '57800000-0000-0000-0000-000000000001',
    'Owner calendar event',
    '2026-08-04',
    '2026-08-04',
    '09:00:00',
    '10:00:00'
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  false
);

insert into public.calendar_events (
  id,
  user_id,
  title,
  start_date,
  end_date,
  start_time,
  end_time
)
values (
    '57800000-0000-0000-0000-000000000802',
    '57800000-0000-0000-0000-000000000002',
    'Other calendar event',
    '2026-08-04',
    '2026-08-04',
    '11:00:00',
    '12:00:00'
  );

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);

insert into public.push_subscriptions (
  id,
  user_id,
  endpoint,
  p256dh,
  auth,
  user_agent
)
values (
  '57800000-0000-0000-0000-000000001101',
  '57800000-0000-0000-0000-000000000001',
  'https://push.example.test/planning-owner',
  'planning-owner-p256dh',
  'planning-owner-auth',
  'planning-owner-agent'
);
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  false
);
insert into public.push_subscriptions (
  id,
  user_id,
  endpoint,
  p256dh,
  auth,
  user_agent
)
values (
  '57800000-0000-0000-0000-000000001102',
  '57800000-0000-0000-0000-000000000002',
  'https://push.example.test/planning-other',
  'planning-other-p256dh',
  'planning-other-auth',
  'planning-other-agent'
);
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);

-- Calendar data has lifecycle-owned event reminders, while ordinary
-- application reminders/defaults use the Habit-owned configuration surface.
set local role authenticated;
do $habit_reminder_seed$
declare
  outcome jsonb;
begin
  outcome := public.configure_habit_reminders(
    '57800000-0000-0000-0000-000000000001',
    '57800000-0000-0000-0000-000000000401',
    '[{
      "reminder_type": "relative",
      "relative_minutes": 15,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb,
    '2026-08-04T09:00:00Z'
  );
  if outcome->>'type' is distinct from 'configured'
     or jsonb_array_length(outcome->'reminders') <> 1
     or outcome->'reminders'->0->>'source_type' is distinct from 'habit'
     or (outcome->'reminders'->0->>'source_id')::uuid
       is distinct from '57800000-0000-0000-0000-000000000401'::uuid
     or (outcome->'reminders'->0->>'relative_minutes')::integer <> 15
     or outcome->'reminders'->0->>'status' is distinct from 'pending'
     or (outcome->'reminders'->0->>'fire_at')::timestamptz
       is distinct from timestamptz '2026-08-04 08:45:00+00' then
    raise exception 'owner Habit reminder seed outcome was incorrect: %', outcome;
  end if;
  perform set_config(
    'ralph.planning_owner_habit_reminder_id',
    outcome->'reminders'->0->>'id',
    false
  );
end
$habit_reminder_seed$;
reset role;
insert into public.reminder_defaults (
  id,
  user_id,
  source_type,
  relative_minutes,
  channels
)
values (
  '57800000-0000-0000-0000-000000001001',
  '57800000-0000-0000-0000-000000000001',
  'task',
  30,
  array['push']
);

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  false
);
set local role authenticated;
do $habit_reminder_seed$
declare
  outcome jsonb;
begin
  outcome := public.configure_habit_reminders(
    '57800000-0000-0000-0000-000000000002',
    '57800000-0000-0000-0000-000000000402',
    '[{
      "reminder_type": "relative",
      "relative_minutes": 20,
      "absolute_time": null,
      "channels": ["push"]
    }]'::jsonb,
    '2026-08-04T11:00:00Z'
  );
  if outcome->>'type' is distinct from 'configured'
     or jsonb_array_length(outcome->'reminders') <> 1
     or outcome->'reminders'->0->>'source_type' is distinct from 'habit'
     or (outcome->'reminders'->0->>'source_id')::uuid
       is distinct from '57800000-0000-0000-0000-000000000402'::uuid
     or (outcome->'reminders'->0->>'relative_minutes')::integer <> 20
     or outcome->'reminders'->0->>'status' is distinct from 'pending'
     or (outcome->'reminders'->0->>'fire_at')::timestamptz
       is distinct from timestamptz '2026-08-04 10:40:00+00' then
    raise exception 'other Habit reminder seed outcome was incorrect: %', outcome;
  end if;
  perform set_config(
    'ralph.planning_other_habit_reminder_id',
    outcome->'reminders'->0->>'id',
    false
  );
end
$habit_reminder_seed$;
reset role;
insert into public.reminder_defaults (
  id,
  user_id,
  source_type,
  relative_minutes,
  channels
)
values (
  '57800000-0000-0000-0000-000000001002',
  '57800000-0000-0000-0000-000000000002',
  'habit',
  45,
  array['push']
);

set local role authenticated;
select public.update_calendar_event_with_reminders(
  '57800000-0000-0000-0000-000000000002',
  '57800000-0000-0000-0000-000000000802',
  '{}'::jsonb,
  '[{"reminder_type":"absolute","absolute_time":"2026-08-04T10:30:00Z","channels":["push"]}]'::jsonb
);
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  false
);
select public.update_calendar_event_with_reminders(
  '57800000-0000-0000-0000-000000000001',
  '57800000-0000-0000-0000-000000000801',
  '{}'::jsonb,
  '[{"reminder_type":"absolute","absolute_time":"2026-08-04T08:30:00Z","channels":["push"]}]'::jsonb
);
reset role;

create function pg_temp.ralph_578_expect_sqlstate(
  statement text,
  expected_state text,
  failure_message text
)
returns void
language plpgsql
as $$
declare
  observed_state text;
  completed boolean := false;
begin
  begin
    execute statement;
    completed := true;
  exception
    when others then
      get stacked diagnostics observed_state = returned_sqlstate;
  end;

  if completed then
    raise exception '% unexpectedly succeeded', failure_message;
  end if;

  if observed_state is distinct from expected_state then
    raise exception '% returned SQLSTATE %, expected %',
      failure_message,
      observed_state,
      expected_state;
  end if;
end
$$;

create function pg_temp.ralph_578_expect_zero_changes(
  statement text,
  failure_message text
)
returns void
language plpgsql
as $$
declare
  affected_rows integer;
begin
  execute statement;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception '% changed % rows', failure_message, affected_rows;
  end if;
end
$$;

create function pg_temp.ralph_578_expect_hidden(
  statement text,
  failure_message text
)
returns void
language plpgsql
as $$
declare
  visible_rows bigint;
  observed_state text;
  completed boolean := false;
begin
  begin
    execute statement into visible_rows;
    completed := true;
  exception
    when others then
      get stacked diagnostics observed_state = returned_sqlstate;
  end;

  if completed and visible_rows <> 0 then
    raise exception '% exposed % rows', failure_message, visible_rows;
  end if;

  if not completed and observed_state is distinct from '42501' then
    raise exception '% returned SQLSTATE %, expected hidden rows or 42501',
      failure_message,
      observed_state;
  end if;
end
$$;

do $block$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tasks',
    'projects',
    'recurring_tasks',
    'habits',
    'habit_logs',
    'habit_milestones',
    'habit_graduations',
    'calendar_events',
    'reminders',
    'reminder_defaults',
    'push_subscriptions'
  ]
  loop
    if not exists (
      select 1
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is not enabled for public.%', table_name;
    end if;
  end loop;

  foreach table_name in array array[
    'tasks',
    'projects',
    'recurring_tasks',
    'habits',
    'habit_logs',
    'habit_milestones',
    'habit_graduations',
    'calendar_events',
    'reminders',
    'reminder_defaults',
    'push_subscriptions'
  ]
  loop
    if has_table_privilege('anon', format('public.%s', table_name), 'SELECT')
       or has_table_privilege('anon', format('public.%s', table_name), 'INSERT')
       or has_table_privilege('anon', format('public.%s', table_name), 'UPDATE')
       or has_table_privilege('anon', format('public.%s', table_name), 'DELETE') then
      raise exception 'anonymous table privileges leaked for public.%', table_name;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname = 'update_updated_at_column'
      and pg_get_functiondef(routine.oid) like '%NEW.updated_at = NOW();%'
  ) then
    raise exception 'updated_at trigger function does not assign transaction time';
  end if;

  foreach table_name in array array[
    'tasks',
    'projects',
    'recurring_tasks',
    'habits',
    'habit_logs',
    'calendar_events'
  ]
  loop
    if not exists (
      select 1
      from pg_trigger as trigger
      join pg_class as relation on relation.oid = trigger.tgrelid
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      join pg_proc as routine on routine.oid = trigger.tgfoid
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and trigger.tgname = format('update_%s_updated_at', table_name)
        and trigger.tgenabled = 'O'
        and not trigger.tgisinternal
        and routine.proname = 'update_updated_at_column'
    ) then
      raise exception 'updated_at trigger is missing for public.%', table_name;
    end if;
  end loop;

  if not has_function_privilege(
    'authenticated',
    'public.create_calendar_event_with_reminder(uuid,jsonb,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.update_calendar_event_with_reminders(uuid,uuid,jsonb,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.delete_calendar_event_with_reminders(uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.transition_calendar_event_reminder(uuid,uuid,text,timestamptz,timestamptz)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.configure_habit_reminders(uuid,uuid,jsonb,timestamptz)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.set_habit_completion_atomically(uuid,uuid,date,boolean,date)',
    'EXECUTE'
  ) then
    raise exception 'authenticated planning lifecycle privileges are missing';
  end if;

  if has_function_privilege(
    'anon',
    'public.create_calendar_event_with_reminder(uuid,jsonb,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.update_calendar_event_with_reminders(uuid,uuid,jsonb,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.delete_calendar_event_with_reminders(uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.transition_calendar_event_reminder(uuid,uuid,text,timestamptz,timestamptz)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.configure_habit_reminders(uuid,uuid,jsonb,timestamptz)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.set_habit_completion_atomically(uuid,uuid,date,boolean,date)',
    'EXECUTE'
  ) then
    raise exception 'anonymous planning lifecycle privileges leaked';
  end if;

  if position(
    'FOR UPDATE' in upper(
      pg_get_functiondef(
        'public.set_habit_completion_atomically(uuid,uuid,date,boolean,date)'::regprocedure
      )
    )
  ) = 0 then
    raise exception 'habit completion lifecycle does not lock the habit row';
  end if;
end
$block$;

create temp table ralph_578_trigger_probe (
  id integer primary key,
  updated_at timestamptz not null
);
create trigger ralph_578_trigger_probe_updated_at
before update on ralph_578_trigger_probe
for each row execute function public.update_updated_at_column();
insert into ralph_578_trigger_probe (id, updated_at)
values (1, timestamptz '2000-01-01 00:00:00+00');
update ralph_578_trigger_probe
set id = id
where id = 1;
do $block$
begin
  if (select updated_at from ralph_578_trigger_probe where id = 1)
      is not distinct from timestamptz '2000-01-01 00:00:00+00'
     or (select updated_at from ralph_578_trigger_probe where id = 1)
      <> transaction_timestamp() then
    raise exception 'updated_at trigger did not change the probe row';
  end if;
end
$block$;

-- The owner can read, create, update, and delete work-management rows. The
-- second identity can neither observe nor mutate the owner's rows.
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claims', '', true);

set local role authenticated;
do $block$
begin
  if (select count(*) from public.tasks where user_id = '57800000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.tasks where id = '57800000-0000-0000-0000-000000000202') then
    raise exception 'task owner visibility is incorrect';
  end if;

  if (select count(*) from public.projects where user_id = '57800000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.projects where id = '57800000-0000-0000-0000-000000000102') then
    raise exception 'project owner visibility is incorrect';
  end if;

  if (select count(*) from public.recurring_tasks where user_id = '57800000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.recurring_tasks where id = '57800000-0000-0000-0000-000000000302') then
    raise exception 'recurring-task owner visibility is incorrect';
  end if;

  insert into public.tasks (id, user_id, title, section, priority)
  values (
    '57800000-0000-0000-0000-000000000203',
    '57800000-0000-0000-0000-000000000001',
    'Owner task probe',
    'personal',
    0
  );
  update public.tasks
  set title = 'Owner task probe updated'
  where id = '57800000-0000-0000-0000-000000000203';
  if not exists (
    select 1
    from public.tasks
    where id = '57800000-0000-0000-0000-000000000203'
      and title = 'Owner task probe updated'
  ) then
    raise exception 'task owner update did not persist';
  end if;
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.tasks set user_id = '57800000-0000-0000-0000-000000000002' where id = '57800000-0000-0000-0000-000000000203'$$,
    '42501',
    'task ownership transfer'
  );
  delete from public.tasks
  where id = '57800000-0000-0000-0000-000000000203';
  if exists (select 1 from public.tasks where id = '57800000-0000-0000-0000-000000000203') then
    raise exception 'task owner delete did not persist';
  end if;

  insert into public.projects (id, user_id, name, section, color)
  values (
    '57800000-0000-0000-0000-000000000103',
    '57800000-0000-0000-0000-000000000001',
    'Owner project probe',
    'work',
    'purple'
  );
  update public.projects
  set name = 'Owner project probe updated'
  where id = '57800000-0000-0000-0000-000000000103';
  if not exists (
    select 1
    from public.projects
    where id = '57800000-0000-0000-0000-000000000103'
      and name = 'Owner project probe updated'
  ) then
    raise exception 'project owner update did not persist';
  end if;
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.projects set user_id = '57800000-0000-0000-0000-000000000002' where id = '57800000-0000-0000-0000-000000000103'$$,
    '42501',
    'project ownership transfer'
  );
  delete from public.projects
  where id = '57800000-0000-0000-0000-000000000103';
  if exists (select 1 from public.projects where id = '57800000-0000-0000-0000-000000000103') then
    raise exception 'project owner delete did not persist';
  end if;

  insert into public.recurring_tasks (
    id,
    user_id,
    title,
    recurrence_rule,
    start_date
  ) values (
    '57800000-0000-0000-0000-000000000303',
    '57800000-0000-0000-0000-000000000001',
    'Owner recurring probe',
    '{"frequency":"monthly","interval":1}'::jsonb,
    '2026-08-03'
  );
  update public.recurring_tasks
  set title = 'Owner recurring probe updated'
  where id = '57800000-0000-0000-0000-000000000303';
  if not exists (
    select 1
    from public.recurring_tasks
    where id = '57800000-0000-0000-0000-000000000303'
      and title = 'Owner recurring probe updated'
  ) then
    raise exception 'recurring-task owner update did not persist';
  end if;
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.recurring_tasks set user_id = '57800000-0000-0000-0000-000000000002' where id = '57800000-0000-0000-0000-000000000303'$$,
    '42501',
    'recurring-task ownership transfer'
  );
  delete from public.recurring_tasks
  where id = '57800000-0000-0000-0000-000000000303';
  if exists (select 1 from public.recurring_tasks where id = '57800000-0000-0000-0000-000000000303') then
    raise exception 'recurring-task owner delete did not persist';
  end if;

  perform pg_temp.ralph_578_expect_zero_changes(
    $$update public.tasks set title = 'cross-user task write' where id = '57800000-0000-0000-0000-000000000202'$$,
    'non-owner task update'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$delete from public.tasks where id = '57800000-0000-0000-0000-000000000202'$$,
    'non-owner task delete'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$update public.projects set name = 'cross-user project write' where id = '57800000-0000-0000-0000-000000000102'$$,
    'non-owner project update'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$delete from public.projects where id = '57800000-0000-0000-0000-000000000102'$$,
    'non-owner project delete'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$update public.recurring_tasks set title = 'cross-user recurring write' where id = '57800000-0000-0000-0000-000000000302'$$,
    'non-owner recurring-task update'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$delete from public.recurring_tasks where id = '57800000-0000-0000-0000-000000000302'$$,
    'non-owner recurring-task delete'
  );

  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.tasks (id, user_id, title, section) values ('57800000-0000-0000-0000-000000000204', '57800000-0000-0000-0000-000000000002', 'cross-user task insert', 'work')$$,
    '42501',
    'non-owner task insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.projects (id, user_id, name, section, color) values ('57800000-0000-0000-0000-000000000104', '57800000-0000-0000-0000-000000000002', 'cross-user project insert', 'work', 'red')$$,
    '42501',
    'non-owner project insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.recurring_tasks (id, user_id, title, recurrence_rule, start_date) values ('57800000-0000-0000-0000-000000000304', '57800000-0000-0000-0000-000000000002', 'cross-user recurring insert', '{"frequency":"daily"}', '2026-08-03')$$,
    '42501',
    'non-owner recurring-task insert'
  );

  -- A valid owner identity still cannot bypass a table constraint.
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.tasks (id, user_id, title, section, priority) values ('57800000-0000-0000-0000-000000000205', '57800000-0000-0000-0000-000000000001', 'invalid priority', 'personal', 4)$$,
    '23514',
    'task priority constraint'
  );
end
$block$;

-- These checks run after the non-owner write attempts, before the next role
-- matrix, so a silently accepted write cannot be hidden by later cleanup.
reset role;
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  true
);
do $block$
begin
  if not exists (
    select 1 from public.tasks
    where id = '57800000-0000-0000-0000-000000000202'
      and title = 'Other task'
  ) or not exists (
    select 1 from public.projects
    where id = '57800000-0000-0000-0000-000000000102'
      and name = 'Other project'
  ) or not exists (
    select 1 from public.recurring_tasks
    where id = '57800000-0000-0000-0000-000000000302'
      and title = 'Other recurring task'
  ) or exists (
    select 1 from public.tasks
    where id in ('57800000-0000-0000-0000-000000000204', '57800000-0000-0000-0000-000000000205')
  ) or exists (
    select 1 from public.projects
    where id = '57800000-0000-0000-0000-000000000104'
  ) or exists (
    select 1 from public.recurring_tasks
    where id = '57800000-0000-0000-0000-000000000304'
  ) then
    raise exception 'non-owner work-management write changed persisted state';
  end if;
end
$block$;

-- Exercise the same CRUD seam as the second authenticated user, rather than
-- using that identity only as a hidden target for the owner's denied writes.
set local role authenticated;
do $block$
begin
  if (select count(*) from public.tasks where user_id = '57800000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.projects where user_id = '57800000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.recurring_tasks where user_id = '57800000-0000-0000-0000-000000000002') <> 1
     or exists (select 1 from public.tasks where id = '57800000-0000-0000-0000-000000000201')
     or exists (select 1 from public.projects where id = '57800000-0000-0000-0000-000000000101')
     or exists (select 1 from public.recurring_tasks where id = '57800000-0000-0000-0000-000000000301') then
    raise exception 'second-user work-management visibility is incorrect';
  end if;

  insert into public.tasks (id, user_id, title, section, priority)
  values (
    '57800000-0000-0000-0000-000000000207',
    '57800000-0000-0000-0000-000000000002',
    'Second-user task probe',
    'work',
    1
  );
  update public.tasks
  set title = 'Second-user task probe updated'
  where id = '57800000-0000-0000-0000-000000000207';
  if not exists (
    select 1 from public.tasks
    where id = '57800000-0000-0000-0000-000000000207'
      and title = 'Second-user task probe updated'
  ) then
    raise exception 'second-user task update did not persist';
  end if;
  delete from public.tasks where id = '57800000-0000-0000-0000-000000000207';

  insert into public.projects (id, user_id, name, section, color)
  values (
    '57800000-0000-0000-0000-000000000107',
    '57800000-0000-0000-0000-000000000002',
    'Second-user project probe',
    'work',
    'purple'
  );
  update public.projects
  set name = 'Second-user project probe updated'
  where id = '57800000-0000-0000-0000-000000000107';
  if not exists (
    select 1 from public.projects
    where id = '57800000-0000-0000-0000-000000000107'
      and name = 'Second-user project probe updated'
  ) then
    raise exception 'second-user project update did not persist';
  end if;
  delete from public.projects where id = '57800000-0000-0000-0000-000000000107';

  insert into public.recurring_tasks (
    id,
    user_id,
    title,
    recurrence_rule,
    start_date
  ) values (
    '57800000-0000-0000-0000-000000000307',
    '57800000-0000-0000-0000-000000000002',
    'Second-user recurring probe',
    '{"frequency":"monthly","interval":1}'::jsonb,
    '2026-08-03'
  );
  update public.recurring_tasks
  set title = 'Second-user recurring probe updated'
  where id = '57800000-0000-0000-0000-000000000307';
  if not exists (
    select 1 from public.recurring_tasks
    where id = '57800000-0000-0000-0000-000000000307'
      and title = 'Second-user recurring probe updated'
  ) then
    raise exception 'second-user recurring-task update did not persist';
  end if;
  delete from public.recurring_tasks where id = '57800000-0000-0000-0000-000000000307';
end
$block$;
reset role;
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  true
);

-- Habits, their daily logs, and their derived history use the same owner
-- boundary. Milestones intentionally have no DELETE policy, so their delete
-- probe proves that the unsupported write remains denied and unchanged.
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claims', '', true);

do $block$
begin
  if (select count(*) from public.habits where user_id = '57800000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.habits where id = '57800000-0000-0000-0000-000000000402') then
    raise exception 'habit owner visibility is incorrect';
  end if;
  if (select count(*) from public.habit_logs where user_id = '57800000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.habit_logs where id = '57800000-0000-0000-0000-000000000502') then
    raise exception 'habit-log owner visibility is incorrect';
  end if;
  if (select count(*) from public.habit_milestones where user_id = '57800000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.habit_milestones where id = '57800000-0000-0000-0000-000000000602') then
    raise exception 'habit-milestone owner visibility is incorrect';
  end if;
  if (select count(*) from public.habit_graduations where user_id = '57800000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.habit_graduations where id = '57800000-0000-0000-0000-000000000702') then
    raise exception 'habit-graduation owner visibility is incorrect';
  end if;

  insert into public.habits (id, user_id, name, frequency, status)
  values (
    '57800000-0000-0000-0000-000000000403',
    '57800000-0000-0000-0000-000000000001',
    'Owner habit probe',
    '{"type":"weekly","days":[1]}'::jsonb,
    'active'
  );
  update public.habits
  set name = 'Owner habit probe updated'
  where id = '57800000-0000-0000-0000-000000000403';
  if not exists (
    select 1 from public.habits
    where id = '57800000-0000-0000-0000-000000000403'
      and name = 'Owner habit probe updated'
  ) then
    raise exception 'habit owner update did not persist';
  end if;
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.habits set user_id = '57800000-0000-0000-0000-000000000002' where id = '57800000-0000-0000-0000-000000000403'$$,
    '42501',
    'habit ownership transfer'
  );

  insert into public.habit_logs (id, habit_id, user_id, logged_date, completed)
  values (
    '57800000-0000-0000-0000-000000000503',
    '57800000-0000-0000-0000-000000000403',
    '57800000-0000-0000-0000-000000000001',
    '2026-08-04',
    true
  );
  update public.habit_logs
  set completed = false
  where id = '57800000-0000-0000-0000-000000000503';
  if not exists (
    select 1 from public.habit_logs
    where id = '57800000-0000-0000-0000-000000000503'
      and completed = false
  ) then
    raise exception 'habit-log owner update did not persist';
  end if;
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.habit_logs set user_id = '57800000-0000-0000-0000-000000000002' where id = '57800000-0000-0000-0000-000000000503'$$,
    '42501',
    'habit-log ownership transfer'
  );

  insert into public.habit_milestones (id, habit_id, user_id, milestone)
  values (
    '57800000-0000-0000-0000-000000000603',
    '57800000-0000-0000-0000-000000000403',
    '57800000-0000-0000-0000-000000000001',
    21
  );
  update public.habit_milestones
  set milestone = 30
  where id = '57800000-0000-0000-0000-000000000603';
  if not exists (
    select 1 from public.habit_milestones
    where id = '57800000-0000-0000-0000-000000000603'
      and milestone = 30
  ) then
    raise exception 'habit-milestone owner update did not persist';
  end if;
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.habit_milestones set user_id = '57800000-0000-0000-0000-000000000002' where id = '57800000-0000-0000-0000-000000000603'$$,
    '42501',
    'habit-milestone ownership transfer'
  );

  insert into public.habit_graduations (
    id,
    habit_id,
    user_id,
    graduated_at,
    graduated_streak
  ) values (
    '57800000-0000-0000-0000-000000000703',
    '57800000-0000-0000-0000-000000000403',
    '57800000-0000-0000-0000-000000000001',
    '2026-08-04 00:00:00+00',
    21
  );
  update public.habit_graduations
  set graduated_streak = 30
  where id = '57800000-0000-0000-0000-000000000703';
  if not exists (
    select 1 from public.habit_graduations
    where id = '57800000-0000-0000-0000-000000000703'
      and graduated_streak = 30
  ) then
    raise exception 'habit-graduation owner update did not persist';
  end if;
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.habit_graduations set user_id = '57800000-0000-0000-0000-000000000002' where id = '57800000-0000-0000-0000-000000000703'$$,
    '42501',
    'habit-graduation ownership transfer'
  );

  -- Delete independent child probes directly, then leave the children of
  -- habit 403 in place so deleting the parent must exercise ON DELETE CASCADE.
  insert into public.habit_logs (id, habit_id, user_id, logged_date, completed)
  values (
    '57800000-0000-0000-0000-000000000508',
    '57800000-0000-0000-0000-000000000401',
    '57800000-0000-0000-0000-000000000001',
    '2026-08-04',
    true
  );
  update public.habit_logs
  set completed = false
  where id = '57800000-0000-0000-0000-000000000508';
  delete from public.habit_logs where id = '57800000-0000-0000-0000-000000000508';
  if exists (select 1 from public.habit_logs where id = '57800000-0000-0000-0000-000000000508') then
    raise exception 'habit-log owner delete did not persist';
  end if;

  insert into public.habit_milestones (id, habit_id, user_id, milestone)
  values (
    '57800000-0000-0000-0000-000000000608',
    '57800000-0000-0000-0000-000000000401',
    '57800000-0000-0000-0000-000000000001',
    21
  );
  update public.habit_milestones
  set milestone = 30
  where id = '57800000-0000-0000-0000-000000000608';
  delete from public.habit_milestones where id = '57800000-0000-0000-0000-000000000608';
  if not exists (
    select 1
    from public.habit_milestones
    where id = '57800000-0000-0000-0000-000000000608'
      and milestone = 30
  ) then
    raise exception 'unsupported habit-milestone owner delete changed state';
  end if;

  insert into public.habit_graduations (
    id,
    habit_id,
    user_id,
    graduated_at,
    graduated_streak
  ) values (
    '57800000-0000-0000-0000-000000000708',
    '57800000-0000-0000-0000-000000000401',
    '57800000-0000-0000-0000-000000000001',
    '2026-08-05 00:00:00+00',
    21
  );
  update public.habit_graduations
  set graduated_streak = 30
  where id = '57800000-0000-0000-0000-000000000708';
  delete from public.habit_graduations where id = '57800000-0000-0000-0000-000000000708';
  if exists (select 1 from public.habit_graduations where id = '57800000-0000-0000-0000-000000000708') then
    raise exception 'habit-graduation owner delete did not persist';
  end if;

  perform pg_temp.ralph_578_expect_zero_changes(
    $$update public.habits set name = 'cross-user habit write' where id = '57800000-0000-0000-0000-000000000402'$$,
    'non-owner habit update'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$delete from public.habits where id = '57800000-0000-0000-0000-000000000402'$$,
    'non-owner habit delete'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$update public.habit_logs set completed = false where id = '57800000-0000-0000-0000-000000000502'$$,
    'non-owner habit-log update'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$delete from public.habit_logs where id = '57800000-0000-0000-0000-000000000502'$$,
    'non-owner habit-log delete'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$update public.habit_milestones set milestone = 99 where id = '57800000-0000-0000-0000-000000000602'$$,
    'non-owner habit-milestone update'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$delete from public.habit_milestones where id = '57800000-0000-0000-0000-000000000602'$$,
    'non-owner habit-milestone delete'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$update public.habit_graduations set graduated_streak = 99 where id = '57800000-0000-0000-0000-000000000702'$$,
    'non-owner habit-graduation update'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$delete from public.habit_graduations where id = '57800000-0000-0000-0000-000000000702'$$,
    'non-owner habit-graduation delete'
  );

  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.habits (id, user_id, name, frequency) values ('57800000-0000-0000-0000-000000000404', '57800000-0000-0000-0000-000000000002', 'cross-user habit insert', '{"type":"daily"}')$$,
    '42501',
    'non-owner habit insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.habit_logs (id, habit_id, user_id, logged_date) values ('57800000-0000-0000-0000-000000000504', '57800000-0000-0000-0000-000000000402', '57800000-0000-0000-0000-000000000002', '2026-08-04')$$,
    '42501',
    'non-owner habit-log insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.habit_milestones (id, habit_id, user_id, milestone) values ('57800000-0000-0000-0000-000000000604', '57800000-0000-0000-0000-000000000402', '57800000-0000-0000-0000-000000000002', 21)$$,
    '42501',
    'non-owner habit-milestone insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.habit_graduations (id, habit_id, user_id, graduated_at, graduated_streak) values ('57800000-0000-0000-0000-000000000704', '57800000-0000-0000-0000-000000000402', '57800000-0000-0000-0000-000000000002', '2026-08-04 00:00:00+00', 21)$$,
    '42501',
    'non-owner habit-graduation insert'
  );

  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.habit_logs (id, habit_id, user_id, logged_date, completed) values ('57800000-0000-0000-0000-000000000505', '57800000-0000-0000-0000-000000000401', '57800000-0000-0000-0000-000000000001', '2026-08-03', true)$$,
    '23505',
    'habit-log unique constraint'
  );
end
$block$;

set local role authenticated;
do $rpc$
declare
  completion_outcome jsonb;
begin
  completion_outcome := public.set_habit_completion_atomically(
    '57800000-0000-0000-0000-000000000403',
    '57800000-0000-0000-0000-000000000001',
    date '2026-08-05',
    true,
    date '2026-08-05'
  );
  if completion_outcome->>'completed' is distinct from 'true'
     or not exists (
       select 1
       from public.habit_logs
       where habit_id = '57800000-0000-0000-0000-000000000403'
         and logged_date = date '2026-08-05'
         and completed
     ) then
    raise exception 'habit completion RPC did not persist its log: %', completion_outcome;
  end if;

  insert into public.habits (id, user_id, name, frequency, current_streak, best_streak)
  values (
    '57800000-0000-0000-0000-000000000409',
    '57800000-0000-0000-0000-000000000001',
    'Atomic rollback probe',
    '{"type":"times_per_week","count":"invalid"}'::jsonb,
    4,
    9
  );
  begin
    perform public.set_habit_completion_atomically(
      '57800000-0000-0000-0000-000000000409',
      '57800000-0000-0000-0000-000000000001',
      date '2026-08-05',
      true,
      date '2026-08-05'
    );
    raise exception 'invalid habit frequency unexpectedly completed';
  exception
    when invalid_text_representation then null;
  end;
  if exists (
    select 1 from public.habit_logs
    where habit_id = '57800000-0000-0000-0000-000000000409'
  ) or not exists (
    select 1
    from public.habits
    where id = '57800000-0000-0000-0000-000000000409'
      and current_streak = 4
      and best_streak = 9
  ) then
    raise exception 'failed habit completion left partial state';
  end if;
end
$rpc$;
reset role;
do $cascade$
begin
  delete from public.habits where id = '57800000-0000-0000-0000-000000000403';
  delete from public.habits where id = '57800000-0000-0000-0000-000000000409';
  if exists (select 1 from public.habit_logs where id = '57800000-0000-0000-0000-000000000503')
     or exists (select 1 from public.habit_milestones where id = '57800000-0000-0000-0000-000000000603')
     or exists (select 1 from public.habit_graduations where id = '57800000-0000-0000-0000-000000000703') then
    raise exception 'habit delete did not cascade to derived rows';
  end if;
end
$cascade$;

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  true
);
do $block$
begin
  if not exists (
    select 1 from public.habits
    where id = '57800000-0000-0000-0000-000000000402'
      and name = 'Other habit'
  ) or not exists (
    select 1 from public.habit_logs
    where id = '57800000-0000-0000-0000-000000000502'
      and completed
  ) or not exists (
    select 1 from public.habit_milestones
    where id = '57800000-0000-0000-0000-000000000602'
      and milestone = 14
  ) or not exists (
    select 1 from public.habit_graduations
    where id = '57800000-0000-0000-0000-000000000702'
      and graduated_streak = 14
  ) or exists (
    select 1
    from public.habits
    where id in ('57800000-0000-0000-0000-000000000403', '57800000-0000-0000-0000-000000000404')
  ) or exists (
    select 1 from public.habit_logs where id = '57800000-0000-0000-0000-000000000504'
  ) or exists (
    select 1 from public.habit_milestones where id = '57800000-0000-0000-0000-000000000604'
  ) or exists (
    select 1 from public.habit_graduations where id = '57800000-0000-0000-0000-000000000704'
  ) then
    raise exception 'non-owner habit write changed persisted state';
  end if;
end
$block$;

-- The second authenticated user can exercise every exposed habit/history
-- read/write operation for their own rows while remaining unable to see the
-- owner's data. Milestones intentionally have no DELETE policy.
set local role authenticated;
do $block$
begin
  if (select count(*) from public.habits where user_id = '57800000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.habit_logs where user_id = '57800000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.habit_milestones where user_id = '57800000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.habit_graduations where user_id = '57800000-0000-0000-0000-000000000002') <> 1
     or exists (select 1 from public.habits where id = '57800000-0000-0000-0000-000000000401')
     or exists (select 1 from public.habit_logs where id = '57800000-0000-0000-0000-000000000501')
     or exists (select 1 from public.habit_milestones where id = '57800000-0000-0000-0000-000000000601')
     or exists (select 1 from public.habit_graduations where id = '57800000-0000-0000-0000-000000000701') then
    raise exception 'second-user habit visibility is incorrect';
  end if;

  perform pg_temp.ralph_578_expect_sqlstate(
    $$select public.set_habit_completion_atomically('57800000-0000-0000-0000-000000000401', '57800000-0000-0000-0000-000000000001', '2026-08-06', true, '2026-08-06')$$,
    'P0001',
    'non-owner habit completion'
  );

  insert into public.habits (id, user_id, name, frequency, status)
  values (
    '57800000-0000-0000-0000-000000000405',
    '57800000-0000-0000-0000-000000000002',
    'Second-user habit probe',
    '{"type":"weekly","days":[2]}'::jsonb,
    'active'
  );
  update public.habits
  set name = 'Second-user habit probe updated'
  where id = '57800000-0000-0000-0000-000000000405';

  insert into public.habit_logs (id, habit_id, user_id, logged_date, completed)
  values (
    '57800000-0000-0000-0000-000000000505',
    '57800000-0000-0000-0000-000000000405',
    '57800000-0000-0000-0000-000000000002',
    '2026-08-05',
    true
  );
  update public.habit_logs
  set completed = false
  where id = '57800000-0000-0000-0000-000000000505';

  insert into public.habit_milestones (id, habit_id, user_id, milestone)
  values (
    '57800000-0000-0000-0000-000000000605',
    '57800000-0000-0000-0000-000000000405',
    '57800000-0000-0000-0000-000000000002',
    21
  );
  update public.habit_milestones
  set milestone = 30
  where id = '57800000-0000-0000-0000-000000000605';

  insert into public.habit_graduations (
    id,
    habit_id,
    user_id,
    graduated_at,
    graduated_streak
  ) values (
    '57800000-0000-0000-0000-000000000705',
    '57800000-0000-0000-0000-000000000405',
    '57800000-0000-0000-0000-000000000002',
    '2026-08-05 00:00:00+00',
    21
  );
  update public.habit_graduations
  set graduated_streak = 30
  where id = '57800000-0000-0000-0000-000000000705';

  if not exists (select 1 from public.habits where id = '57800000-0000-0000-0000-000000000405' and name = 'Second-user habit probe updated')
     or not exists (select 1 from public.habit_logs where id = '57800000-0000-0000-0000-000000000505' and not completed)
     or not exists (select 1 from public.habit_milestones where id = '57800000-0000-0000-0000-000000000605' and milestone = 30)
     or not exists (select 1 from public.habit_graduations where id = '57800000-0000-0000-0000-000000000705' and graduated_streak = 30) then
    raise exception 'second-user habit update did not persist';
  end if;

  delete from public.habit_logs where id = '57800000-0000-0000-0000-000000000505';
  delete from public.habit_milestones where id = '57800000-0000-0000-0000-000000000605';
  if not exists (
    select 1
    from public.habit_milestones
    where id = '57800000-0000-0000-0000-000000000605'
      and milestone = 30
  ) then
    raise exception 'unsupported second-user habit-milestone delete changed state';
  end if;
  delete from public.habit_graduations where id = '57800000-0000-0000-0000-000000000705';
  delete from public.habits where id = '57800000-0000-0000-0000-000000000405';
end
$block$;
reset role;
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  true
);

-- The migration intentionally exposes reminder_defaults through its RLS
-- policies but does not grant the table to authenticated in the disposable
-- reset. Keep this direct table matrix on the constrained runner role, which
-- has the runner-only table grant and still evaluates auth.uid() claims.
do $block$
begin
  if (select count(*) from public.reminder_defaults where user_id = '57800000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001002') then
    raise exception 'owner reminder-default visibility is incorrect';
  end if;

  insert into public.reminder_defaults (
    id,
    user_id,
    source_type,
    relative_minutes,
    channels
  ) values (
    '57800000-0000-0000-0000-000000001003',
    '57800000-0000-0000-0000-000000000001',
    'habit',
    20,
    array['push']
  );
  update public.reminder_defaults
  set relative_minutes = 25
  where id = '57800000-0000-0000-0000-000000001003';
  if not exists (
    select 1 from public.reminder_defaults
    where id = '57800000-0000-0000-0000-000000001003'
      and relative_minutes = 25
  ) then
    raise exception 'owner reminder default update did not persist';
  end if;
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.reminder_defaults set user_id = '57800000-0000-0000-0000-000000000002' where id = '57800000-0000-0000-0000-000000001003'$$,
    '42501',
    'reminder-default ownership transfer'
  );
  delete from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001003';

  perform pg_temp.ralph_578_expect_zero_changes(
    $$update public.reminder_defaults set relative_minutes = 99 where id = '57800000-0000-0000-0000-000000001002'$$,
    'non-owner reminder-default update'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$delete from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001002'$$,
    'non-owner reminder-default delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.reminder_defaults (id, user_id, source_type, relative_minutes, channels) values ('57800000-0000-0000-0000-000000001004', '57800000-0000-0000-0000-000000000002', 'task', 15, '{push}')$$,
    '42501',
    'non-owner reminder-default insert'
  );
end
$block$;

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  true
);
do $block$
begin
  if (select count(*) from public.reminder_defaults where user_id = '57800000-0000-0000-0000-000000000002') <> 1
     or exists (select 1 from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001001') then
    raise exception 'second-user reminder-default visibility is incorrect';
  end if;

  insert into public.reminder_defaults (
    id,
    user_id,
    source_type,
    relative_minutes,
    channels
  ) values (
    '57800000-0000-0000-0000-000000001005',
    '57800000-0000-0000-0000-000000000002',
    'calendar_event',
    20,
    array['push']
  );
  update public.reminder_defaults
  set relative_minutes = 25
  where id = '57800000-0000-0000-0000-000000001005';
  delete from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001005';
end
$block$;

-- reminder_defaults is also intentionally unavailable to authenticated in
-- the disposable reset. Prove that application-role ACL boundary separately
-- from the constrained-role policy matrix above.
set local role authenticated;
do $reminder_defaults_acl$
begin
  perform pg_temp.ralph_578_expect_sqlstate(
    $$select count(*) from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001001'$$,
    '42501',
    'authenticated reminder-default read privilege'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.reminder_defaults (id, user_id, source_type, relative_minutes, channels) values ('57800000-0000-0000-0000-000000001007', '57800000-0000-0000-0000-000000000001', 'task', 15, '{push}')$$,
    '42501',
    'authenticated reminder-default insert privilege'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.reminder_defaults set relative_minutes = 99 where id = '57800000-0000-0000-0000-000000001001'$$,
    '42501',
    'authenticated reminder-default update privilege'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001001'$$,
    '42501',
    'authenticated reminder-default delete privilege'
  );
end
$reminder_defaults_acl$;
reset role;

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  true
);

-- The migration intentionally keeps push_subscriptions backend-only: it
-- defines the RLS policies but grants no direct table privileges to
-- authenticated. Prove that application-role ACL boundary separately from
-- the constrained-role policy matrix below.
set local role authenticated;
do $push_acl$
begin
  perform pg_temp.ralph_578_expect_sqlstate(
    $$select count(*) from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001101'$$,
    '42501',
    'authenticated push-subscription read privilege'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth) values ('57800000-0000-0000-0000-000000001107', '57800000-0000-0000-0000-000000000001', 'https://push.example.test/authenticated-acl', 'authenticated-acl-p256dh', 'authenticated-acl-auth')$$,
    '42501',
    'authenticated push-subscription insert privilege'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.push_subscriptions set user_agent = 'authenticated-acl-update' where id = '57800000-0000-0000-0000-000000001101'$$,
    '42501',
    'authenticated push-subscription update privilege'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001101'$$,
    '42501',
    'authenticated push-subscription delete privilege'
  );
end
$push_acl$;
reset role;

-- push_subscriptions has the same RLS boundary but no authenticated table
-- grants in its migration, so these direct probes stay on the constrained
-- runner role while auth.uid() claims still evaluate the policies.
do $push$
begin
  if (select count(*) from public.push_subscriptions where user_id = '57800000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001102') then
    raise exception 'push-subscription owner visibility is incorrect';
  end if;

  insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
  values (
    '57800000-0000-0000-0000-000000001103',
    '57800000-0000-0000-0000-000000000001',
    'https://push.example.test/planning-owner-probe',
    'planning-owner-probe-p256dh',
    'planning-owner-probe-auth',
    'planning-owner-probe-agent'
  );
  update public.push_subscriptions
  set user_agent = 'planning-owner-probe-agent-updated'
  where id = '57800000-0000-0000-0000-000000001103';
  if not exists (
    select 1 from public.push_subscriptions
    where id = '57800000-0000-0000-0000-000000001103'
      and user_agent = 'planning-owner-probe-agent-updated'
  ) then
    raise exception 'push-subscription owner update did not persist';
  end if;
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.push_subscriptions set user_id = '57800000-0000-0000-0000-000000000002' where id = '57800000-0000-0000-0000-000000001103'$$,
    '42501',
    'push-subscription ownership transfer'
  );
  delete from public.push_subscriptions
  where id = '57800000-0000-0000-0000-000000001103';
  if exists (select 1 from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001103') then
    raise exception 'push-subscription owner delete did not persist';
  end if;

  perform pg_temp.ralph_578_expect_zero_changes(
    $$update public.push_subscriptions set user_agent = 'cross-user push update' where id = '57800000-0000-0000-0000-000000001102'$$,
    'non-owner push-subscription update'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    $$delete from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001102'$$,
    'non-owner push-subscription delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth) values ('57800000-0000-0000-0000-000000001104', '57800000-0000-0000-0000-000000000002', 'https://push.example.test/cross-user', 'cross-user-p256dh', 'cross-user-auth')$$,
    '42501',
    'non-owner push-subscription insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth) values ('57800000-0000-0000-0000-000000001107', '57800000-0000-0000-0000-000000000001', 'https://push.example.test/planning-owner', 'duplicate-endpoint-p256dh', 'duplicate-endpoint-auth')$$,
    '23505',
    'push-subscription endpoint uniqueness constraint'
  );
end
$push$;

-- Calendar event reads and creates use table RLS. Update/delete use the
-- caller-bound lifecycle functions because authenticated direct table writes
-- are intentionally revoked by the calendar migrations.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claims', '', true);

do $block$
declare
  update_outcome jsonb;
  delete_outcome jsonb;
  calendar_reminder_id uuid;
  transitioned_reminder public.reminders;
  transition_denied boolean := false;
begin
  if (select count(*) from public.calendar_events where user_id = '57800000-0000-0000-0000-000000000001') <> 1
     or exists (select 1 from public.calendar_events where id = '57800000-0000-0000-0000-000000000802')
     or (select count(*) from public.reminders where user_id = '57800000-0000-0000-0000-000000000001') <> 2
     or exists (
       select 1 from public.reminders
       where id = current_setting('ralph.planning_other_habit_reminder_id')::uuid
     ) then
    raise exception 'calendar owner visibility is incorrect';
  end if;
  select id
  into calendar_reminder_id
  from public.reminders
  where user_id = '57800000-0000-0000-0000-000000000001'
    and source_type = 'calendar_event'
    and source_id = '57800000-0000-0000-0000-000000000801';
  if calendar_reminder_id is null then
    raise exception 'owner calendar reminder was not seeded';
  end if;

  select * from public.transition_calendar_event_reminder(
    '57800000-0000-0000-0000-000000000001',
    calendar_reminder_id,
    'pending',
    '2026-08-04 08:31:00+00',
    null
  ) into transitioned_reminder;
  if transitioned_reminder.id is distinct from calendar_reminder_id
     or transitioned_reminder.status is distinct from 'pending'
     or transitioned_reminder.fire_at is distinct from timestamptz '2026-08-04 08:31:00+00' then
    raise exception 'owner calendar reminder transition did not persist: %', transitioned_reminder;
  end if;

  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.calendar_events set title = 'direct calendar update denied' where id = '57800000-0000-0000-0000-000000000801'$$,
    '42501',
    'authenticated direct calendar update privilege'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.calendar_events where id = '57800000-0000-0000-0000-000000000801'$$,
    '42501',
    'authenticated direct calendar delete privilege'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.reminders (id, user_id, source_type, source_id, reminder_type, absolute_time, channels, fire_at) values ('57800000-0000-0000-0000-000000000908', '57800000-0000-0000-0000-000000000001', 'calendar_event', '57800000-0000-0000-0000-000000000801', 'absolute', '2026-08-04 08:40:00+00', '{push}', '2026-08-04 08:40:00+00')$$,
    '42501',
    'authenticated direct calendar reminder insert privilege'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    format('update public.reminders set status = ''failed'' where id = %L', calendar_reminder_id),
    'authenticated direct calendar reminder update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    format('delete from public.reminders where id = %L', calendar_reminder_id),
    '42501',
    'authenticated direct calendar reminder delete'
  );

  insert into public.calendar_events (
    id,
    user_id,
    title,
    start_date,
    end_date,
    start_time,
    end_time
  ) values (
    '57800000-0000-0000-0000-000000000803',
    '57800000-0000-0000-0000-000000000001',
    'Owner calendar probe',
    '2026-08-05',
    '2026-08-05',
    '09:00:00',
    '10:00:00'
  );

  update_outcome := public.update_calendar_event_with_reminders(
    '57800000-0000-0000-0000-000000000001',
    '57800000-0000-0000-0000-000000000803',
    '{"title":"Owner calendar probe updated"}'::jsonb,
    '[{"reminder_type":"absolute","absolute_time":"2026-08-05T08:30:00Z","channels":["push"]}]'::jsonb
  );
  if update_outcome->'event'->>'title' is distinct from 'Owner calendar probe updated'
     or jsonb_array_length(update_outcome->'reminders') <> 1 then
    raise exception 'calendar owner update did not persist: %', update_outcome;
  end if;

  delete_outcome := public.delete_calendar_event_with_reminders(
    '57800000-0000-0000-0000-000000000001',
    '57800000-0000-0000-0000-000000000803'
  );
  if delete_outcome is distinct from jsonb_build_object(
    'event_id', '57800000-0000-0000-0000-000000000803'::uuid,
    'deleted', true,
    'reminders_deleted', 1
  ) then
    raise exception 'calendar owner delete did not persist: %', delete_outcome;
  end if;

  if exists (
    select 1 from public.reminders
    where source_type = 'calendar_event'
      and source_id = '57800000-0000-0000-0000-000000000803'
  ) then
    raise exception 'calendar owner delete left a reminder behind';
  end if;

  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.reminders (id, user_id, source_type, source_id, reminder_type, channels, fire_at) values ('57800000-0000-0000-0000-000000000907', '57800000-0000-0000-0000-000000000001', 'habit', '57800000-0000-0000-0000-000000000401', 'absolute', array['push'], '2026-08-04 08:55:00+00')$$,
    '42501',
    'authenticated direct Habit Reminder Configuration insert privilege'
  );

  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.calendar_events (id, user_id, title, start_date, end_date) values ('57800000-0000-0000-0000-000000000804', '57800000-0000-0000-0000-000000000002', 'cross-user calendar insert', '2026-08-05', '2026-08-05')$$,
    '42501',
    'non-owner calendar insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$select public.create_calendar_event_with_reminder('57800000-0000-0000-0000-000000000002', '{"title":"cross-user lifecycle create","start_date":"2026-08-05","end_date":"2026-08-05"}'::jsonb, '[{"reminder_type":"absolute","absolute_time":"2026-08-05T08:00:00Z","channels":["push"]}]'::jsonb)$$,
    'P0001',
    'non-owner calendar lifecycle create'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$select public.update_calendar_event_with_reminders('57800000-0000-0000-0000-000000000001', '57800000-0000-0000-0000-000000000802', '{"title":"cross-user calendar update"}'::jsonb, '[]'::jsonb)$$,
    'P0002',
    'non-owner calendar update'
  );
  delete_outcome := public.delete_calendar_event_with_reminders(
    '57800000-0000-0000-0000-000000000001',
    '57800000-0000-0000-0000-000000000802'
  );
  if delete_outcome is distinct from jsonb_build_object(
    'event_id', '57800000-0000-0000-0000-000000000802'::uuid,
    'deleted', false,
    'reminders_deleted', 0
  ) then
    raise exception 'non-owner calendar delete changed state: %', delete_outcome;
  end if;
  perform pg_temp.ralph_578_expect_sqlstate(
    $$select public.update_calendar_event_with_reminders('57800000-0000-0000-0000-000000000002', '57800000-0000-0000-0000-000000000802', '{"title":"spoofed calendar update"}'::jsonb, '[]'::jsonb)$$,
    'P0001',
    'calendar owner spoof'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    format(
      'update public.reminders set status = ''failed'' where id = %L',
      current_setting('ralph.planning_other_habit_reminder_id')::uuid
    ),
    'non-owner reminder update'
  );
  perform pg_temp.ralph_578_expect_zero_changes(
    format(
      'delete from public.reminders where id = %L',
      current_setting('ralph.planning_other_habit_reminder_id')::uuid
    ),
    'non-owner reminder delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.reminders (id, user_id, source_type, source_id, reminder_type, relative_minutes, channels, fire_at) values ('57800000-0000-0000-0000-000000000904', '57800000-0000-0000-0000-000000000002', 'habit', '57800000-0000-0000-0000-000000000402', 'relative', 5, '{push}', '2026-08-04 10:35:00+00')$$,
    '42501',
    'non-owner reminder insert'
  );
  perform set_config(
    'request.jwt.claim.sub',
    '57800000-0000-0000-0000-000000000002',
    true
  );
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.transition_calendar_event_reminder(
      '57800000-0000-0000-0000-000000000002',
      calendar_reminder_id,
      'snoozed',
      null,
      null
    );
  exception
    when no_data_found then
      transition_denied := true;
    when sqlstate 'P0001' then
      transition_denied := true;
  end;
  if not transition_denied then
    raise exception 'calendar reminder owner spoof unexpectedly succeeded';
  end if;
  perform set_config(
    'request.jwt.claim.sub',
    '57800000-0000-0000-0000-000000000001',
    true
  );
  perform set_config('request.jwt.claims', '', true);
  if not exists (
    select 1
    from public.reminders
    where id = calendar_reminder_id
      and status = 'pending'
      and fire_at = timestamptz '2026-08-04 08:31:00+00'
  ) then
    raise exception 'calendar reminder owner spoof changed persisted state';
  end if;
end
$block$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  true
);
do $block$
begin
  if not exists (
    select 1 from public.calendar_events
    where id = '57800000-0000-0000-0000-000000000802'
      and title = 'Other calendar event'
  ) or exists (
    select 1 from public.calendar_events
    where id in ('57800000-0000-0000-0000-000000000803', '57800000-0000-0000-0000-000000000804')
  ) or not exists (
    select 1 from public.reminders
    where id = current_setting('ralph.planning_other_habit_reminder_id')::uuid
      and status = 'pending'
  ) or not exists (
    select 1 from public.reminder_defaults
    where id = '57800000-0000-0000-0000-000000001002'
      and relative_minutes = 45
  ) or exists (
    select 1 from public.reminders where id = '57800000-0000-0000-0000-000000000904'
  ) or exists (
    select 1 from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001004'
  ) or (select count(*) from public.calendar_events where user_id = '57800000-0000-0000-0000-000000000002') <> 1
  or (select count(*) from public.reminders where user_id = '57800000-0000-0000-0000-000000000002' and source_type = 'calendar_event') <> 1
  or not exists (
    select 1 from public.push_subscriptions
    where id = '57800000-0000-0000-0000-000000001102'
      and user_agent = 'planning-other-agent'
  ) or exists (
    select 1 from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001104'
  )
  or exists (
    select 1 from public.calendar_events where title = 'cross-user lifecycle create'
  ) then
    raise exception 'non-owner calendar write changed persisted state';
  end if;
end
$block$;

do $push$
begin
  if (select count(*) from public.push_subscriptions where user_id = '57800000-0000-0000-0000-000000000002') <> 1
     or exists (select 1 from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001101') then
    raise exception 'push-subscription second-user visibility is incorrect';
  end if;

  insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
  values (
    '57800000-0000-0000-0000-000000001105',
    '57800000-0000-0000-0000-000000000002',
    'https://push.example.test/planning-other-probe',
    'planning-other-probe-p256dh',
    'planning-other-probe-auth',
    'planning-other-probe-agent'
  );
  update public.push_subscriptions
  set user_agent = 'planning-other-probe-agent-updated'
  where id = '57800000-0000-0000-0000-000000001105';
  if not exists (
    select 1 from public.push_subscriptions
    where id = '57800000-0000-0000-0000-000000001105'
      and user_agent = 'planning-other-probe-agent-updated'
  ) then
    raise exception 'push-subscription second-user update did not persist';
  end if;
  delete from public.push_subscriptions
  where id = '57800000-0000-0000-0000-000000001105';
  if exists (select 1 from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001105') then
    raise exception 'push-subscription second-user delete did not persist';
  end if;
end
$push$;

-- The second authenticated user also owns a complete calendar/reminder
-- matrix, including the lifecycle RPCs and delivery-only reminder reads.
set local role authenticated;
do $block$
declare
  created_outcome jsonb;
  delete_outcome jsonb;
  calendar_reminder_id uuid;
  transitioned_reminder public.reminders;
begin
  if (select count(*) from public.calendar_events where user_id = '57800000-0000-0000-0000-000000000002') <> 1
     or exists (select 1 from public.calendar_events where id = '57800000-0000-0000-0000-000000000801')
     or (select count(*) from public.reminders where user_id = '57800000-0000-0000-0000-000000000002') <> 2
     or exists (
       select 1 from public.reminders
       where id = current_setting('ralph.planning_owner_habit_reminder_id')::uuid
     ) then
    raise exception 'second-user calendar visibility is incorrect';
  end if;
  select id
  into calendar_reminder_id
  from public.reminders
  where user_id = '57800000-0000-0000-0000-000000000002'
    and source_type = 'calendar_event'
    and source_id = '57800000-0000-0000-0000-000000000802';
  if calendar_reminder_id is null then
    raise exception 'second-user calendar reminder was not seeded';
  end if;
  select * from public.transition_calendar_event_reminder(
    '57800000-0000-0000-0000-000000000002',
    calendar_reminder_id,
    'pending',
    '2026-08-04 10:31:00+00',
    null
  ) into transitioned_reminder;
  if transitioned_reminder.id is distinct from calendar_reminder_id
     or transitioned_reminder.status is distinct from 'pending'
     or transitioned_reminder.fire_at is distinct from timestamptz '2026-08-04 10:31:00+00' then
    raise exception 'second-user calendar reminder transition did not persist: %', transitioned_reminder;
  end if;

  created_outcome := public.create_calendar_event_with_reminder(
    '57800000-0000-0000-0000-000000000002',
    '{"title":"Second-user calendar probe","start_date":"2026-08-06","end_date":"2026-08-06","start_time":"13:00:00","end_time":"14:00:00"}'::jsonb,
    '[{"reminder_type":"absolute","absolute_time":"2026-08-06T12:30:00Z","channels":["push"]}]'::jsonb
  );
  if created_outcome->'event'->>'title' is distinct from 'Second-user calendar probe'
     or jsonb_array_length(created_outcome->'reminders') <> 1 then
    raise exception 'second-user calendar create did not persist: %', created_outcome;
  end if;
  delete_outcome := public.delete_calendar_event_with_reminders(
    '57800000-0000-0000-0000-000000000002',
    (created_outcome->'event'->>'id')::uuid
  );
  if delete_outcome->>'deleted' is distinct from 'true'
     or (delete_outcome->>'reminders_deleted')::integer <> 1 then
    raise exception 'second-user calendar delete did not persist: %', delete_outcome;
  end if;

  perform public.update_calendar_event_with_reminders(
    '57800000-0000-0000-0000-000000000002',
    '57800000-0000-0000-0000-000000000802',
    '{"title":"Other calendar event updated"}'::jsonb,
    null
  );
  if not exists (
    select 1 from public.calendar_events
    where id = '57800000-0000-0000-0000-000000000802'
      and title = 'Other calendar event updated'
  ) then
    raise exception 'second-user lifecycle calendar update did not persist';
  end if;
  perform public.update_calendar_event_with_reminders(
    '57800000-0000-0000-0000-000000000002',
    '57800000-0000-0000-0000-000000000802',
    '{"title":"Other calendar event"}'::jsonb,
    null
  );

end
$block$;
reset role;
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  true
);

-- The actual anon role is expected to lack table grants, so its read probes
-- below can validate ACL denial. Separately retain the constrained runner's
-- table grants with no identity claim to prove the policies filter every
-- owner's row even when ACLs do not short-circuit the query.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
do $anonymous_rls$
begin
  if exists (select 1 from public.tasks where id = '57800000-0000-0000-0000-000000000201')
     or exists (select 1 from public.projects where id = '57800000-0000-0000-0000-000000000101')
     or exists (select 1 from public.recurring_tasks where id = '57800000-0000-0000-0000-000000000301')
     or exists (select 1 from public.habits where id = '57800000-0000-0000-0000-000000000401')
     or exists (select 1 from public.habit_logs where id = '57800000-0000-0000-0000-000000000501')
     or exists (select 1 from public.habit_milestones where id = '57800000-0000-0000-0000-000000000601')
     or exists (select 1 from public.habit_graduations where id = '57800000-0000-0000-0000-000000000701')
     or exists (select 1 from public.calendar_events where id = '57800000-0000-0000-0000-000000000801')
     or exists (
       select 1 from public.reminders
       where id = current_setting('ralph.planning_owner_habit_reminder_id')::uuid
     )
     or exists (select 1 from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001001')
     or exists (select 1 from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001101') then
    raise exception 'anonymous RLS filtering exposed an owner row';
  end if;
end
$anonymous_rls$;

-- Anonymous has no visibility and no write path for any matrix. The helper
-- accepts either an explicit privilege denial or an empty RLS result, then
-- the final admin checks prove no attempted write created or changed data.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

do $block$
begin
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.tasks where id = '57800000-0000-0000-0000-000000000201'$$,
    'anonymous task read'
  );
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.projects where id = '57800000-0000-0000-0000-000000000101'$$,
    'anonymous project read'
  );
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.recurring_tasks where id = '57800000-0000-0000-0000-000000000301'$$,
    'anonymous recurring-task read'
  );
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.habits where id = '57800000-0000-0000-0000-000000000401'$$,
    'anonymous habit read'
  );
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.habit_logs where id = '57800000-0000-0000-0000-000000000501'$$,
    'anonymous habit-log read'
  );
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.habit_milestones where id = '57800000-0000-0000-0000-000000000601'$$,
    'anonymous habit-milestone read'
  );
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.habit_graduations where id = '57800000-0000-0000-0000-000000000701'$$,
    'anonymous habit-graduation read'
  );
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.calendar_events where id = '57800000-0000-0000-0000-000000000801'$$,
    'anonymous calendar read'
  );
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.reminders where id = current_setting('ralph.planning_owner_habit_reminder_id')::uuid$$,
    'anonymous reminder read'
  );
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001001'$$,
    'anonymous reminder-default read'
  );
  perform pg_temp.ralph_578_expect_hidden(
    $$select count(*) from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001101'$$,
    'anonymous push-subscription read'
  );

  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.tasks (id, user_id, title, section) values ('57800000-0000-0000-0000-000000000206', '57800000-0000-0000-0000-000000000001', 'anonymous task insert', 'personal')$$,
    '42501',
    'anonymous task insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.tasks set title = 'anonymous task update' where id = '57800000-0000-0000-0000-000000000201'$$,
    '42501',
    'anonymous task update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.tasks where id = '57800000-0000-0000-0000-000000000201'$$,
    '42501',
    'anonymous task delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.projects (id, user_id, name, section, color) values ('57800000-0000-0000-0000-000000000106', '57800000-0000-0000-0000-000000000001', 'anonymous project insert', 'personal', 'red')$$,
    '42501',
    'anonymous project insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.projects set name = 'anonymous project update' where id = '57800000-0000-0000-0000-000000000101'$$,
    '42501',
    'anonymous project update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.projects where id = '57800000-0000-0000-0000-000000000101'$$,
    '42501',
    'anonymous project delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.recurring_tasks (id, user_id, title, recurrence_rule, start_date) values ('57800000-0000-0000-0000-000000000306', '57800000-0000-0000-0000-000000000001', 'anonymous recurring insert', '{"frequency":"daily"}', '2026-08-05')$$,
    '42501',
    'anonymous recurring-task insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.recurring_tasks set title = 'anonymous recurring update' where id = '57800000-0000-0000-0000-000000000301'$$,
    '42501',
    'anonymous recurring-task update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.recurring_tasks where id = '57800000-0000-0000-0000-000000000301'$$,
    '42501',
    'anonymous recurring-task delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.habits (id, user_id, name, frequency) values ('57800000-0000-0000-0000-000000000406', '57800000-0000-0000-0000-000000000001', 'anonymous habit insert', '{"type":"daily"}')$$,
    '42501',
    'anonymous habit insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.habits set name = 'anonymous habit update' where id = '57800000-0000-0000-0000-000000000401'$$,
    '42501',
    'anonymous habit update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.habits where id = '57800000-0000-0000-0000-000000000401'$$,
    '42501',
    'anonymous habit delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$select public.set_habit_completion_atomically('57800000-0000-0000-0000-000000000401', '57800000-0000-0000-0000-000000000001', '2026-08-06', true, '2026-08-06')$$,
    '42501',
    'anonymous habit completion'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.habit_logs (id, habit_id, user_id, logged_date) values ('57800000-0000-0000-0000-000000000506', '57800000-0000-0000-0000-000000000401', '57800000-0000-0000-0000-000000000001', '2026-08-05')$$,
    '42501',
    'anonymous habit-log insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.habit_logs set completed = false where id = '57800000-0000-0000-0000-000000000501'$$,
    '42501',
    'anonymous habit-log update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.habit_logs where id = '57800000-0000-0000-0000-000000000501'$$,
    '42501',
    'anonymous habit-log delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.habit_milestones (id, habit_id, user_id, milestone) values ('57800000-0000-0000-0000-000000000606', '57800000-0000-0000-0000-000000000401', '57800000-0000-0000-0000-000000000001', 21)$$,
    '42501',
    'anonymous habit-milestone insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.habit_milestones set milestone = 30 where id = '57800000-0000-0000-0000-000000000601'$$,
    '42501',
    'anonymous habit-milestone update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.habit_milestones where id = '57800000-0000-0000-0000-000000000601'$$,
    '42501',
    'anonymous habit-milestone delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.habit_graduations set graduated_streak = 30 where id = '57800000-0000-0000-0000-000000000701'$$,
    '42501',
    'anonymous habit-graduation update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.habit_graduations where id = '57800000-0000-0000-0000-000000000701'$$,
    '42501',
    'anonymous habit-graduation delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.habit_graduations (id, habit_id, user_id, graduated_at, graduated_streak) values ('57800000-0000-0000-0000-000000000706', '57800000-0000-0000-0000-000000000401', '57800000-0000-0000-0000-000000000001', '2026-08-05 00:00:00+00', 21)$$,
    '42501',
    'anonymous habit-graduation insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.calendar_events (id, user_id, title, start_date, end_date) values ('57800000-0000-0000-0000-000000000806', '57800000-0000-0000-0000-000000000001', 'anonymous calendar insert', '2026-08-05', '2026-08-05')$$,
    '42501',
    'anonymous calendar insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.calendar_events set title = 'anonymous calendar update' where id = '57800000-0000-0000-0000-000000000801'$$,
    '42501',
    'anonymous calendar update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.calendar_events where id = '57800000-0000-0000-0000-000000000801'$$,
    '42501',
    'anonymous calendar delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.reminders (id, user_id, source_type, source_id, reminder_type, relative_minutes, channels, fire_at) values ('57800000-0000-0000-0000-000000000906', '57800000-0000-0000-0000-000000000001', 'habit', '57800000-0000-0000-0000-000000000401', 'relative', 5, '{push}', '2026-08-04 08:55:00+00')$$,
    '42501',
    'anonymous reminder insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    format(
      'update public.reminders set status = ''failed'' where id = %L',
      current_setting('ralph.planning_owner_habit_reminder_id')::uuid
    ),
    '42501',
    'anonymous reminder update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    format(
      'delete from public.reminders where id = %L',
      current_setting('ralph.planning_owner_habit_reminder_id')::uuid
    ),
    '42501',
    'anonymous reminder delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.reminder_defaults (id, user_id, source_type, relative_minutes, channels) values ('57800000-0000-0000-0000-000000001006', '57800000-0000-0000-0000-000000000001', 'habit', 15, '{push}')$$,
    '42501',
    'anonymous reminder-default insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.reminder_defaults set relative_minutes = 60 where id = '57800000-0000-0000-0000-000000001001'$$,
    '42501',
    'anonymous reminder-default update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001001'$$,
    '42501',
    'anonymous reminder-default delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth) values ('57800000-0000-0000-0000-000000001106', '57800000-0000-0000-0000-000000000001', 'https://push.example.test/anonymous', 'anonymous-p256dh', 'anonymous-auth')$$,
    '42501',
    'anonymous push-subscription insert'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$update public.push_subscriptions set user_agent = 'anonymous-update' where id = '57800000-0000-0000-0000-000000001101'$$,
    '42501',
    'anonymous push-subscription update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$delete from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001101'$$,
    '42501',
    'anonymous push-subscription delete'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    format(
      'select public.transition_calendar_event_reminder(%L, %L, ''snoozed'', null, null)',
      '57800000-0000-0000-0000-000000000001'::uuid,
      current_setting('ralph.planning_owner_habit_reminder_id')::uuid
    ),
    '42501',
    'anonymous calendar reminder transition'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$select public.create_calendar_event_with_reminder('57800000-0000-0000-0000-000000000001', '{"title":"anonymous lifecycle create","start_date":"2026-08-05","end_date":"2026-08-05"}'::jsonb, '[{"reminder_type":"absolute","absolute_time":"2026-08-05T08:00:00Z","channels":["push"]}]'::jsonb)$$,
    '42501',
    'anonymous calendar lifecycle create'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$select public.update_calendar_event_with_reminders('57800000-0000-0000-0000-000000000001', '57800000-0000-0000-0000-000000000801', '{"title":"anonymous lifecycle update"}'::jsonb, '[]'::jsonb)$$,
    '42501',
    'anonymous calendar lifecycle update'
  );
  perform pg_temp.ralph_578_expect_sqlstate(
    $$select public.delete_calendar_event_with_reminders('57800000-0000-0000-0000-000000000001', '57800000-0000-0000-0000-000000000801')$$,
    '42501',
    'anonymous calendar lifecycle delete'
  );
end
$block$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000001',
  true
);
do $block$
begin
  if not exists (
    select 1 from public.tasks
    where id = '57800000-0000-0000-0000-000000000201'
      and title = 'Owner task'
  ) or not exists (
    select 1 from public.projects
    where id = '57800000-0000-0000-0000-000000000101'
      and name = 'Owner project'
  ) or not exists (
    select 1 from public.habits
    where id = '57800000-0000-0000-0000-000000000401'
      and name = 'Owner habit'
  ) or not exists (
    select 1 from public.habit_logs
    where id = '57800000-0000-0000-0000-000000000501'
      and completed
  ) or not exists (
    select 1 from public.calendar_events
    where id = '57800000-0000-0000-0000-000000000801'
      and title = 'Owner calendar event'
  ) or not exists (
    select 1 from public.recurring_tasks
    where id = '57800000-0000-0000-0000-000000000301'
      and title = 'Owner recurring task'
  ) or not exists (
    select 1 from public.habit_milestones
    where id = '57800000-0000-0000-0000-000000000601'
      and milestone = 7
  ) or not exists (
    select 1 from public.habit_graduations
    where id = '57800000-0000-0000-0000-000000000701'
      and graduated_streak = 30
  ) or not exists (
    select 1 from public.reminders
    where id = current_setting('ralph.planning_owner_habit_reminder_id')::uuid
      and status = 'pending'
  ) or not exists (
    select 1 from public.reminder_defaults
    where id = '57800000-0000-0000-0000-000000001001'
      and relative_minutes = 30
  ) or not exists (
    select 1 from public.push_subscriptions
    where id = '57800000-0000-0000-0000-000000001101'
      and endpoint = 'https://push.example.test/planning-owner'
      and user_agent = 'planning-owner-agent'
  ) or (select count(*) from public.calendar_events where user_id = '57800000-0000-0000-0000-000000000001') <> 1
  or (select count(*) from public.reminders where user_id = '57800000-0000-0000-0000-000000000001' and source_type = 'calendar_event') <> 1
  or exists (
    select 1 from public.calendar_events where title = 'anonymous lifecycle create'
  ) or exists (
    select 1
    from public.tasks where id in ('57800000-0000-0000-0000-000000000206', '57800000-0000-0000-0000-000000000207')
  ) or exists (
    select 1 from public.projects where id in ('57800000-0000-0000-0000-000000000106', '57800000-0000-0000-0000-000000000107')
  ) or exists (
    select 1 from public.recurring_tasks where id in ('57800000-0000-0000-0000-000000000306', '57800000-0000-0000-0000-000000000307')
  ) or exists (
    select 1 from public.habits where id in ('57800000-0000-0000-0000-000000000406', '57800000-0000-0000-0000-000000000405')
  ) or exists (
    select 1 from public.habit_logs where id in ('57800000-0000-0000-0000-000000000506', '57800000-0000-0000-0000-000000000505')
  ) or exists (
    select 1 from public.habit_milestones where id in ('57800000-0000-0000-0000-000000000606', '57800000-0000-0000-0000-000000000605')
  ) or exists (
    select 1 from public.habit_graduations where id in ('57800000-0000-0000-0000-000000000706', '57800000-0000-0000-0000-000000000705')
  ) or exists (
    select 1 from public.calendar_events where id in ('57800000-0000-0000-0000-000000000806', '57800000-0000-0000-0000-000000000803')
  ) or exists (
    select 1 from public.reminders where id in ('57800000-0000-0000-0000-000000000906', '57800000-0000-0000-0000-000000000903', '57800000-0000-0000-0000-000000000905')
  ) or exists (
    select 1 from public.reminder_defaults where id in ('57800000-0000-0000-0000-000000001006', '57800000-0000-0000-0000-000000001003', '57800000-0000-0000-0000-000000001005')
  ) or exists (
    select 1 from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001106'
  ) then
    raise exception 'anonymous write changed persisted state';
  end if;
end
$block$;

select set_config(
  'request.jwt.claim.sub',
  '57800000-0000-0000-0000-000000000002',
  true
);
do $block$
begin
  if not exists (select 1 from public.tasks where id = '57800000-0000-0000-0000-000000000202' and title = 'Other task')
     or not exists (select 1 from public.projects where id = '57800000-0000-0000-0000-000000000102' and name = 'Other project')
     or not exists (select 1 from public.recurring_tasks where id = '57800000-0000-0000-0000-000000000302' and title = 'Other recurring task')
     or not exists (select 1 from public.habits where id = '57800000-0000-0000-0000-000000000402' and name = 'Other habit')
     or not exists (select 1 from public.habit_logs where id = '57800000-0000-0000-0000-000000000502' and completed)
     or not exists (select 1 from public.habit_milestones where id = '57800000-0000-0000-0000-000000000602' and milestone = 14)
     or not exists (select 1 from public.habit_graduations where id = '57800000-0000-0000-0000-000000000702' and graduated_streak = 14)
     or not exists (select 1 from public.calendar_events where id = '57800000-0000-0000-0000-000000000802' and title = 'Other calendar event')
     or not exists (
       select 1 from public.reminders
       where id = current_setting('ralph.planning_other_habit_reminder_id')::uuid
         and status = 'pending'
     )
     or not exists (select 1 from public.reminder_defaults where id = '57800000-0000-0000-0000-000000001002' and relative_minutes = 45)
     or not exists (select 1 from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001102' and user_agent = 'planning-other-agent')
     or exists (select 1 from public.tasks where id in ('57800000-0000-0000-0000-000000000204', '57800000-0000-0000-0000-000000000207'))
     or exists (select 1 from public.projects where id in ('57800000-0000-0000-0000-000000000104', '57800000-0000-0000-0000-000000000107'))
     or exists (select 1 from public.recurring_tasks where id in ('57800000-0000-0000-0000-000000000304', '57800000-0000-0000-0000-000000000307'))
     or exists (select 1 from public.habits where id in ('57800000-0000-0000-0000-000000000404', '57800000-0000-0000-0000-000000000405'))
     or exists (select 1 from public.habit_logs where id in ('57800000-0000-0000-0000-000000000504', '57800000-0000-0000-0000-000000000505'))
     or exists (select 1 from public.habit_milestones where id in ('57800000-0000-0000-0000-000000000604', '57800000-0000-0000-0000-000000000605'))
     or exists (select 1 from public.habit_graduations where id in ('57800000-0000-0000-0000-000000000704', '57800000-0000-0000-0000-000000000705'))
     or exists (select 1 from public.calendar_events where id in ('57800000-0000-0000-0000-000000000804', '57800000-0000-0000-0000-000000000805'))
     or exists (select 1 from public.reminders where id in ('57800000-0000-0000-0000-000000000904', '57800000-0000-0000-0000-000000000905'))
     or exists (select 1 from public.reminder_defaults where id in ('57800000-0000-0000-0000-000000001004', '57800000-0000-0000-0000-000000001005'))
     or exists (select 1 from public.push_subscriptions where id = '57800000-0000-0000-0000-000000001105') then
    raise exception 'second-user write changed persisted state';
  end if;
end
$block$;

-- Two independent authenticated sessions must serialize completion writes on
-- the same habit row. Keep setup, verification, and cleanup in one guarded
-- block: the dblink sessions commit independently, so an exception must
-- explicitly remove the disposable identity before the fixture can fail.
do $concurrency$
declare
  setup_status text;
  outcome_a jsonb;
  outcome_b jsonb;
  cleanup_status text;
  original_error text;
  emergency_error text;
  advisory_lock_held boolean := false;
begin
  begin
    perform public.ralph_ci_open_connection('planning-concurrency-setup');
    perform extensions.dblink_send_query(
      'planning-concurrency-setup',
      $query$
        do $setup$
        begin
          execute 'reset role';
          perform public.ralph_ci_create_auth_user(
            '57800000-0000-0000-0000-000000009001',
            'planning-concurrency@example.test'
          );
          execute 'set role authenticated';
          perform set_config(
            'request.jwt.claims',
            '{"sub":"57800000-0000-0000-0000-000000009001"}',
            false
          );
          insert into public.habits (id, user_id, name, frequency)
          values (
            '57800000-0000-0000-0000-000000009001',
            '57800000-0000-0000-0000-000000009001',
            'Planning concurrency habit',
            '{"type":"daily"}'::jsonb
          );
        end
        $setup$;
      $query$
    );
    select status
    into setup_status
    from extensions.dblink_get_result('planning-concurrency-setup')
      as result(status text);
    perform extensions.dblink_disconnect('planning-concurrency-setup');

    perform public.ralph_ci_open_connection('planning-concurrency-a');
    perform public.ralph_ci_open_connection('planning-concurrency-b');
    perform pg_advisory_lock(578000578);
    advisory_lock_held := true;
    perform extensions.dblink_send_query(
      'planning-concurrency-a',
      $query$
        with gate as materialized (
          select pg_advisory_xact_lock(578000578)
        ),
        request_context as materialized (
          select set_config(
            'request.jwt.claims',
            '{"sub":"57800000-0000-0000-0000-000000009001"}',
            false
          )
          from gate
        ),
        completed as materialized (
          select public.set_habit_completion_atomically(
            '57800000-0000-0000-0000-000000009001',
            '57800000-0000-0000-0000-000000009001',
            date '2026-08-10',
            true,
            date '2026-08-11'
          ) outcome
          from request_context
        )
        select completed.outcome
        from completed
      $query$
    );
    perform extensions.dblink_send_query(
      'planning-concurrency-b',
      $query$
        with gate as materialized (
          select pg_advisory_xact_lock(578000578)
        ),
        request_context as materialized (
          select set_config(
            'request.jwt.claims',
            '{"sub":"57800000-0000-0000-0000-000000009001"}',
            false
          )
          from gate
        )
        select public.set_habit_completion_atomically(
          '57800000-0000-0000-0000-000000009001',
          '57800000-0000-0000-0000-000000009001',
          date '2026-08-11',
          true,
          date '2026-08-11'
        )
        from request_context
      $query$
    );
    if not pg_advisory_unlock(578000578) then
      raise exception 'concurrency advisory lock was not held';
    end if;
    advisory_lock_held := false;
    select outcome
    into outcome_a
    from extensions.dblink_get_result('planning-concurrency-a')
      as result(outcome jsonb);
    select outcome
    into outcome_b
    from extensions.dblink_get_result('planning-concurrency-b')
      as result(outcome jsonb);
    perform extensions.dblink_disconnect('planning-concurrency-a');
    perform extensions.dblink_disconnect('planning-concurrency-b');

    perform set_config(
      'request.jwt.claim.sub',
      '57800000-0000-0000-0000-000000009001',
      true
    );
    perform set_config('request.jwt.claims', '', true);
    if (select count(*) from public.habit_logs where habit_id = '57800000-0000-0000-0000-000000009001') <> 2
       or not exists (
         select 1
         from public.habits
         where id = '57800000-0000-0000-0000-000000009001'
           and current_streak = 2
           and best_streak = 2
       )
       or not (
         ((outcome_a->>'current_streak')::integer = 1 and (outcome_b->>'current_streak')::integer = 2)
         or ((outcome_a->>'current_streak')::integer = 2 and (outcome_b->>'current_streak')::integer = 1)
       ) then
      raise exception 'concurrent habit completion writes were not serialized: a=%, b=%',
        outcome_a,
        outcome_b;
    end if;

    perform public.ralph_ci_open_connection('planning-concurrency-cleanup');
    perform extensions.dblink_send_query(
      'planning-concurrency-cleanup',
      $query$
        do $cleanup$
        begin
          execute 'reset role';
          perform public.ralph_ci_delete_auth_user(
            '57800000-0000-0000-0000-000000009001'
          );
        end
        $cleanup$;
      $query$
    );
    select status
    into cleanup_status
    from extensions.dblink_get_result('planning-concurrency-cleanup')
      as result(status text);
    perform extensions.dblink_disconnect('planning-concurrency-cleanup');

    if exists (
      select 1 from public.habits where id = '57800000-0000-0000-0000-000000009001'
    ) or exists (
      select 1 from public.habit_logs where habit_id = '57800000-0000-0000-0000-000000009001'
    ) then
      raise exception 'concurrency fixture cleanup left planning rows behind';
    end if;
  exception
    when others then
      get stacked diagnostics original_error = message_text;
      if advisory_lock_held then
        perform pg_advisory_unlock(578000578);
        advisory_lock_held := false;
      end if;
      begin
        if extensions.dblink_is_busy('planning-concurrency-setup') then
          perform extensions.dblink_cancel_query('planning-concurrency-setup');
        end if;
        perform extensions.dblink_disconnect('planning-concurrency-setup');
      exception when others then
        null;
      end;
      begin
        if extensions.dblink_is_busy('planning-concurrency-a') then
          perform extensions.dblink_cancel_query('planning-concurrency-a');
        end if;
        perform extensions.dblink_disconnect('planning-concurrency-a');
      exception when others then
        null;
      end;
      begin
        if extensions.dblink_is_busy('planning-concurrency-b') then
          perform extensions.dblink_cancel_query('planning-concurrency-b');
        end if;
        perform extensions.dblink_disconnect('planning-concurrency-b');
      exception when others then
        null;
      end;
      begin
        if extensions.dblink_is_busy('planning-concurrency-cleanup') then
          perform extensions.dblink_cancel_query('planning-concurrency-cleanup');
        end if;
        perform extensions.dblink_disconnect('planning-concurrency-cleanup');
      exception when others then
        null;
      end;
      begin
        perform public.ralph_ci_open_connection('planning-concurrency-emergency-cleanup');
        perform extensions.dblink_send_query(
          'planning-concurrency-emergency-cleanup',
          $query$
            do $cleanup$
            begin
              execute 'reset role';
              perform public.ralph_ci_delete_auth_user(
                '57800000-0000-0000-0000-000000009001'
              );
            end
            $cleanup$;
          $query$
        );
        select status
        into cleanup_status
        from extensions.dblink_get_result('planning-concurrency-emergency-cleanup')
          as result(status text);
        perform extensions.dblink_disconnect('planning-concurrency-emergency-cleanup');
      exception when others then
        get stacked diagnostics emergency_error = message_text;
      end;
      if emergency_error is not null then
        raise exception 'concurrency fixture failed: %; emergency cleanup failed: %',
          original_error,
          emergency_error;
      end if;
      raise;
  end;
end
$concurrency$;

select 'PASS: planning and work-management RLS matrices enforce owner, non-owner, and anonymous boundaries';

reset role;
rollback;
