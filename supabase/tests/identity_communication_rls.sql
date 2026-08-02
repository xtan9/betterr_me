-- ralph-ci: true
-- Proves the identity and communication RLS contract through real PostgreSQL.
-- The fixture uses disposable auth identities, exercises authenticated owner and
-- non-owner contexts plus anonymous denial, and rolls every row back.
-- The setup helper removes the trigger-created owner profile once so the owner
-- INSERT fallback policy is exercised explicitly.
-- Direct table checks intentionally retain the runner's constrained
-- `ralph_ci_test` database role: it has table grants but cannot bypass RLS.
-- `request.jwt.claims` supplies the application identity for auth.uid() and
-- auth.role(); SET LOCAL ROLE is also used for the production-granted profile,
-- reminder, and anonymous database-role checks.
begin;

select public.ralph_ci_create_auth_user(
  '57700000-0000-0000-0000-000000000001',
  'identity-owner@example.test'
);
select public.ralph_ci_create_auth_user(
  '57700000-0000-0000-0000-000000000002',
  'identity-other@example.test'
);
select public.ralph_ci_delete_auth_profile(
  '57700000-0000-0000-0000-000000000001'
);

-- Seed all communication records as the owning user. The second conversation,
-- message, memory, push subscription, reminder, and reminder default are
-- reserved for owner-delete checks.
select set_config(
  'request.jwt.claims',
  '{"sub":"57700000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  affected_rows bigint;
begin
  insert into public.profiles (id, email, full_name)
  values (
    '57700000-0000-0000-0000-000000000001',
    'identity-owner@example.test',
    'Owner profile created'
  );
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner profile insert changed % rows', affected_rows;
  end if;
end
$$;

insert into public.conversations (id, user_id, title, model)
values
  (
    '57700000-0000-0000-0000-000000000010',
    '57700000-0000-0000-0000-000000000001',
    'Owner conversation',
    'gpt-5.4-mini'
  ),
  (
    '57700000-0000-0000-0000-000000000011',
    '57700000-0000-0000-0000-000000000001',
    'Conversation to delete',
    'gpt-5.4-mini'
  );

insert into public.chat_messages (id, conversation_id, role, content)
values
  (
    '57700000-0000-0000-0000-000000000020',
    '57700000-0000-0000-0000-000000000010',
    'user',
    'Owner message'
  ),
  (
    '57700000-0000-0000-0000-000000000021',
    '57700000-0000-0000-0000-000000000010',
    'assistant',
    'Message to delete'
  );

insert into public.chat_memories (id, user_id, path, content)
values (
  '57700000-0000-0000-0000-000000000030',
  '57700000-0000-0000-0000-000000000001',
  'identity.md',
  'Owner memory'
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
  '57700000-0000-0000-0000-000000000040',
  '57700000-0000-0000-0000-000000000001',
  'https://example.test/push/577/protected',
  'owner-p256dh',
  'owner-auth',
  'owner-agent'
);

-- Habit reminders are source-owned and therefore must reference an existing
-- Habit. These disposable sources keep this communication fixture valid under
-- the tenant-scoped Habit reminder foreign key.
insert into public.habits (
  id,
  user_id,
  name,
  frequency,
  status
)
values
  (
    '57700000-0000-0000-0000-000000000071',
    '57700000-0000-0000-0000-000000000001',
    'Owner habit reminder source',
    '{"type":"daily"}'::jsonb,
    'active'
  ),
  (
    '57700000-0000-0000-0000-000000000073',
    '57700000-0000-0000-0000-000000000001',
    'Anonymous habit reminder source',
    '{"type":"daily"}'::jsonb,
    'active'
  );

set local role authenticated;
do $habit_reminder_seed$
declare
  outcome jsonb;
  push_reminder_id uuid;
  email_reminder_id uuid;
begin
  outcome := public.configure_habit_reminders(
    '57700000-0000-0000-0000-000000000001',
    '57700000-0000-0000-0000-000000000071',
    '[
      {
        "reminder_type": "absolute",
        "relative_minutes": null,
        "absolute_time": "2026-08-05T09:00:00Z",
        "channels": ["push"]
      },
      {
        "reminder_type": "absolute",
        "relative_minutes": null,
        "absolute_time": "2026-08-06T09:00:00Z",
        "channels": ["email"]
      }
    ]'::jsonb,
    null
  );

  select (reminder->>'id')::uuid
  into push_reminder_id
  from jsonb_array_elements(outcome->'reminders') as reminder
  where reminder->>'source_type' = 'habit'
    and (reminder->>'source_id')::uuid
      = '57700000-0000-0000-0000-000000000071'::uuid
    and reminder->'channels' = '["push"]'::jsonb
    and (reminder->>'fire_at')::timestamptz
      = timestamptz '2026-08-05 09:00:00+00'
    and reminder->>'status' = 'pending';
  select (reminder->>'id')::uuid
  into email_reminder_id
  from jsonb_array_elements(outcome->'reminders') as reminder
  where reminder->>'source_type' = 'habit'
    and (reminder->>'source_id')::uuid
      = '57700000-0000-0000-0000-000000000071'::uuid
    and reminder->'channels' = '["email"]'::jsonb
    and (reminder->>'fire_at')::timestamptz
      = timestamptz '2026-08-06 09:00:00+00'
    and reminder->>'status' = 'pending';

  if outcome->>'type' is distinct from 'configured'
     or jsonb_array_length(outcome->'reminders') <> 2
     or push_reminder_id is null
     or email_reminder_id is null then
    raise exception 'identity Habit reminder seed outcome was incorrect: %', outcome;
  end if;

  perform set_config(
    'ralph.identity_owner_push_reminder_id',
    push_reminder_id::text,
    false
  );
  perform set_config(
    'ralph.identity_owner_email_reminder_id',
    email_reminder_id::text,
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
values
  (
    '57700000-0000-0000-0000-000000000060',
    '57700000-0000-0000-0000-000000000001',
    'task',
    15,
    array['push']
  ),
  (
    '57700000-0000-0000-0000-000000000061',
    '57700000-0000-0000-0000-000000000001',
    'habit',
    30,
    array['email']
  );

-- Owner reads and writes the supported profile/settings surfaces. The
-- constrained runner role supplies the table grant while JWT claims still
-- exercise the production RLS predicate.
do $$
declare
  affected_rows bigint;
begin
  if (
    select count(*)
    from public.profiles
    where id = '57700000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'owner cannot read the owner profile';
  end if;

  update public.profiles
  set full_name = 'Owner profile updated'
  where id = '57700000-0000-0000-0000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner profile update changed % rows', affected_rows;
  end if;
end
$$;

reset role;
set local role authenticated;
do $$
declare
  appearance_result jsonb;
  notification_result jsonb;
begin
  appearance_result := public.set_appearance_preference('dark');
  notification_result := public.set_notification_preference(
    '{"type":"setReminderEmail","enabled":true}'::jsonb
  );
  if appearance_result->>'theme' is distinct from 'dark'
    or notification_result->'reminderEmail'->>'enabled' is distinct from 'true' then
    raise exception 'owner settings command returned the wrong outcome: % / %',
      appearance_result, notification_result;
  end if;
end
$$;
reset role;

-- Owner reads and updates conversations, messages, memories, push data, and
-- notification records.
do $$
declare
  affected_rows bigint;
begin
  if (
    select count(*)
    from public.conversations
    where id in (
      '57700000-0000-0000-0000-000000000010',
      '57700000-0000-0000-0000-000000000011'
    )
  ) <> 2 then
    raise exception 'owner cannot read both owner conversations';
  end if;

  update public.conversations
  set title = 'Owner conversation updated'
  where id = '57700000-0000-0000-0000-000000000010';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner conversation update changed % rows', affected_rows;
  end if;

  if (
    select count(*)
    from public.chat_messages
    where conversation_id = '57700000-0000-0000-0000-000000000010'
  ) <> 2 then
    raise exception 'owner cannot read both owner messages';
  end if;

  update public.chat_messages
  set content = 'Owner message updated'
  where id = '57700000-0000-0000-0000-000000000020';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner message update changed % rows', affected_rows;
  end if;

  delete from public.chat_messages
  where id = '57700000-0000-0000-0000-000000000021';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner message delete changed % rows', affected_rows;
  end if;

  if (
    select count(*)
    from public.chat_memories
    where user_id = '57700000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'owner cannot read the owner memory';
  end if;

  update public.chat_memories
  set path = 'identity-updated.md', content = 'Owner memory updated'
  where id = '57700000-0000-0000-0000-000000000030';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner memory update changed % rows', affected_rows;
  end if;

  if (
    select count(*)
    from public.push_subscriptions
    where user_id = '57700000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'owner cannot read the owner push subscription';
  end if;

  update public.push_subscriptions
  set user_agent = 'owner-agent-updated'
  where id = '57700000-0000-0000-0000-000000000040';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner push update changed % rows', affected_rows;
  end if;

  if (
    select count(*)
    from public.reminder_defaults
    where user_id = '57700000-0000-0000-0000-000000000001'
  ) <> 2 then
    raise exception 'owner cannot read both owner reminder defaults';
  end if;

  update public.reminder_defaults
  set relative_minutes = 45
  where id = '57700000-0000-0000-0000-000000000060';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner reminder default update changed % rows', affected_rows;
  end if;

  delete from public.reminder_defaults
  where id = '57700000-0000-0000-0000-000000000061';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner reminder default delete changed % rows', affected_rows;
  end if;
end
$$;

set local role authenticated;
do $$
declare
  affected_rows bigint;
  configuration jsonb;
  delivery_outcome jsonb;
begin
  if (
    select count(*)
    from public.reminders
    where user_id = '57700000-0000-0000-0000-000000000001'
  ) <> 2 then
    raise exception 'owner cannot read both owner reminders';
  end if;

  delivery_outcome := public.transition_reminder_delivery(
    '57700000-0000-0000-0000-000000000001',
    current_setting('ralph.identity_owner_push_reminder_id')::uuid,
    'user',
    'sent',
    '2026-08-05T09:00:00Z',
    '2026-08-05T09:00:01Z',
    'pending',
    '2026-08-05T09:00:00Z',
    null
  );
  if delivery_outcome->>'type' <> 'transitioned'
    or delivery_outcome->'reminder'->>'status' <> 'sent' then
    raise exception 'owner Reminder Delivery transition was incorrect: %', delivery_outcome;
  end if;

  configuration := public.configure_habit_reminders(
    '57700000-0000-0000-0000-000000000001',
    '57700000-0000-0000-0000-000000000071',
    '[]'::jsonb,
    null
  );
  if configuration->>'type' <> 'removed' then
    raise exception 'owner Habit Reminder Configuration removal was incorrect: %', configuration;
  end if;
end
$$;
reset role;

-- Chat rate limiting is a write-only RPC over an RLS-protected table. Its
-- caller binding is part of the communication identity boundary.
set local role authenticated;
do $$
declare
  rate_limit_row record;
begin
  if not has_function_privilege(
    'authenticated',
    'public.check_ai_chat_rate_limit(uuid)',
    'execute'
  ) then
    raise exception 'authenticated role cannot execute the chat rate-limit RPC';
  end if;
  if has_function_privilege(
    'anon',
    'public.check_ai_chat_rate_limit(uuid)',
    'execute'
  ) then
    raise exception 'anonymous role can execute the chat rate-limit RPC';
  end if;

  select *
  into rate_limit_row
  from public.check_ai_chat_rate_limit(
    '57700000-0000-0000-0000-000000000001'
  );
  if rate_limit_row.allowed is not true
    or rate_limit_row.minute_remaining is distinct from 9
    or rate_limit_row.day_remaining is distinct from 99 then
    raise exception 'owner chat rate-limit request was unexpectedly denied';
  end if;
end
$$;
reset role;

-- A second authenticated user cannot read, mutate, or create rows owned by the
-- first user. UPDATE and DELETE may return zero rows under RLS, so both that
-- result and an authorization error count as denial; INSERT must raise 42501.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"57700000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

set local role authenticated;
do $$
declare
  affected_rows bigint;
  operation_sqlstate text;
begin
  if (
    select count(*)
    from public.profiles
    where id = '57700000-0000-0000-0000-000000000001'
  ) <> 0 then
    raise exception 'non-owner can read the owner profile';
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.profiles
    set full_name = 'Cross-user profile mutation'
    where id = '57700000-0000-0000-0000-000000000001';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner profile update changed % rows', affected_rows;
  end if;

  operation_sqlstate := null;
  begin
    insert into public.profiles (id, email, full_name)
    values (
      '57700000-0000-0000-0000-000000000001',
      'cross-user-profile@example.test',
      'Cross-user profile'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'non-owner profile insert was not RLS-denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;
end
$$;

reset role;

set local role authenticated;
do $$
declare
  operation_sqlstate text;
begin
  operation_sqlstate := null;
  begin
    perform public.check_ai_chat_rate_limit(
      '57700000-0000-0000-0000-000000000001'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'non-owner chat rate-limit request was not denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;
end
$$;
reset role;

do $$
declare
  affected_rows bigint;
  operation_sqlstate text;
begin
  if (
    select count(*)
    from public.conversations
    where id = '57700000-0000-0000-0000-000000000010'
  ) <> 0 then
    raise exception 'non-owner can read the owner conversation';
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.conversations
    set title = 'Cross-user conversation mutation'
    where id = '57700000-0000-0000-0000-000000000010';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner conversation update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.conversations
    where id = '57700000-0000-0000-0000-000000000011';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner conversation delete changed % rows', affected_rows;
  end if;

  operation_sqlstate := null;
  begin
    insert into public.conversations (id, user_id, title, model)
    values (
      '57700000-0000-0000-0000-000000000012',
      '57700000-0000-0000-0000-000000000001',
      'Cross-user conversation',
      'gpt-5.4-mini'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'non-owner conversation insert was not RLS-denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;
end
$$;

do $$
declare
  affected_rows bigint;
  operation_sqlstate text;
begin
  if (
    select count(*)
    from public.chat_messages
    where id = '57700000-0000-0000-0000-000000000020'
  ) <> 0 then
    raise exception 'non-owner can read the owner message';
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.chat_messages
    set content = 'Cross-user message mutation'
    where id = '57700000-0000-0000-0000-000000000020';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner message update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.chat_messages
    where id = '57700000-0000-0000-0000-000000000020';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner message delete changed % rows', affected_rows;
  end if;

  operation_sqlstate := null;
  begin
    insert into public.chat_messages (id, conversation_id, role, content)
    values (
      '57700000-0000-0000-0000-000000000022',
      '57700000-0000-0000-0000-000000000010',
      'user',
      'Cross-user message'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'non-owner message insert was not RLS-denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;
end
$$;

do $$
declare
  affected_rows bigint;
  operation_sqlstate text;
begin
  if (
    select count(*)
    from public.chat_memories
    where id = '57700000-0000-0000-0000-000000000030'
  ) <> 0 then
    raise exception 'non-owner can read the owner memory';
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.chat_memories
    set content = 'Cross-user memory mutation'
    where id = '57700000-0000-0000-0000-000000000030';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner memory update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.chat_memories
    where id = '57700000-0000-0000-0000-000000000030';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner memory delete changed % rows', affected_rows;
  end if;

  operation_sqlstate := null;
  begin
    insert into public.chat_memories (id, user_id, path, content)
    values (
      '57700000-0000-0000-0000-000000000032',
      '57700000-0000-0000-0000-000000000001',
      'cross-user.md',
      'Cross-user memory'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'non-owner memory insert was not RLS-denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;
end
$$;

do $$
declare
  affected_rows bigint;
  operation_sqlstate text;
begin
  if (
    select count(*)
    from public.push_subscriptions
    where id = '57700000-0000-0000-0000-000000000040'
  ) <> 0 then
    raise exception 'non-owner can read the owner push subscription';
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.push_subscriptions
    set user_agent = 'Cross-user push mutation'
    where id = '57700000-0000-0000-0000-000000000040';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner push update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.push_subscriptions
    where id = '57700000-0000-0000-0000-000000000040';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner push delete changed % rows', affected_rows;
  end if;

  operation_sqlstate := null;
  begin
    insert into public.push_subscriptions (
      id,
      user_id,
      endpoint,
      p256dh,
      auth,
      user_agent
    )
    values (
      '57700000-0000-0000-0000-000000000042',
      '57700000-0000-0000-0000-000000000001',
      'https://example.test/push/577/cross-user',
      'cross-user-p256dh',
      'cross-user-auth',
      'Cross-user push'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'non-owner push insert was not RLS-denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;
end
$$;

set local role authenticated;
do $$
declare
  affected_rows bigint;
  operation_sqlstate text;
begin
  if (
    select count(*)
    from public.reminders
    where id = current_setting('ralph.identity_owner_push_reminder_id')::uuid
  ) <> 0 then
    raise exception 'non-owner can read the owner reminder';
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.reminders
    set status = 'failed'
    where id = current_setting('ralph.identity_owner_push_reminder_id')::uuid;
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner reminder update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.reminders
    where id = current_setting('ralph.identity_owner_email_reminder_id')::uuid;
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner reminder delete changed % rows', affected_rows;
  end if;

  operation_sqlstate := null;
  begin
    insert into public.reminders (
      id,
      user_id,
      source_type,
      source_id,
      reminder_type,
      absolute_time,
      channels,
      status,
      fire_at
    ) values (
      '57700000-0000-0000-0000-000000000052',
      '57700000-0000-0000-0000-000000000001',
      'habit',
      '57700000-0000-0000-0000-000000000073',
      'absolute',
      '2026-08-07 09:00:00+00',
      array['push'],
      'pending',
      '2026-08-07 09:00:00+00'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'non-owner reminder insert was not RLS-denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;
end
$$;
reset role;

do $$
declare
  affected_rows bigint;
  operation_sqlstate text;
begin
  if (
    select count(*)
    from public.reminder_defaults
    where id = '57700000-0000-0000-0000-000000000060'
  ) <> 0 then
    raise exception 'non-owner can read the owner reminder default';
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.reminder_defaults
    set relative_minutes = 60
    where id = '57700000-0000-0000-0000-000000000060';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner reminder default update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.reminder_defaults
    where id = '57700000-0000-0000-0000-000000000061';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'non-owner reminder default delete changed % rows', affected_rows;
  end if;

  operation_sqlstate := null;
  begin
    insert into public.reminder_defaults (
      id,
      user_id,
      source_type,
      relative_minutes,
      channels
    ) values (
      '57700000-0000-0000-0000-000000000062',
      '57700000-0000-0000-0000-000000000001',
      'habit',
      20,
      array['push']
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'non-owner reminder default insert was not RLS-denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;
end
$$;

-- Every denied non-owner write is followed by an owner-context persistence
-- check. This catches policies that return a misleading success with changed
-- state, as well as assertion blocks that catch their own failure.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"57700000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  if (
    select full_name from public.profiles
    where id = '57700000-0000-0000-0000-000000000001'
  ) is distinct from 'Owner profile updated'
  or (
    select preferences->>'theme' from public.profiles
    where id = '57700000-0000-0000-0000-000000000001'
  ) is distinct from 'dark'
  or (
    select preferences->>'email_notifications_enabled' from public.profiles
    where id = '57700000-0000-0000-0000-000000000001'
  ) is distinct from 'true' then
    raise exception 'non-owner changed the owner profile or settings';
  end if;

  if (
    select title from public.conversations
    where id = '57700000-0000-0000-0000-000000000010'
  ) is distinct from 'Owner conversation updated'
  or not exists (
    select 1 from public.conversations
    where id = '57700000-0000-0000-0000-000000000011'
  )
  or exists (
    select 1 from public.conversations
    where id = '57700000-0000-0000-0000-000000000012'
  ) then
    raise exception 'non-owner changed or created a conversation';
  end if;

  if (
    select content from public.chat_messages
    where id = '57700000-0000-0000-0000-000000000020'
  ) is distinct from 'Owner message updated'
  or exists (
    select 1 from public.chat_messages
    where id = '57700000-0000-0000-0000-000000000022'
  ) then
    raise exception 'non-owner changed or created a chat message';
  end if;

  if (
    select path from public.chat_memories
    where id = '57700000-0000-0000-0000-000000000030'
  ) is distinct from 'identity-updated.md'
  or (
    select content from public.chat_memories
    where id = '57700000-0000-0000-0000-000000000030'
  ) is distinct from 'Owner memory updated'
  or exists (
    select 1 from public.chat_memories
    where id = '57700000-0000-0000-0000-000000000032'
  ) then
    raise exception 'non-owner changed or created a chat memory';
  end if;

  if (
    select user_agent from public.push_subscriptions
    where id = '57700000-0000-0000-0000-000000000040'
  ) is distinct from 'owner-agent-updated'
  or exists (
    select 1 from public.push_subscriptions
    where id = '57700000-0000-0000-0000-000000000042'
  ) then
    raise exception 'non-owner changed or created a push subscription';
  end if;

  if (
    select status from public.reminders
    where id = current_setting('ralph.identity_owner_push_reminder_id')::uuid
  ) is distinct from 'sent'
  or exists (
    select 1 from public.reminders
    where id in (
      current_setting('ralph.identity_owner_email_reminder_id')::uuid,
      '57700000-0000-0000-0000-000000000052'
    )
  ) then
    raise exception 'non-owner changed or created a reminder';
  end if;

  if (
    select relative_minutes from public.reminder_defaults
    where id = '57700000-0000-0000-0000-000000000060'
  ) is distinct from 45
  or exists (
    select 1 from public.reminder_defaults
    where id in (
      '57700000-0000-0000-0000-000000000061',
      '57700000-0000-0000-0000-000000000062'
    )
  ) then
    raise exception 'non-owner changed or created a reminder default';
  end if;
end
$$;

set local role authenticated;
do $$
declare
  rate_limit_row record;
begin
  select *
  into rate_limit_row
  from public.check_ai_chat_rate_limit(
    '57700000-0000-0000-0000-000000000001'
  );
  if rate_limit_row.allowed is not true
    or rate_limit_row.minute_remaining is distinct from 8
    or rate_limit_row.day_remaining is distinct from 98 then
    raise exception 'denied chat rate-limit calls changed the owner quota';
  end if;
end
$$;
reset role;

-- Anonymous callers have no table or RPC access. Assert that every supported
-- read and write is denied, then re-check the owner state below.
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare
  visible_rows bigint;
  operation_sqlstate text;
begin
  visible_rows := -1;
  operation_sqlstate := null;
  begin
    select count(*) into visible_rows from public.profiles
    where id = '57700000-0000-0000-0000-000000000001';
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and visible_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous caller can read the owner profile';
  end if;

  visible_rows := -1;
  operation_sqlstate := null;
  begin
    select count(*) into visible_rows from public.conversations
    where id = '57700000-0000-0000-0000-000000000010';
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and visible_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous caller can read the owner conversation';
  end if;

  visible_rows := -1;
  operation_sqlstate := null;
  begin
    select count(*) into visible_rows from public.chat_messages
    where id = '57700000-0000-0000-0000-000000000020';
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and visible_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous caller can read the owner message';
  end if;

  visible_rows := -1;
  operation_sqlstate := null;
  begin
    select count(*) into visible_rows from public.chat_memories
    where id = '57700000-0000-0000-0000-000000000030';
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and visible_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous caller can read the owner memory';
  end if;

  visible_rows := -1;
  operation_sqlstate := null;
  begin
    select count(*) into visible_rows from public.push_subscriptions
    where id = '57700000-0000-0000-0000-000000000040';
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and visible_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous caller can read the owner push subscription';
  end if;

  visible_rows := -1;
  operation_sqlstate := null;
  begin
    select count(*) into visible_rows from public.reminders
    where id = current_setting('ralph.identity_owner_push_reminder_id')::uuid;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and visible_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous caller can read the owner reminder';
  end if;

  visible_rows := -1;
  operation_sqlstate := null;
  begin
    select count(*) into visible_rows from public.reminder_defaults
    where id = '57700000-0000-0000-0000-000000000060';
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and visible_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous caller can read the owner reminder default';
  end if;
end
$$;

do $$
declare
  affected_rows bigint;
  operation_sqlstate text;
begin
  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.profiles
    set full_name = 'Anonymous profile mutation'
    where id = '57700000-0000-0000-0000-000000000001';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous profile update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.conversations
    set title = 'Anonymous conversation mutation'
    where id = '57700000-0000-0000-0000-000000000010';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous conversation update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.conversations
    where id = '57700000-0000-0000-0000-000000000011';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous conversation delete changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.chat_messages
    set content = 'Anonymous message mutation'
    where id = '57700000-0000-0000-0000-000000000020';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous message update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.chat_messages
    where id = '57700000-0000-0000-0000-000000000020';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous message delete changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.chat_memories
    set content = 'Anonymous memory mutation'
    where id = '57700000-0000-0000-0000-000000000030';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous memory update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.chat_memories
    where id = '57700000-0000-0000-0000-000000000030';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous memory delete changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.push_subscriptions
    set user_agent = 'Anonymous push mutation'
    where id = '57700000-0000-0000-0000-000000000040';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous push update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.push_subscriptions
    where id = '57700000-0000-0000-0000-000000000040';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous push delete changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.reminders
    set status = 'failed'
    where id = current_setting('ralph.identity_owner_push_reminder_id')::uuid;
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous reminder update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.reminders
    where id = current_setting('ralph.identity_owner_push_reminder_id')::uuid;
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous reminder delete changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    update public.reminder_defaults
    set relative_minutes = 60
    where id = '57700000-0000-0000-0000-000000000060';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous reminder default update changed % rows', affected_rows;
  end if;

  affected_rows := -1;
  operation_sqlstate := null;
  begin
    delete from public.reminder_defaults
    where id = '57700000-0000-0000-0000-000000000060';
    get diagnostics affected_rows = row_count;
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if (operation_sqlstate is null and affected_rows <> 0)
    or (operation_sqlstate is not null and operation_sqlstate <> '42501') then
    raise exception 'anonymous reminder default delete changed % rows', affected_rows;
  end if;
end
$$;

do $$
declare
  operation_sqlstate text;
begin
  operation_sqlstate := null;
  begin
    insert into public.profiles (id, email, full_name)
    values (
      '57700000-0000-0000-0000-000000000001',
      'anonymous-profile@example.test',
      'Anonymous profile'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'anonymous profile insert was not denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;

  operation_sqlstate := null;
  begin
    insert into public.conversations (id, user_id, title, model)
    values (
      '57700000-0000-0000-0000-000000000013',
      '57700000-0000-0000-0000-000000000001',
      'Anonymous conversation',
      'gpt-5.4-mini'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'anonymous conversation insert was not denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;

  operation_sqlstate := null;
  begin
    insert into public.chat_messages (id, conversation_id, role, content)
    values (
      '57700000-0000-0000-0000-000000000023',
      '57700000-0000-0000-0000-000000000010',
      'user',
      'Anonymous message'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'anonymous message insert was not denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;

  operation_sqlstate := null;
  begin
    insert into public.chat_memories (id, user_id, path, content)
    values (
      '57700000-0000-0000-0000-000000000033',
      '57700000-0000-0000-0000-000000000001',
      'anonymous.md',
      'Anonymous memory'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'anonymous memory insert was not denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;

  operation_sqlstate := null;
  begin
    insert into public.push_subscriptions (
      id,
      user_id,
      endpoint,
      p256dh,
      auth
    )
    values (
      '57700000-0000-0000-0000-000000000043',
      '57700000-0000-0000-0000-000000000001',
      'https://example.test/push/577/anonymous',
      'anonymous-p256dh',
      'anonymous-auth'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'anonymous push insert was not denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;

  operation_sqlstate := null;
  begin
    insert into public.reminders (
      id,
      user_id,
      source_type,
      source_id,
      reminder_type,
      absolute_time,
      channels,
      status,
      fire_at
    ) values (
      '57700000-0000-0000-0000-000000000053',
      '57700000-0000-0000-0000-000000000001',
      'habit',
      '57700000-0000-0000-0000-000000000073',
      'absolute',
      '2026-08-08 09:00:00+00',
      array['push'],
      'pending',
      '2026-08-08 09:00:00+00'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'anonymous reminder insert was not denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;

  operation_sqlstate := null;
  begin
    insert into public.reminder_defaults (
      id,
      user_id,
      source_type,
      relative_minutes,
      channels
    ) values (
      '57700000-0000-0000-0000-000000000063',
      '57700000-0000-0000-0000-000000000001',
      'task',
      25,
      array['push']
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'anonymous reminder default insert was not denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;
end
$$;

reset role;

set local role anon;
do $$
declare
  operation_sqlstate text;
begin
  operation_sqlstate := null;
  begin
    perform public.check_ai_chat_rate_limit(
      '57700000-0000-0000-0000-000000000001'
    );
  exception when others then
    get stacked diagnostics operation_sqlstate = returned_sqlstate;
  end;
  if operation_sqlstate is distinct from '42501' then
    raise exception 'anonymous chat rate-limit request was not denied: %',
      coalesce(operation_sqlstate, 'no error');
  end if;
end
$$;
reset role;

-- The anonymous rate-limit attempt must not consume the owner's quota. A
-- follow-up owner call makes that persistence check observable through the
-- security-definer RPC and expects only its own increment.
select set_config(
  'request.jwt.claims',
  '{"sub":"57700000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
declare
  rate_limit_row record;
begin
  select *
  into rate_limit_row
  from public.check_ai_chat_rate_limit(
    '57700000-0000-0000-0000-000000000001'
  );
  if rate_limit_row.allowed is not true
    or rate_limit_row.minute_remaining is distinct from 7
    or rate_limit_row.day_remaining is distinct from 97 then
    raise exception 'anonymous chat rate-limit request changed the owner quota';
  end if;
end
$$;
reset role;

-- Anonymous denial must not have altered any owner-visible state.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"57700000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  affected_rows bigint;
begin
  if (
    select full_name from public.profiles
    where id = '57700000-0000-0000-0000-000000000001'
  ) is distinct from 'Owner profile updated'
  or (
    select preferences->>'email_notifications_enabled' from public.profiles
    where id = '57700000-0000-0000-0000-000000000001'
  ) is distinct from 'true'
  or (
    select title from public.conversations
    where id = '57700000-0000-0000-0000-000000000010'
  ) is distinct from 'Owner conversation updated'
  or (
    select content from public.chat_messages
    where id = '57700000-0000-0000-0000-000000000020'
  ) is distinct from 'Owner message updated'
  or (
    select content from public.chat_memories
    where id = '57700000-0000-0000-0000-000000000030'
  ) is distinct from 'Owner memory updated'
  or (
    select user_agent from public.push_subscriptions
    where id = '57700000-0000-0000-0000-000000000040'
  ) is distinct from 'owner-agent-updated'
  or (
    select status from public.reminders
    where id = current_setting('ralph.identity_owner_push_reminder_id')::uuid
  ) is distinct from 'sent'
  or (
    select relative_minutes from public.reminder_defaults
    where id = '57700000-0000-0000-0000-000000000060'
  ) is distinct from 45 then
    raise exception 'anonymous caller changed owner-visible state';
  end if;

  if exists (select 1 from public.conversations where id = '57700000-0000-0000-0000-000000000013')
    or exists (select 1 from public.chat_messages where id = '57700000-0000-0000-0000-000000000023')
    or exists (select 1 from public.chat_memories where id = '57700000-0000-0000-0000-000000000033')
    or exists (select 1 from public.push_subscriptions where id = '57700000-0000-0000-0000-000000000043')
    or exists (select 1 from public.reminders where id = '57700000-0000-0000-0000-000000000053')
    or exists (select 1 from public.reminder_defaults where id = '57700000-0000-0000-0000-000000000063') then
    raise exception 'anonymous caller created communication data';
  end if;

  delete from public.chat_memories
  where id = '57700000-0000-0000-0000-000000000030';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner memory delete changed % rows', affected_rows;
  end if;

  delete from public.push_subscriptions
  where id = '57700000-0000-0000-0000-000000000040';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner push delete changed % rows', affected_rows;
  end if;

  -- The Habit boundary removes pending intent but intentionally preserves the
  -- sent delivery history for retry/audit ownership.

  delete from public.reminder_defaults
  where id = '57700000-0000-0000-0000-000000000060';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner reminder default delete changed % rows', affected_rows;
  end if;

  delete from public.conversations
  where id = '57700000-0000-0000-0000-000000000011';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'owner conversation delete changed % rows', affected_rows;
  end if;

  if exists (select 1 from public.chat_memories where id = '57700000-0000-0000-0000-000000000030')
    or exists (select 1 from public.push_subscriptions where id = '57700000-0000-0000-0000-000000000040')
    or exists (select 1 from public.reminders where id = current_setting('ralph.identity_owner_email_reminder_id')::uuid)
    or exists (select 1 from public.reminder_defaults where id in (
      '57700000-0000-0000-0000-000000000060',
      '57700000-0000-0000-0000-000000000061'
    ))
    or exists (select 1 from public.conversations where id = '57700000-0000-0000-0000-000000000011') then
    raise exception 'owner deletes left communication data behind';
  end if;
end
$$;

rollback;
