-- Own completion, reopening, and intentional skipping at the recurring
-- occurrence boundary. These commands update the ledger and its ordinary task
-- projection in one transaction, with idempotent replay keyed by intent.

create or replace function public.recurring_task_occurrence_command_atomic(
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
  v_series public.recurring_task_series%rowtype;
  v_occurrence public.recurring_task_occurrences%rowtype;
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

  if p_request ? 'expectedRevisionToken'
     and (p_request->>'expectedRevisionToken')::integer <> v_series.revision_token then
    return jsonb_build_object(
      'status', 'conflict',
      'type', 'conflict',
      'expectedRevisionToken', (p_request->>'expectedRevisionToken')::integer,
      'actualRevisionToken', v_series.revision_token
    );
  end if;

  if p_operation not in (
    'skip-occurrence',
    'complete-occurrence',
    'reopen-occurrence'
  ) then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Unsupported occurrence command'
    );
  end if;

  select * into v_occurrence
  from public.recurring_task_occurrences as occurrence
  where occurrence.id = v_occurrence_id
    and occurrence.series_id = v_series_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  if p_operation = 'skip-occurrence' then
    if v_occurrence.state = 'skipped' then
      v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
      return jsonb_set(
        jsonb_set(v_outcome, '{status}', '"already-applied"'::jsonb),
        '{type}',
        '"already-applied"'::jsonb
      );
    end if;
    if v_occurrence.state not in ('open', 'extra') then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Only Open or Extra Occurrences can be skipped'
      );
    end if;
    if v_occurrence.task_id is null
       or not exists (
         select 1
         from public.tasks as task
         where task.id = v_occurrence.task_id
           and task.user_id = v_user_id
       ) then
      return jsonb_build_object('status', 'not-found', 'type', 'not-found');
    end if;

    update public.recurring_task_occurrences
    set state = 'skipped',
        completed_at = null,
        updated_at = now()
    where id = v_occurrence.id;
    insert into public.recurring_task_intentional_absences(
      series_id, scheduled_date, reason
    ) values (v_series_id, v_occurrence.scheduled_date, 'skipped')
    on conflict (series_id, scheduled_date) do update
      set reason = 'skipped';
    delete from public.tasks
    where id = v_occurrence.task_id
      and user_id = v_user_id;
  elsif p_operation = 'complete-occurrence' then
    if v_occurrence.state = 'completed' then
      v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
      return jsonb_set(
        jsonb_set(v_outcome, '{status}', '"already-applied"'::jsonb),
        '{type}',
        '"already-applied"'::jsonb
      );
    end if;
    if v_occurrence.state not in ('open', 'extra') then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Only Open or Extra Occurrences can be completed'
      );
    end if;
    if v_occurrence.task_id is null
       or not exists (
         select 1
         from public.tasks as task
         where task.id = v_occurrence.task_id
           and task.user_id = v_user_id
       ) then
      return jsonb_build_object('status', 'not-found', 'type', 'not-found');
    end if;

    update public.recurring_task_occurrences
    set state = 'completed',
        completed_at = now(),
        updated_at = now()
    where id = v_occurrence.id;
    update public.tasks
    set is_completed = true,
        status = 'done',
        completed_at = coalesce(completed_at, now()),
        recurrence_occurrence_state = 'completed',
        updated_at = now()
    where id = v_occurrence.task_id
      and user_id = v_user_id;
  else
    if v_occurrence.state in ('open', 'extra') then
      v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
      return jsonb_set(
        jsonb_set(v_outcome, '{status}', '"already-applied"'::jsonb),
        '{type}',
        '"already-applied"'::jsonb
      );
    end if;
    if v_occurrence.state <> 'completed' then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Only completed Occurrences can be reopened'
      );
    end if;
    if v_occurrence.task_id is null
       or not exists (
         select 1
         from public.tasks as task
         where task.id = v_occurrence.task_id
           and task.user_id = v_user_id
       ) then
      return jsonb_build_object('status', 'not-found', 'type', 'not-found');
    end if;

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

alter function public.recurring_task_edit_occurrence_atomic(jsonb)
  rename to recurring_task_edit_occurrence_overrides_atomic;

create or replace function public.recurring_task_edit_occurrence_atomic(
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_request->>'completed' = 'false'
     and coalesce(p_request->'updates', '{}'::jsonb) = '{}'::jsonb then
    return public.recurring_task_occurrence_command_atomic(
      'reopen-occurrence',
      p_request
    );
  end if;
  return public.recurring_task_edit_occurrence_overrides_atomic(p_request);
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
    return public.recurring_task_occurrence_command_atomic(p_operation, p_request);
  end if;
  if p_operation = 'edit-occurrence' then
    return public.recurring_task_edit_occurrence_atomic(p_request);
  end if;
  return public.recurring_task_lifecycle_atomic_coverage(p_operation, p_request);
end;
$function$;

revoke all on function public.recurring_task_occurrence_command_atomic(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.recurring_task_edit_occurrence_atomic(jsonb)
  from public, anon, authenticated;
revoke all on function public.recurring_task_lifecycle(text, jsonb)
  from public, anon;
grant execute on function public.recurring_task_lifecycle(text, jsonb)
  to authenticated, service_role;
