-- ralph-ci: true
-- Exercise the shared Reminder Delivery state machine through its SQL
-- persistence boundary. Configuration remains source-owned by Task.
begin;

select public.ralph_ci_create_auth_user(
  '65700000-0000-0000-0000-000000000001',
  'reminder-delivery@example.test'
);
select public.ralph_ci_create_auth_user(
  '65700000-0000-0000-0000-000000000002',
  'other-reminder-delivery@example.test'
);

select set_config('request.jwt.claims', '', false);
select set_config(
  'request.jwt.claim.sub',
  '65700000-0000-0000-0000-000000000001',
  false
);
insert into public.tasks (id, user_id, title, due_date, due_time)
values
  (
    '65700000-0000-0000-0000-000000000101',
    '65700000-0000-0000-0000-000000000001',
    'Reminder Delivery task',
    '2099-01-01',
    '10:00:00'
  );

reset role;
set local role authenticated;

do $$
declare
  configured jsonb;
  reminder_id uuid;
  old_fire_at timestamptz;
  outcome jsonb;
begin
  if has_table_privilege('authenticated', 'public.reminders', 'UPDATE') then
    raise exception 'authenticated retained direct Reminder Delivery UPDATE privilege';
  end if;
  if not has_table_privilege(
    'betterr_reminder_delivery', 'public.reminders', 'UPDATE'
  ) then
    raise exception 'Reminder Delivery owner lacks UPDATE privilege';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.transition_reminder_delivery(uuid,uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks Reminder Delivery execute privilege';
  end if;
  if has_function_privilege(
    'anon',
    'public.transition_reminder_delivery(uuid,uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'anonymous Reminder Delivery execute privilege leaked';
  end if;
  if exists (
    select 1
    from pg_roles
    where rolname = 'betterr_reminder_delivery'
      and (
        rolcanlogin or rolsuper or rolcreatedb or rolcreaterole
        or rolinherit or rolreplication or rolbypassrls
      )
  ) then
    raise exception 'Reminder Delivery owner role has unsafe attributes';
  end if;
  if exists (
    select 1
    from pg_proc routine
    where routine.oid =
      'public.transition_reminder_delivery(uuid,uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz)'::regprocedure
      and (
        pg_get_userbyid(routine.proowner) <> 'betterr_reminder_delivery'
        or not routine.prosecdef
        or not (routine.proconfig @> array['search_path=pg_catalog, public'])
      )
  ) then
    raise exception 'Reminder Delivery security settings are unsafe';
  end if;

  configured := public.configure_task_reminders(
    '65700000-0000-0000-0000-000000000001',
    '65700000-0000-0000-0000-000000000101',
    '[{
      "reminder_type": "absolute",
      "absolute_time": "2099-01-01T09:00:00Z",
      "relative_minutes": null,
      "channels": ["push"]
    }]'::jsonb
  );
  if configured->>'type' <> 'configured' then
    raise exception 'Task configuration setup failed: %', configured;
  end if;
  reminder_id := (configured->'reminders'->0->>'id')::uuid;
  old_fire_at := (configured->'reminders'->0->>'fire_at')::timestamptz;

  -- Authenticated callers cannot mutate delivery or configuration columns by
  -- direct table write; they must use a lifecycle RPC.
  begin
    update public.reminders
    set status = 'sent', channels = array['email']
    where id = reminder_id;
    raise exception 'direct Reminder Delivery UPDATE unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;

  outcome := public.transition_reminder_delivery(
    '65700000-0000-0000-0000-000000000001',
    reminder_id,
    'user',
    'snooze',
    '2099-01-02T09:00:00Z'::timestamptz,
    null,
    'pending',
    old_fire_at,
    null
  );
  if outcome->>'type' <> 'transitioned'
    or outcome->'reminder'->>'status' <> 'pending'
    or (outcome->'reminder'->>'fire_at')::timestamptz
      <> timestamptz '2099-01-02 09:00:00+00' then
    raise exception 'Reminder Delivery snooze was incorrect: %', outcome;
  end if;

  outcome := public.transition_reminder_delivery(
    '65700000-0000-0000-0000-000000000001',
    reminder_id,
    'user',
    'snooze',
    '2099-01-02T09:00:00Z'::timestamptz,
    null,
    'pending',
    '2099-01-02T09:00:00Z'::timestamptz,
    null
  );
  if outcome->>'type' <> 'already-applied' then
    raise exception 'Reminder Delivery snooze retry was not idempotent: %', outcome;
  end if;

  -- A stale expected state is a typed optimistic conflict, not a blind write.
  outcome := public.transition_reminder_delivery(
    '65700000-0000-0000-0000-000000000001',
    reminder_id,
    'user',
    'sent',
    '2099-01-02T09:00:00Z'::timestamptz,
    '2099-01-02T09:01:00Z'::timestamptz,
    'pending',
    old_fire_at,
    null
  );
  if outcome->>'type' <> 'conflict' then
    raise exception 'Reminder Delivery stale expected state was not a conflict: %', outcome;
  end if;

  outcome := public.transition_reminder_delivery(
    '65700000-0000-0000-0000-000000000001',
    reminder_id,
    'user',
    'sent',
    '2099-01-02T09:00:00Z'::timestamptz,
    '2099-01-02T09:01:00Z'::timestamptz,
    'pending',
    '2099-01-02T09:00:00Z'::timestamptz,
    null
  );
  if outcome->>'type' <> 'transitioned'
    or outcome->'reminder'->>'status' <> 'sent' then
    raise exception 'Reminder Delivery sent transition was incorrect: %', outcome;
  end if;

  outcome := public.transition_reminder_delivery(
    '65700000-0000-0000-0000-000000000001',
    reminder_id,
    'user',
    'sent',
    '2099-01-02T09:00:00Z'::timestamptz,
    '2099-01-02T09:01:00Z'::timestamptz,
    'sent',
    '2099-01-02T09:00:00Z'::timestamptz,
    '2099-01-02T09:01:00Z'::timestamptz
  );
  if outcome->>'type' <> 'already-applied' then
    raise exception 'Reminder Delivery sent retry was not idempotent: %', outcome;
  end if;

  -- Configuration-shaped transition names are rejected at the Delivery
  -- boundary instead of becoming an untyped update escape hatch.
  outcome := public.transition_reminder_delivery(
    '65700000-0000-0000-0000-000000000001',
    reminder_id,
    'user',
    'configure',
    null,
    null,
    'sent',
    '2099-01-02T09:00:00Z'::timestamptz,
    '2099-01-02T09:01:00Z'::timestamptz
  );
  if outcome->>'type' <> 'invalid-transition' then
    raise exception 'Configuration-shaped Delivery transition was accepted: %', outcome;
  end if;
