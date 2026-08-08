-- Shared Task Commands keep explicit Task state intent at one routing boundary.
-- Ordinary tasks use an idempotent row transaction; linked occurrences still
-- delegate to the recurring lifecycle transaction below.

alter table public.recurring_task_idempotency
  add column if not exists task_command_task_id uuid,
  add column if not exists task_command_operation text;

create or replace function public.task_command_atomic(
  p_operation text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_requested_user_id uuid := nullif(p_request->>'userId', '')::uuid;
  v_authenticated_user_id uuid := auth.uid();
  v_user_id uuid;
  v_task_id uuid := nullif(p_request->>'taskId', '')::uuid;
  v_task public.tasks%rowtype;
  v_operation_key text := nullif(p_request->>'idempotencyKey', '');
  v_fingerprint text;
  v_existing_idempotency public.recurring_task_idempotency%rowtype;
  v_outcome jsonb;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    v_user_id := coalesce(v_requested_user_id, v_authenticated_user_id);
  else
    if v_authenticated_user_id is null
       or v_requested_user_id is distinct from v_authenticated_user_id then
      return jsonb_build_object('status', 'not-found', 'type', 'not-found');
    end if;
    v_user_id := v_authenticated_user_id;
  end if;
  if v_user_id is null then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;
  if v_operation_key is null then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Task Command operation ID is required'
    );
  end if;
  if p_operation not in ('complete', 'reopen', 'skip') then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Unsupported Task Command'
    );
  end if;
  if p_request ? 'scope'
     and p_request->>'scope' is distinct from 'this' then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Task Commands only support the this scope for occurrence state'
    );
  end if;

  v_fingerprint := md5(
    jsonb_build_object(
      'operation', p_operation,
      'request', p_request - 'idempotencyKey' - 'operationKey'
    )::text
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || v_operation_key, 0)
  );
  select * into v_existing_idempotency
  from public.recurring_task_idempotency as record
  where record.user_id = v_user_id
    and record.operation_key = v_operation_key
  for update;
  if found then
    if v_existing_idempotency.fingerprint <> v_fingerprint then
      return jsonb_build_object(
        'status', 'conflict',
        'type', 'conflict',
        'reason', 'Idempotency key was reused for a different request'
      );
    end if;
    return jsonb_set(
      jsonb_set(
        v_existing_idempotency.outcome,
        '{status}',
        '"already-applied"'::jsonb
      ),
      '{type}',
      '"already-applied"'::jsonb
    );
  end if;

  select * into v_task
  from public.tasks
  where id = v_task_id
    and user_id = v_user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;
  if v_task.recurring_series_id is not null
     or v_task.recurring_occurrence_id is not null then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Linked Task Occurrences require the recurring lifecycle'
    );
  end if;

  if p_operation = 'complete' then
    if v_task.is_completed then
      v_outcome := jsonb_build_object(
        'status', 'already-applied',
        'type', 'already-applied',
        'task', to_jsonb(v_task)
      );
    else
      update public.tasks
      set is_completed = true,
          status = 'done',
          completed_at = coalesce(completed_at, now()),
          updated_at = now()
      where id = v_task.id
        and user_id = v_user_id
      returning * into v_task;
      v_outcome := jsonb_build_object(
        'status', 'complete',
        'type', 'complete',
        'task', to_jsonb(v_task)
      );
    end if;
  elsif p_operation = 'reopen' then
    if not v_task.is_completed then
      v_outcome := jsonb_build_object(
        'status', 'already-applied',
        'type', 'already-applied',
        'task', to_jsonb(v_task)
      );
    else
      update public.tasks
      set is_completed = false,
          status = 'todo',
          completed_at = null,
          updated_at = now()
      where id = v_task.id
        and user_id = v_user_id
      returning * into v_task;
      v_outcome := jsonb_build_object(
        'status', 'complete',
        'type', 'complete',
        'task', to_jsonb(v_task)
      );
    end if;
  else
    delete from public.tasks
    where id = v_task.id
      and user_id = v_user_id;
    v_outcome := jsonb_build_object(
      'status', 'complete',
      'type', 'complete'
    );
  end if;

  insert into public.recurring_task_idempotency(
    user_id, operation_key, fingerprint, series_id, outcome,
    task_command_task_id, task_command_operation
  ) values (
    v_user_id, v_operation_key, v_fingerprint, null, v_outcome,
    v_task.id, p_operation
  );
  return v_outcome;
