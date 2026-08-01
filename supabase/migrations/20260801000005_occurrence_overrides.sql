-- Preserve field-level Occurrence Overrides through the same transactional
-- Recurring Task Lifecycle authority used by Series coverage.
--
-- The original lifecycle function predates the linked ordinary-task edit seam.
-- Keep its coverage wrapper intact for every other operation and route only
-- one-occurrence edits through this focused transaction so retries, task
-- updates, and the occurrence ledger share one rollback boundary.

alter function public.recurring_task_lifecycle(text, jsonb)
  rename to recurring_task_lifecycle_atomic_coverage;

create or replace function public.recurring_task_edit_occurrence_atomic(
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
  v_series_id uuid;
  v_series public.recurring_task_series%rowtype;
  v_occurrence public.recurring_task_occurrences%rowtype;
  v_updates jsonb;
  v_operation_key text;
  v_fingerprint text;
  v_existing_idempotency public.recurring_task_idempotency%rowtype;
  v_outcome jsonb;
  v_schedule_exists boolean;
begin
  perform set_config('betterr.recurring_lifecycle', 'on', true);

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

  v_series_id := nullif(p_request->>'seriesId', '')::uuid;
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
      'operation', 'edit-occurrence',
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

  if p_request ? 'expectedRevisionToken'
     and (p_request->>'expectedRevisionToken')::integer <> v_series.revision_token then
    return jsonb_build_object(
      'status', 'conflict',
      'type', 'conflict',
      'expectedRevisionToken', (p_request->>'expectedRevisionToken')::integer,
      'actualRevisionToken', v_series.revision_token
    );
  end if;

  v_updates := coalesce(p_request->'updates', '{}'::jsonb);
  if jsonb_typeof(v_updates) <> 'object' then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Occurrence updates must be an object'
    );
  end if;

  select * into v_occurrence
  from public.recurring_task_occurrences as occurrence
  where occurrence.id = nullif(p_request->>'occurrenceId', '')::uuid
    and occurrence.series_id = v_series_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  -- An editable occurrence always owns an ordinary task. Treat a missing or
  -- foreign link like a missing occurrence instead of mutating the ledger by
  -- itself.
  if v_occurrence.task_id is null
     or not exists (
       select 1
       from public.tasks as task
       where task.id = v_occurrence.task_id
         and task.user_id = v_user_id
     ) then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  if v_occurrence.state = 'completed'
     and p_request->>'completed' = 'false'
     and v_updates = '{}'::jsonb then
    select exists (
      select 1
      from public.recurring_task_series_revisions as revision
      where revision.series_id = v_series_id
        and revision.state = 'active'
        and revision.effective_from <= v_occurrence.scheduled_date
        and (
          revision.effective_to is null
          or v_occurrence.scheduled_date < revision.effective_to
        )
        and (
          v_series.last_scheduled_date is null
          or v_occurrence.scheduled_date <= v_series.last_scheduled_date
        )
        and exists (
          select 1
          from public.recurring_task_scheduled_dates(
            revision.recurrence_rule,
            revision.recurrence_anchor,
            revision.activation_date,
            v_occurrence.scheduled_date,
            v_occurrence.scheduled_date
          ) as dates
          where dates.scheduled_date = v_occurrence.scheduled_date
        )
    ) into v_schedule_exists;

    update public.recurring_task_occurrences
    set state = case when v_schedule_exists then 'open' else 'extra' end,
        completed_at = null,
        updated_at = now()
    where id = v_occurrence.id;
    update public.tasks
    set is_completed = false,
        status = 'todo',
        completed_at = null,
        recurrence_occurrence_state = case
          when v_schedule_exists then 'open' else 'extra' end,
        updated_at = now()
    where id = v_occurrence.task_id
      and user_id = v_user_id;
  elsif v_occurrence.state in ('completed', 'skipped', 'withdrawn') then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Only Open or Extra Occurrences can be edited'
    );
  else
    update public.recurring_task_occurrences
    set details = details || v_updates,
        overrides = overrides || v_updates,
        due_date = case
          when v_updates ? 'dueDate' then (v_updates->>'dueDate')::date
          else due_date
        end,
        updated_at = now()
    where id = v_occurrence.id;

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
          when v_updates ? 'categoryId' then (v_updates->>'categoryId')::uuid
          else category_id
        end,
        due_date = case
          when v_updates ? 'dueDate' then (v_updates->>'dueDate')::date
          else due_date
        end,
        due_time = case
          when v_updates ? 'dueTime' then (v_updates->>'dueTime')::time
          else due_time
        end,
        sort_order = case
          when v_updates ? 'sortOrder' then (v_updates->>'sortOrder')::double precision
          else sort_order
        end,
        status = case when v_updates ? 'status' then v_updates->>'status' else status end,
        section = case when v_updates ? 'section' then v_updates->>'section' else section end,
        project_id = case
          when v_updates ? 'projectId' then (v_updates->>'projectId')::uuid
          else project_id
        end,
        is_completed = case
          when v_updates ? 'status' then (v_updates->>'status') = 'done'
          else is_completed
        end,
        completed_at = case
          when v_updates ? 'status' and v_updates->>'status' = 'done' then now()
          when v_updates ? 'status' then null
          else completed_at
        end,
        is_exception = true,
        recurrence_occurrence_state = case
          when v_occurrence.state = 'extra' then 'extra'
          else 'open'
        end,
        occurrence_overrides = occurrence_overrides || v_updates,
        updated_at = now()
    where id = v_occurrence.task_id
      and user_id = v_user_id;

    if p_request->>'completed' = 'true' then
      update public.recurring_task_occurrences
      set state = 'completed', completed_at = now(), updated_at = now()
      where id = v_occurrence.id;
      update public.tasks
      set is_completed = true,
          status = 'done',
          completed_at = now(),
          recurrence_occurrence_state = 'completed',
          updated_at = now()
      where id = v_occurrence.task_id
        and user_id = v_user_id;
    end if;
  end if;

  update public.recurring_task_series
  set updated_at = now()
  where id = v_series_id;

  v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  if v_operation_key is not null then
    insert into public.recurring_task_idempotency(
      user_id, operation_key, fingerprint, series_id, outcome
    ) values (
      v_user_id, v_operation_key, v_fingerprint, v_series_id, v_outcome
    );
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
  if p_operation = 'edit-occurrence' then
    return public.recurring_task_edit_occurrence_atomic(p_request);
  end if;
  return public.recurring_task_lifecycle_atomic_coverage(p_operation, p_request);
end;
$function$;

revoke all on function public.recurring_task_edit_occurrence_atomic(jsonb)
  from public, anon, authenticated;
revoke all on function public.recurring_task_lifecycle_atomic_coverage(text, jsonb)
  from public, anon;
revoke all on function public.recurring_task_lifecycle(text, jsonb)
  from public, anon;
grant execute on function public.recurring_task_lifecycle(text, jsonb)
  to authenticated, service_role;