end
$$;

-- A user may not claim trusted operational dispatch context.
do $$
declare
  outcome jsonb;
  reminder_id uuid;
begin
  select id into reminder_id
  from public.reminders
  where source_type = 'task'
    and source_id = '65700000-0000-0000-0000-000000000101'
    and status = 'sent';
  outcome := public.transition_reminder_delivery(
    '65700000-0000-0000-0000-000000000001',
    reminder_id,
    'operational',
    'failed',
    '2099-01-02T09:00:00Z'::timestamptz,
    null,
    'sent',
    '2099-01-02T09:00:00Z'::timestamptz,
    '2099-01-02T09:01:00Z'::timestamptz
  );
  if outcome->>'type' <> 'invalid-transition' then
    raise exception 'Untrusted operational context was accepted: %', outcome;
  end if;
end
$$;

select set_config('request.jwt.claims', '', false);
select set_config(
  'request.jwt.claim.sub',
  '65700000-0000-0000-0000-000000000002',
  false
);
set local role authenticated;

do $$
declare
  outcome jsonb;
begin
  outcome := public.transition_reminder_delivery(
    '65700000-0000-0000-0000-000000000001',
    (
      select id from public.reminders
      where source_type = 'task'
        and source_id = '65700000-0000-0000-0000-000000000101'
        and status = 'sent'
    ),
    'user',
    'sent',
    null,
    '2099-01-02T09:01:00Z'::timestamptz,
    'pending',
    '2099-01-02T09:00:00Z'::timestamptz,
    '2099-01-02T09:01:00Z'::timestamptz
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'Cross-user Reminder Delivery access was disclosed: %', outcome;
  end if;
end
$$;

rollback;
