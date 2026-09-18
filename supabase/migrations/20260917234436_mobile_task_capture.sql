-- See docs/architecture/mobile-task-capture.md for mapping and rollback.
alter table public.tasks
  add column estimate_minutes integer check (estimate_minutes > 0),
  add column archived_at timestamptz,
  add column version uuid not null default gen_random_uuid();

create function public.advance_task_version() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  new.version := gen_random_uuid();
  return new;
end $$;
create trigger advance_task_version before update on public.tasks
for each row execute function public.advance_task_version();

create table public.task_capture_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  outcome jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
alter table public.task_capture_receipts enable row level security;
revoke all on public.task_capture_receipts from public, anon, authenticated;
grant select on public.task_capture_receipts to authenticated;
create policy task_capture_receipt_owner on public.task_capture_receipts
for select to authenticated using ((select auth.uid()) = user_id);

create function public.task_capture_command(
  p_operation text,
  p_operation_id uuid,
  p_task_id uuid default null,
  p_expected_version uuid default null,
  p_changes jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  owner_id uuid := auth.uid();
  task public.tasks%rowtype;
  receipt public.task_capture_receipts%rowtype;
  request jsonb := jsonb_build_object('operation',p_operation,'taskId',p_task_id,
    'version',p_expected_version,'changes',p_changes);
  outcome jsonb;
  occurrence_changes jsonb := '{}'::jsonb;
  initial_series_id uuid;
  initial_occurrence_id uuid;
begin
  if owner_id is null then
    return jsonb_build_object('status','not-found');
  end if;
  if p_operation_id is null or p_operation is null
    or p_operation not in ('create','edit','archive','unarchive')
    or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_changes) k
      where k not in ('title','estimate_minutes','due_date'))
    or (p_operation in ('archive','unarchive') and p_changes <> '{}'::jsonb)
    or (p_operation = 'create' and (p_task_id is not null or p_expected_version is not null or not p_changes ? 'title'))
    or (p_operation <> 'create' and (p_task_id is null or p_expected_version is null)) then
    return jsonb_build_object('status','invalid-transition');
  end if;
  if p_changes ? 'title' and (jsonb_typeof(p_changes->'title') <> 'string'
    or length(btrim(p_changes->>'title')) = 0 or length(p_changes->>'title') > 100) then
    return jsonb_build_object('status','invalid-transition');
  end if;
  if p_changes ? 'estimate_minutes' and p_changes->'estimate_minutes' <> 'null'::jsonb
    and (jsonb_typeof(p_changes->'estimate_minutes') <> 'number'
      or (p_changes->>'estimate_minutes') !~ '^[0-9]+$'
      or (p_changes->>'estimate_minutes')::numeric < 1
      or (p_changes->>'estimate_minutes')::numeric > 2147483647) then
    return jsonb_build_object('status','invalid-transition');
  end if;
  if p_changes ? 'due_date' and p_changes->'due_date' <> 'null'::jsonb then
    if jsonb_typeof(p_changes->'due_date') <> 'string'
      or (p_changes->>'due_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return jsonb_build_object('status','invalid-transition');
    end if;
    -- Cast also rejects impossible dates; the exception handler rolls back.
    perform (p_changes->>'due_date')::date;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':capture:' || p_operation_id::text,0));
  select * into receipt from public.task_capture_receipts
  where user_id = owner_id and operation_id = p_operation_id;
  if found then
    if receipt.request is distinct from request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;

  if p_operation = 'create' then
    insert into public.tasks(user_id,title,estimate_minutes,due_date)
    values(owner_id,p_changes->>'title',(p_changes->>'estimate_minutes')::integer,
      (p_changes->>'due_date')::date) returning * into task;
  else
    -- Match lifecycle lock order (series, occurrence, task). Never edit a
    -- recurring projection without updating its authoritative overrides.
    select recurring_series_id,recurring_occurrence_id into initial_series_id,initial_occurrence_id
    from public.tasks where id=p_task_id and user_id=owner_id;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if initial_series_id is not null then
      perform 1 from public.recurring_task_series where id=initial_series_id and user_id=owner_id for update;
      if not found then return jsonb_build_object('status','not-found'); end if;
      perform 1 from public.recurring_task_occurrences
      where id=initial_occurrence_id and series_id=initial_series_id and task_id=p_task_id for update;
      if not found then return jsonb_build_object('status','not-found'); end if;
    end if;
    select * into task from public.tasks where id=p_task_id and user_id=owner_id for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if task.version <> p_expected_version
      or task.recurring_series_id is distinct from initial_series_id
      or task.recurring_occurrence_id is distinct from initial_occurrence_id then
      return jsonb_build_object('status','conflict');
    end if;
    if (task.recurring_series_id is null) <> (task.recurring_occurrence_id is null) then
      return jsonb_build_object('status','invalid-transition');
    end if;
    -- Authorize only the narrowly validated task metadata changes below.
    -- Title/date still go through the occurrence override transaction.
    perform set_config('betterr.recurring_lifecycle','on',true);
    if p_operation = 'edit' then
      if task.recurring_series_id is not null then
        if p_changes ? 'title' then occurrence_changes := occurrence_changes || jsonb_build_object('title',p_changes->'title'); end if;
        if p_changes ? 'due_date' then occurrence_changes := occurrence_changes || jsonb_build_object('dueDate',p_changes->'due_date'); end if;
        if occurrence_changes <> '{}'::jsonb then
          outcome := public.recurring_task_lifecycle('edit-occurrence',jsonb_build_object(
            'userId',owner_id,'taskId',task.id,'seriesId',task.recurring_series_id,
            'occurrenceId',task.recurring_occurrence_id,'scope','this',
            'updates',occurrence_changes,'idempotencyKey','capture:' || p_operation_id::text));
          if outcome->>'status' not in ('complete','already-applied') then return outcome; end if;
        end if;
      end if;
      update public.tasks set
        title = case when p_changes ? 'title' then p_changes->>'title' else title end,
        estimate_minutes = case when p_changes ? 'estimate_minutes' then (p_changes->>'estimate_minutes')::integer else estimate_minutes end,
        due_date = case when p_changes ? 'due_date' then (p_changes->>'due_date')::date else due_date end
      where id=task.id and user_id=owner_id returning * into task;
    else
      update public.tasks set archived_at = case when p_operation='archive' then coalesce(archived_at,now()) else null end
      where id=task.id and user_id=owner_id returning * into task;
    end if;
  end if;
  outcome := jsonb_build_object('status','complete','task',to_jsonb(task));
  insert into public.task_capture_receipts(user_id,operation_id,request,outcome)
  values(owner_id,p_operation_id,request,outcome);
  return outcome;
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  return jsonb_build_object('status','invalid-transition');
end $$;
revoke all on function public.task_capture_command(text,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.task_capture_command(text,uuid,uuid,uuid,jsonb) to authenticated;

-- Existing web ordinary edits can carry the version captured by the editor.
-- Keep legacy signatures and idempotency semantics intact.
alter function public.task_command_edit_atomic(jsonb) rename to task_command_edit_unversioned_atomic;
create function public.task_command_edit_atomic(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  owner_id uuid := auth.uid();
  current_version uuid;
  replay jsonb;
begin
  if p_request ? 'expectedTaskVersion' then
    if owner_id is null or owner_id::text is distinct from p_request->>'userId' then
      return jsonb_build_object('status','not-found','type','not-found');
    end if;
    -- Use the same advisory lock as the legacy edit to serialize retry lookup.
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':' || coalesce(p_request->>'idempotencyKey',p_request->>'operationKey'),0));
    replay := public.task_command_replay('edit',p_request);
    if replay->>'status' in ('already-applied','conflict') then return replay; end if;
    select version into current_version from public.tasks
    where id=(p_request->>'taskId')::uuid and user_id=owner_id for update;
    if not found then return jsonb_build_object('status','not-found','type','not-found'); end if;
    if current_version::text is distinct from p_request->>'expectedTaskVersion' then
      return jsonb_build_object('status','conflict','type','conflict','reason','Task changed. Reload before saving.');
    end if;
  end if;
  return public.task_command_edit_unversioned_atomic(p_request);
end $$;
revoke all on function public.task_command_edit_unversioned_atomic(jsonb) from public,anon,authenticated;
revoke all on function public.task_command_edit_atomic(jsonb) from public,anon,authenticated;
notify pgrst, 'reload schema';

-- Keep recurring web edits under the same row-version contract, after replay.
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
  if p_request ? 'expectedTaskVersion'
     and v_task.version::text is distinct from p_request->>'expectedTaskVersion' then
    return jsonb_build_object('status', 'conflict', 'type', 'conflict',
      'reason', 'Task changed. Reload before saving.');
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
    v_outcome := public.recurring_task_lifecycle_with_observability(
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