end;
$function$;

-- A destructive command can remove the visible Task before its caller retries.
-- Replay uses the command metadata recorded with the original idempotency row,
-- so a missing projection cannot turn a successful skip into a false 404.
create or replace function public.task_command_replay(
  p_operation text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_requested_user_id uuid := nullif(p_request->>'userId', '')::uuid;
  v_authenticated_user_id uuid := auth.uid();
  v_user_id uuid;
  v_task_id uuid := nullif(p_request->>'taskId', '')::uuid;
  v_operation_key text := nullif(p_request->>'idempotencyKey', '');
  v_existing_idempotency public.recurring_task_idempotency%rowtype;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    v_user_id := coalesce(v_requested_user_id, v_authenticated_user_id);
  else
    if v_authenticated_user_id is null
       or v_requested_user_id is distinct from v_authenticated_user_id then
      return jsonb_build_object('status', 'not-found', 'type', 'not-found');
    end if;
    v_user_id := v_authenticated_user_id;
  end if;
  if v_user_id is null then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;
  if v_operation_key is null then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Task Command operation ID is required'
    );
  end if;
  if p_operation not in ('complete', 'reopen', 'skip') then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Unsupported Task Command'
    );
  end if;
  if p_request ? 'scope'
     and p_request->>'scope' is distinct from 'this' then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Task Commands only support the this scope for occurrence state'
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || v_operation_key, 0)
  );
  select * into v_existing_idempotency
  from public.recurring_task_idempotency as record
  where record.user_id = v_user_id
    and record.operation_key = v_operation_key
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;
  if v_existing_idempotency.task_command_task_id is distinct from v_task_id
     or v_existing_idempotency.task_command_operation is distinct from p_operation then
    return jsonb_build_object(
      'status', 'conflict',
      'type', 'conflict',
      'reason', 'Idempotency key was reused for a different request'
    );
  end if;
  return jsonb_set(
    jsonb_set(
      v_existing_idempotency.outcome,
      '{status}',
      '"already-applied"'::jsonb
    ),
    '{type}',
    '"already-applied"'::jsonb
  );
end;
$function$;

