-- Pause and resume are lifecycle transitions over effective local dates. Keep
-- them in the same locked transaction as revision changes and coverage
-- reconciliation so a failed materialization cannot leave a partial pause.

create or replace function public.recurring_task_pause_resume_atomic(
  p_operation text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_requested_user_id uuid;
  v_authenticated_user_id uuid := auth.uid();
  v_user_id uuid;
  v_series_id uuid;
  v_series public.recurring_task_series%rowtype;
  v_revision public.recurring_task_series_revisions%rowtype;
  v_operation_key text := coalesce(
    nullif(btrim(coalesce(p_request->>'idempotencyKey', '')), ''),
    nullif(btrim(coalesce(p_request->>'operationKey', '')), '')
  );
  v_fingerprint text;
  v_existing_idempotency public.recurring_task_idempotency%rowtype;
  v_effective_text text := nullif(
    btrim(coalesce(p_request->>'effectiveDate', '')),
    ''
  );
  v_effective_date date;
  v_expected_revision_token integer;
  v_status text;
  v_from_date date;
  v_to_date date;
  v_outcome jsonb;
begin
  perform set_config('betterr.recurring_lifecycle', 'on', true);

  if p_operation not in ('pause-series', 'resume-series') then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Unsupported pause or resume command'
    );
  end if;

  begin
    v_requested_user_id := nullif(
      btrim(coalesce(p_request->>'userId', '')),
      ''
    )::uuid;
    v_series_id := nullif(
      btrim(coalesce(p_request->>'seriesId', '')),
      ''
    )::uuid;
  exception when others then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end;

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

  v_fingerprint := public.recurring_task_lifecycle_fingerprint(
    p_operation,
    p_request
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

  if p_operation = 'pause-series' and v_series.status <> 'active' then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', case when v_series.status = 'ended'
        then 'Ended Series cannot be paused'
        else 'Paused Series is already paused'
      end
    );
  end if;
  if p_operation = 'resume-series' and v_series.status <> 'paused' then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', case when v_series.status = 'ended'
        then 'Ended Series cannot be resumed'
        else 'Active Series is not paused'
      end
    );
  end if;

  if v_effective_text is null then
    v_effective_date := (
      now() at time zone coalesce(v_series.time_zone, 'UTC')
    )::date;
  else
    if v_effective_text !~ '^[0-9]{4,}-[0-9]{2}-[0-9]{2}$' then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Effective Date must be a valid local date'
      );
    end if;
    begin
      v_effective_date := v_effective_text::date;
    exception when others then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Effective Date must be a valid local date'
      );
    end;
  end if;

  if v_effective_date < v_series.activation_date then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Lifecycle date cannot precede activation'
    );
  end if;

  select * into v_revision
  from public.recurring_task_series_revisions as revision
  where revision.id = v_series.current_revision_id
  for update;
  if not found then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Series has no current revision'
    );
  end if;
  if v_effective_date < v_revision.effective_from then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'A lifecycle transition cannot begin before the current revision'
    );
  end if;

  v_status := case p_operation
    when 'pause-series' then 'paused'
    else 'active'
  end;

  if p_request ? 'coverage' then
    if jsonb_typeof(p_request->'coverage') <> 'object'
       or p_request->'coverage'->>'from' is null
       or p_request->'coverage'->>'to' is null then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Coverage range must be inclusive and ordered'
      );
    end if;
    begin
      v_from_date := p_request->'coverage'->>'from';
      v_to_date := p_request->'coverage'->>'to';
    exception when others then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Coverage range must be inclusive and ordered'
      );
    end;
  else
    v_from_date := v_effective_date;
    v_to_date := v_series.coverage_horizon;
  end if;

  if v_from_date is not null
     and v_to_date is not null
     and v_from_date > v_to_date then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Coverage range must be inclusive and ordered'
    );
  end if;

  if p_operation = 'resume-series' then
    delete from public.recurring_task_intentional_absences
    where series_id = v_series_id
      and reason = 'paused'
      and scheduled_date >= v_effective_date;
  end if;

  if v_effective_date = v_revision.effective_from then
    update public.recurring_task_series_revisions
    set state = v_status,
        activation_date = v_effective_date
    where id = v_revision.id
    returning * into v_revision;
  else
    update public.recurring_task_series_revisions
    set effective_to = v_effective_date
    where id = v_revision.id;

    insert into public.recurring_task_series_revisions(
      series_id,
      effective_from,
      state,
      recurrence_rule,
      recurrence_anchor,
      activation_date,
      defaults
    ) values (
      v_series_id,
      v_effective_date,
      v_status,
      v_revision.recurrence_rule,
      v_revision.recurrence_anchor,
      v_effective_date,
      v_revision.defaults
    ) returning * into v_revision;
  end if;

  update public.recurring_task_series
  set current_revision_id = v_revision.id,
      status = v_status,
      revision_token = revision_token + 1,
      updated_at = now()
  where id = v_series_id;

  if v_from_date is not null and v_to_date is not null then
    perform public.recurring_task_materialize_locked(
      v_series_id,
      v_from_date,
      v_to_date
    );
  end if;

  update public.recurring_tasks
  set status = case v_status when 'ended' then 'archived' else v_status end,
      next_generate_date = coalesce(
        (
          select series.coverage_horizon + 1
          from public.recurring_task_series as series
          where series.id = v_series_id
        ),
        next_generate_date
      )
  where id = v_series_id
    and user_id = v_user_id;

  v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  if v_operation_key is not null then
    insert into public.recurring_task_idempotency(
      user_id,
      operation_key,
      fingerprint,
      series_id,
      outcome
    ) values (
      v_user_id,
      v_operation_key,
      v_fingerprint,
      v_series_id,
      v_outcome
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
declare
  v_replay jsonb;
begin
  if p_operation in ('pause-series', 'resume-series') then
    return public.recurring_task_pause_resume_atomic(p_operation, p_request);
  end if;
  if p_operation = 'revise-series' then
    v_replay := public.recurring_task_revision_replay(p_request);
    if v_replay is not null then
      return v_replay;
    end if;
  end if;
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

revoke all on function public.recurring_task_pause_resume_atomic(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.recurring_task_lifecycle(text, jsonb)
  from public, anon;
grant execute on function public.recurring_task_lifecycle(text, jsonb)
  to authenticated, service_role;
