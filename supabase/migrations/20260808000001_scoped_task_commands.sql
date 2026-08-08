-- Route every visible Task edit/delete scope through the shared Task Command
-- boundary. The visible Task is only a routing hint; this migration locks and
-- revalidates the authoritative Series, Occurrence, and Task rows before any
-- lifecycle function is allowed to mutate state.

alter function public.task_command_atomic(text, jsonb)
  rename to task_command_state_atomic;

create or replace function public.task_command_edit_atomic(
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
  v_updates jsonb := coalesce(p_request->'updates', '{}'::jsonb);
  v_operation_key text := coalesce(
    nullif(p_request->>'idempotencyKey', ''),
    nullif(p_request->>'operationKey', '')
  );
  v_fingerprint text;
  v_existing_idempotency public.recurring_task_idempotency%rowtype;
  v_outcome jsonb;
  v_completed boolean;
  v_has_completion boolean := false;
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
  if jsonb_typeof(v_updates) <> 'object' then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Task Command updates must be an object'
    );
  end if;
  if p_request ? 'scope'
     and p_request->>'scope' is distinct from 'this' then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Ordinary Task edits only support the this scope'
    );
  end if;

  v_fingerprint := md5(
    jsonb_build_object(
      'operation', 'edit',
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

  if v_updates ? 'status' then
    v_has_completion := true;
    v_completed := (v_updates->>'status') = 'done';
  elsif v_updates ? 'is_completed' then
    v_has_completion := true;
    v_completed := (v_updates->>'is_completed')::boolean;
  end if;

  update public.tasks
  set title = case when v_updates ? 'title' then v_updates->>'title' else title end,
      description = case
        when v_updates ? 'description' then v_updates->>'description'
        else description
      end,
      priority = case
        when v_updates ? 'priority' then (v_updates->>'priority')::integer
        else priority
      end,
      category_id = case
        when v_updates ? 'category_id' then (v_updates->>'category_id')::uuid
        else category_id
      end,
      due_date = case
        when v_updates ? 'due_date' then (v_updates->>'due_date')::date
        else due_date
      end,
      due_time = case
        when v_updates ? 'due_time' then (v_updates->>'due_time')::time
        else due_time
      end,
      completion_difficulty = case
        when v_updates ? 'completion_difficulty'
          then (v_updates->>'completion_difficulty')::integer
        else completion_difficulty
      end,
      status = case
        when v_updates ? 'status' then v_updates->>'status'
        when v_updates ? 'is_completed'
          then case when (v_updates->>'is_completed')::boolean then 'done' else 'todo' end
        else status
      end,
      is_completed = case
        when v_has_completion then v_completed
        else is_completed
      end,
      section = case when v_updates ? 'section' then v_updates->>'section' else section end,
      sort_order = case
        when v_updates ? 'sort_order' then (v_updates->>'sort_order')::double precision
        else sort_order
      end,
      project_id = case
        when v_updates ? 'project_id' then (v_updates->>'project_id')::uuid
        else project_id
      end,
      completed_at = case
        when v_has_completion and v_completed then coalesce(completed_at, now())
        when v_has_completion then null
        else completed_at
      end,
      updated_at = now()
  where id = v_task.id
    and user_id = v_user_id
  returning * into v_task;

  v_outcome := jsonb_build_object(
    'status', 'complete',
    'type', 'complete',
    'task', to_jsonb(v_task)
  );
  insert into public.recurring_task_idempotency(
    user_id, operation_key, fingerprint, series_id, outcome,
    task_command_task_id, task_command_operation
  ) values (
    v_user_id, v_operation_key, v_fingerprint, null, v_outcome,
    v_task.id, 'edit'
  );
  return v_outcome;
end;
$function$;

create or replace function public.task_command_atomic(
  p_operation text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_operation = 'edit' then
    return public.task_command_edit_atomic(p_request);
  end if;
  return public.task_command_state_atomic(p_operation, p_request);
end;
$function$;

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
  v_operation_key text := coalesce(
    nullif(p_request->>'idempotencyKey', ''),
    nullif(p_request->>'operationKey', '')
  );
  v_existing_idempotency public.recurring_task_idempotency%rowtype;
  v_fingerprint text;
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
  if v_user_id is null or v_operation_key is null then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;
  if p_operation not in ('complete', 'reopen', 'skip', 'edit') then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Unsupported Task Command'
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
  -- Ordinary Task Commands use the same canonical request fingerprint as the
  -- atomic write. This keeps a missing projection from weakening idempotency
  -- key conflict detection. Scoped lifecycle rows retain their authoritative
  -- task/operation check here; their lifecycle wrapper already validates the
  -- full request while the projection is present.
  if v_existing_idempotency.series_id is null then
    v_fingerprint := md5(
      jsonb_build_object(
        'operation', p_operation,
        'request', p_request - 'idempotencyKey' - 'operationKey'
      )::text
    );
    if v_existing_idempotency.fingerprint is distinct from v_fingerprint then
      return jsonb_build_object(
        'status', 'conflict',
        'type', 'conflict',
        'reason', 'Idempotency key was reused for a different request'
      );
    end if;
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

-- Checked recurring routing for field edits, Series revisions, and Series
-- state effects. Existing lifecycle functions remain the mutation authority;
-- this wrapper owns the visible-identity revalidation and command replay tag.
create or replace function public.recurring_task_scoped_command_checked(
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
  v_operation_key text := coalesce(
    nullif(p_request->>'idempotencyKey', ''),
    nullif(p_request->>'operationKey', '')
  );
  v_command_operation text := coalesce(
    nullif(p_request->>'taskCommandOperation', ''),
    case when p_operation = 'end-series' then 'skip' else 'edit' end
  );
  v_fingerprint text;
  v_existing_idempotency public.recurring_task_idempotency%rowtype;
  v_outcome jsonb;
  v_expected_revision_token integer;
begin
  if p_operation not in ('edit-occurrence', 'revise-series', 'end-series') then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Unsupported scoped Task Command'
    );
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
  if v_operation_key is null then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Task Command operation ID is required'
    );
  end if;
  if p_operation = 'edit-occurrence'
     and p_request ? 'scope'
     and p_request->>'scope' is distinct from 'this' then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Occurrence edits only support the this scope'
    );
  end if;
  if p_operation in ('revise-series', 'end-series')
     and p_request->>'scope' not in ('following', 'all') then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Series effects require the following or all scope'
    );
  end if;

  select * into v_series
  from public.recurring_task_series as series
  where series.id = v_series_id
    and series.user_id = v_user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  v_fingerprint := public.recurring_task_lifecycle_fingerprint(
    p_operation,
    p_request
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

  if p_request ? 'expectedRevisionToken' then
    begin
      v_expected_revision_token := nullif(
        btrim(coalesce(p_request->>'expectedRevisionToken', '')),
        ''
      )::integer;
    exception when others then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Expected Revision Token must be an integer'
      );
    end;
    if v_expected_revision_token is null then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Expected Revision Token must be an integer'
      );
    end if;
    if v_expected_revision_token <> v_series.revision_token then
      return jsonb_build_object(
        'status', 'conflict',
        'type', 'conflict',
        'expectedRevisionToken', v_expected_revision_token,
        'actualRevisionToken', v_series.revision_token
      );
    end if;
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
  if not found
     or v_occurrence.task_id is distinct from v_task.id
     or v_task.recurring_series_id is distinct from v_series_id
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

  if p_operation = 'edit-occurrence' then
    v_outcome := public.recurring_task_edit_occurrence_atomic(p_request);
  else
    v_outcome := public.recurring_task_lifecycle_atomic_coverage(
      p_operation,
      p_request
    );
  end if;

  if p_operation = 'end-series'
     and p_request->>'scope' = 'all'
     and v_outcome->>'status' in ('complete', 'already-applied') then
    update public.recurring_task_occurrences
    set state = 'withdrawn',
        updated_at = now()
    where series_id = v_series_id
      and state in ('open', 'extra');
    update public.tasks as task
    set recurrence_occurrence_state = 'withdrawn',
        updated_at = now()
    where task.user_id = v_user_id
      and task.recurring_series_id = v_series_id
      and task.recurrence_occurrence_state in ('open', 'extra');
    v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  end if;

  if v_outcome->>'status' in ('complete', 'already-applied') then
    insert into public.recurring_task_idempotency(
      user_id, operation_key, fingerprint, series_id, outcome,
      task_command_task_id, task_command_operation
    ) values (
      v_user_id, v_operation_key, v_fingerprint, v_series_id, v_outcome,
      v_task_id, v_command_operation
    )
    on conflict (user_id, operation_key) do update
      set outcome = excluded.outcome,
          task_command_task_id = excluded.task_command_task_id,
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
  if p_operation = 'edit-occurrence'
     and (p_request ? 'taskId' or p_request ? 'scope') then
    return public.recurring_task_scoped_command_checked(p_operation, p_request);
  end if;
  if p_operation in ('revise-series', 'end-series')
     and p_request ? 'taskId' then
    return public.recurring_task_scoped_command_checked(p_operation, p_request);
  end if;
  if p_operation = 'edit-occurrence' then
    return public.recurring_task_edit_occurrence_atomic(p_request);
  end if;
  return public.recurring_task_lifecycle_atomic_coverage(p_operation, p_request);
end;
$function$;

revoke all on function public.task_command_atomic(text, jsonb)
  from public, anon;
grant execute on function public.task_command_atomic(text, jsonb)
  to authenticated, service_role;
revoke all on function public.task_command_edit_atomic(jsonb)
  from public, anon, authenticated;
revoke all on function public.task_command_state_atomic(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.task_command_replay(text, jsonb)
  from public, anon;
grant execute on function public.task_command_replay(text, jsonb)
  to authenticated, service_role;
revoke all on function public.recurring_task_scoped_command_checked(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.recurring_task_lifecycle(text, jsonb)
  to authenticated, service_role;