-- The visible Task projection is only a routing hint. The lifecycle transaction
-- rechecks every fact that can affect occurrence state before applying a write.
create or replace function public.recurring_task_occurrence_command_checked(
  p_operation text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_requested_user_id uuid := nullif(p_request->>'userId', '')::uuid;
  v_authenticated_user_id uuid := auth.uid();
  v_user_id uuid;
  v_series_id uuid := nullif(p_request->>'seriesId', '')::uuid;
  v_occurrence_id uuid := nullif(p_request->>'occurrenceId', '')::uuid;
  v_task_id uuid := nullif(p_request->>'taskId', '')::uuid;
  v_expected_revision_id uuid := nullif(p_request->>'expectedRevisionId', '')::uuid;
  v_series public.recurring_task_series%rowtype;
  v_occurrence public.recurring_task_occurrences%rowtype;
  v_task public.tasks%rowtype;
  v_operation_key text;
  v_fingerprint text;
  v_existing_idempotency public.recurring_task_idempotency%rowtype;
  v_outcome jsonb;
begin
  -- Legacy lifecycle callers do not carry a visible Task identity yet. Keep
  -- their compatibility path while shared Task Commands use this checked path.
  if not (
    p_request ? 'taskId'
    or p_request ? 'scope'
    or p_request ? 'scheduledDate'
    or p_request ? 'expectedRevisionId'
  ) then
    return public.recurring_task_occurrence_command_atomic(p_operation, p_request);
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    v_user_id := coalesce(v_requested_user_id, v_authenticated_user_id);
  else
    if v_authenticated_user_id is null
       or v_requested_user_id is distinct from v_authenticated_user_id then
      return jsonb_build_object('status', 'not-found', 'type', 'not-found');
    end if;
    v_user_id := v_authenticated_user_id;
  end if;
  if v_user_id is null then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  select * into v_series
  from public.recurring_task_series as series
  where series.id = v_series_id
    and series.user_id = v_user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  v_operation_key := coalesce(
    nullif(p_request->>'idempotencyKey', ''),
    nullif(p_request->>'operationKey', '')
  );
  v_fingerprint := md5(
    jsonb_build_object(
      'operation', p_operation,
      'request', p_request - 'idempotencyKey' - 'operationKey'
    )::text
  );
  if v_operation_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || v_operation_key, 0)
    );
    select * into v_existing_idempotency
    from public.recurring_task_idempotency as record
    where record.user_id = v_user_id
      and record.operation_key = v_operation_key
    for update;
    if found then
      if v_existing_idempotency.fingerprint <> v_fingerprint then
        return jsonb_build_object(
          'status', 'conflict',
          'type', 'conflict',
          'reason', 'Idempotency key was reused for a different request'
        );
      end if;
      return jsonb_set(
        jsonb_set(
          v_existing_idempotency.outcome,
          '{status}',
          '"already-applied"'::jsonb
        ),
        '{type}',
        '"already-applied"'::jsonb
      );
    end if;
  end if;

  if p_request ? 'scope'
     and p_request->>'scope' is distinct from 'this' then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Task Occurrence state commands only support the this scope'
    );
  end if;
  if not (p_request ? 'taskId') then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  select * into v_occurrence
  from public.recurring_task_occurrences as occurrence
  where occurrence.id = v_occurrence_id
    and occurrence.series_id = v_series_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;
  select * into v_task
  from public.tasks as task
  where task.id = v_task_id
    and task.user_id = v_user_id
  for update;
  if not found or v_occurrence.task_id is distinct from v_task.id then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;
  if v_task.recurring_series_id is distinct from v_series_id
     or v_task.recurring_occurrence_id is distinct from v_occurrence_id then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;
  if p_request ? 'scheduledDate'
     and v_occurrence.scheduled_date is distinct from
         (p_request->>'scheduledDate')::date then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;
  if p_request ? 'expectedRevisionId'
     and v_occurrence.revision_id is distinct from v_expected_revision_id then
    return jsonb_build_object(
      'status', 'conflict',
      'type', 'conflict',
      'reason', 'Task occurrence revision changed concurrently'
    );
  end if;

  v_outcome := public.recurring_task_occurrence_command_atomic(p_operation, p_request);
  if v_operation_key is not null
     and v_outcome->>'status' in ('complete', 'already-applied') then
    insert into public.recurring_task_idempotency(
      user_id, operation_key, fingerprint, series_id, outcome,
      task_command_task_id, task_command_operation
    ) values (
      v_user_id,
      v_operation_key,
      v_fingerprint,
      v_series_id,
      v_outcome,
      v_task_id,
      case p_operation
        when 'complete-occurrence' then 'complete'
        when 'reopen-occurrence' then 'reopen'
        when 'skip-occurrence' then 'skip'
      end
    )
    on conflict (user_id, operation_key) do update
      set task_command_task_id = excluded.task_command_task_id,
          task_command_operation = excluded.task_command_operation;
  end if;
  return v_outcome;
end;
$function$;

create or replace function public.recurring_task_lifecycle(
  p_operation text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_operation in (
    'skip-occurrence',
    'complete-occurrence',
    'reopen-occurrence'
  ) then
    return public.recurring_task_occurrence_command_checked(p_operation, p_request);
  end if;
  if p_operation = 'edit-occurrence' then
    return public.recurring_task_edit_occurrence_atomic(p_request);
  end if;
  return public.recurring_task_lifecycle_with_observability(p_operation, p_request);
end;
$function$;

revoke all on function public.task_command_atomic(text, jsonb)
  from public, anon;
grant execute on function public.task_command_atomic(text, jsonb)
  to authenticated, service_role;
revoke all on function public.task_command_replay(text, jsonb)
  from public, anon;
grant execute on function public.task_command_replay(text, jsonb)
  to authenticated, service_role;
revoke all on function public.recurring_task_occurrence_command_checked(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.recurring_task_lifecycle(text, jsonb)
  from public, anon;
grant execute on function public.recurring_task_lifecycle(text, jsonb)
  to authenticated, service_role;
