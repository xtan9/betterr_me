-- Ended Series are terminal, and stopping policies are reconciled at every
-- materialization boundary. The legacy materializer remains the date calculator
-- and task writer; this migration adds the policy guard around that seam.

alter function public.recurring_task_materialize_locked(uuid, date, date)
  rename to recurring_task_materialize_locked_legacy;

create or replace function public.recurring_task_reconcile_stopping_policy(
  p_series_id uuid,
  p_from date,
  p_to date
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_series public.recurring_task_series%rowtype;
  v_occurrence public.recurring_task_occurrences%rowtype;
  v_revision public.recurring_task_series_revisions%rowtype;
  v_date date;
  v_start date;
  v_end date;
  v_retained_before integer;
  v_retained_count integer;
  v_active_schedule boolean;
  v_next_state text;
  v_reason text;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Coverage range must be inclusive and ordered';
  end if;

  select *
  into v_series
  from public.recurring_task_series as series
  where series.id = p_series_id
  for update;
  if not found then
    raise exception 'Recurring Task Series not found';
  end if;

  -- A revision, pause, end, or a shortened stopping policy can make an
  -- already-materialized Open Occurrence provisional. Only untouched rows may
  -- be withdrawn; overridden rows remain retained as Extra Occurrences.
  for v_occurrence in
    select occurrence.*
    from public.recurring_task_occurrences as occurrence
    where occurrence.series_id = p_series_id
      and occurrence.state = 'open'
      and (
        occurrence.scheduled_date between p_from and p_to
        or (
          v_series.last_scheduled_date is not null
          and occurrence.scheduled_date > v_series.last_scheduled_date
        )
      )
    order by occurrence.scheduled_date, occurrence.id
    for update
  loop
    select exists (
      select 1
      from public.recurring_task_series_revisions as revision
      where revision.series_id = p_series_id
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
    ) into v_active_schedule;

    if v_series.occurrence_limit is not null then
      select count(*)::integer
      into v_retained_before
      from public.recurring_task_occurrences as prior
      where prior.series_id = p_series_id
        and prior.state <> 'withdrawn'
        and prior.scheduled_date < v_occurrence.scheduled_date;
    else
      v_retained_before := 0;
    end if;

    if not v_active_schedule
       or (
         v_series.occurrence_limit is not null
         and v_retained_before >= v_series.occurrence_limit
       ) then
      v_next_state := case
        when v_occurrence.overrides <> '{}'::jsonb then 'extra'
        else 'withdrawn'
      end;
      update public.recurring_task_occurrences
      set state = v_next_state,
          updated_at = now()
      where id = v_occurrence.id;
      update public.tasks
      set recurrence_occurrence_state = v_next_state,
          updated_at = now()
      where id = v_occurrence.task_id;
    end if;
  end loop;

  -- A revision may add back a date that an earlier revision withdrew. Do not
  -- resurrect pause/end/skip absences, an Ended Series, a date after the
  -- inclusive boundary, or a date beyond the retained-history limit.
  if v_series.status <> 'ended' then
    select count(*)::integer
    into v_retained_count
    from public.recurring_task_occurrences as occurrence
    where occurrence.series_id = p_series_id
      and occurrence.state <> 'withdrawn';

    for v_occurrence in
      select occurrence.*
      from public.recurring_task_occurrences as occurrence
      where occurrence.series_id = p_series_id
        and occurrence.state = 'withdrawn'
        and occurrence.scheduled_date between p_from and p_to
      order by occurrence.scheduled_date, occurrence.id
      for update
    loop
      if exists (
        select 1
        from public.recurring_task_intentional_absences as absence
        where absence.series_id = p_series_id
          and absence.scheduled_date = v_occurrence.scheduled_date
      ) then
        continue;
      end if;

      select revision.*
      into v_revision
      from public.recurring_task_series_revisions as revision
      where revision.series_id = p_series_id
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
      order by revision.effective_from desc
      limit 1;
      if not found then
        continue;
      end if;

      if v_series.occurrence_limit is not null
         and v_retained_count >= v_series.occurrence_limit then
        continue;
      end if;

      update public.recurring_task_occurrences
      set state = 'open',
          revision_id = v_revision.id,
          details = v_revision.defaults || v_occurrence.overrides,
          due_date = case
            when v_occurrence.overrides ? 'dueDate' then v_occurrence.due_date
            else v_occurrence.scheduled_date
          end,
          updated_at = now()
      where id = v_occurrence.id;
      update public.tasks
      set title = coalesce((v_revision.defaults || v_occurrence.overrides)->>'title', title),
          description = (v_revision.defaults || v_occurrence.overrides)->>'description',
          priority = coalesce(((v_revision.defaults || v_occurrence.overrides)->>'priority')::integer, priority),
          category_id = ((v_revision.defaults || v_occurrence.overrides)->>'categoryId')::uuid,
          due_date = case
            when v_occurrence.overrides ? 'dueDate' then due_date
            else v_occurrence.scheduled_date
          end,
          due_time = ((v_revision.defaults || v_occurrence.overrides)->>'dueTime')::time,
          sort_order = coalesce(((v_revision.defaults || v_occurrence.overrides)->>'sortOrder')::double precision, sort_order),
          status = coalesce((v_revision.defaults || v_occurrence.overrides)->>'status', status),
          section = coalesce((v_revision.defaults || v_occurrence.overrides)->>'section', section),
          project_id = ((v_revision.defaults || v_occurrence.overrides)->>'projectId')::uuid,
          recurrence_occurrence_state = 'open',
          updated_at = now()
      where id = v_occurrence.task_id;
      v_retained_count := v_retained_count + 1;
    end loop;
  end if;

  -- Persist intentional absence for every scheduled date suppressed by an
  -- inactive revision or by a stopping policy. Pause-suppressed dates never
  -- become ledger occurrences and therefore never consume the limit.
  for v_revision in
    select revision.*
    from public.recurring_task_series_revisions as revision
    where revision.series_id = p_series_id
      and revision.effective_from <= p_to
      and (revision.effective_to is null or revision.effective_to > p_from)
    order by revision.effective_from, revision.id
  loop
    v_start := greatest(p_from, v_revision.effective_from);
    v_end := least(p_to, coalesce(v_revision.effective_to - 1, p_to));
    if v_start > v_end then
      continue;
    end if;

    for v_date in
      select dates.scheduled_date
      from public.recurring_task_scheduled_dates(
        v_revision.recurrence_rule,
        v_revision.recurrence_anchor,
        v_revision.activation_date,
        v_start,
        v_end
      ) as dates
      order by dates.scheduled_date
    loop
      v_reason := null;
      if v_revision.state <> 'active' then
        v_reason := case v_revision.state
          when 'paused' then 'paused'
          else 'ended'
        end;
      elsif v_series.last_scheduled_date is not null
         and v_date > v_series.last_scheduled_date then
        v_reason := 'ended';
      else
        select count(*)::integer
        into v_retained_count
        from public.recurring_task_occurrences as occurrence
        where occurrence.series_id = p_series_id
          and occurrence.state <> 'withdrawn';
        if v_series.occurrence_limit is not null
           and v_retained_count >= v_series.occurrence_limit
           and not exists (
             select 1
             from public.recurring_task_occurrences as occurrence
             where occurrence.series_id = p_series_id
               and occurrence.scheduled_date = v_date
               and occurrence.state <> 'withdrawn'
           ) then
          v_reason := 'ended';
        end if;
      end if;

      if v_reason is not null then
        insert into public.recurring_task_intentional_absences(
          series_id, scheduled_date, reason
        ) values (p_series_id, v_date, v_reason)
        on conflict (series_id, scheduled_date) do update
          set reason = case
            when public.recurring_task_intentional_absences.reason = 'skipped'
              then public.recurring_task_intentional_absences.reason
            else excluded.reason
          end;
      end if;
    end loop;
  end loop;

  select count(*)::integer
  into v_retained_count
  from public.recurring_task_occurrences as occurrence
  where occurrence.series_id = p_series_id
    and occurrence.state <> 'withdrawn';

  update public.recurring_task_series
  set coverage_horizon = case
        when coverage_horizon is null or p_to > coverage_horizon then p_to
        else coverage_horizon
      end,
      status = case
        when occurrence_limit is not null
          and v_retained_count >= occurrence_limit then 'ended'
        when last_scheduled_date is not null
          and p_to >= last_scheduled_date then 'ended'
        else status
      end,
      updated_at = now()
  where id = p_series_id;
end;
$function$;

create or replace function public.recurring_task_materialize_locked(
  p_series_id uuid,
  p_from date,
  p_to date
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_status text;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Coverage range must be inclusive and ordered';
  end if;

  select series.status
  into v_status
  from public.recurring_task_series as series
  where series.id = p_series_id
  for update;
  if not found then
    raise exception 'Recurring Task Series not found';
  end if;

  -- An Ended Series can reconcile retained lineage and intentional absences,
  -- but it can never create or resurrect a Task Occurrence.
  if v_status <> 'ended' then
    perform public.recurring_task_materialize_locked_legacy(
      p_series_id,
      p_from,
      p_to
    );
  end if;
  perform public.recurring_task_reconcile_stopping_policy(
    p_series_id,
    p_from,
    p_to
  );
end;
$function$;

create or replace function public.recurring_task_end_atomic(
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
  v_effective_text text := nullif(btrim(coalesce(p_request->>'effectiveDate', '')), '');
  v_effective_date date;
  v_from_date date;
  v_to_date date;
  v_requested_to date;
  v_operation_key text := coalesce(
    nullif(btrim(coalesce(p_request->>'idempotencyKey', '')), ''),
    nullif(btrim(coalesce(p_request->>'operationKey', '')), '')
  );
  v_fingerprint text;
  v_expected_revision_token integer;
  v_existing_idempotency public.recurring_task_idempotency%rowtype;
  v_outcome jsonb;
begin
  perform set_config('betterr.recurring_lifecycle', 'on', true);

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

  select *
  into v_series
  from public.recurring_task_series as series
  where series.id = v_series_id
    and series.user_id = v_user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  v_fingerprint := public.recurring_task_lifecycle_fingerprint(
    'end-series',
    p_request
  );
  if v_operation_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || v_operation_key, 0)
    );
    select *
    into v_existing_idempotency
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

  if v_series.status = 'ended' then
    return public.recurring_task_series_snapshot(v_series_id, 'complete');
  end if;

  if v_effective_text is null then
    v_effective_date := (
      now() at time zone coalesce(v_series.time_zone, 'UTC')
    )::date;
  elsif v_effective_text !~ '^[0-9]{4,}-[0-9]{2}-[0-9]{2}$' then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Effective Date must be a valid local date'
    );
  else
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

  select *
  into v_revision
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
      v_from_date := (p_request->'coverage'->>'from')::date;
      v_requested_to := (p_request->'coverage'->>'to')::date;
    exception when others then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Coverage range must be inclusive and ordered'
      );
    end;
    if v_from_date > v_requested_to then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Coverage range must be inclusive and ordered'
      );
    end if;
  end if;

  if v_effective_date = v_revision.effective_from then
    update public.recurring_task_series_revisions
    set state = 'ended',
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
      'ended',
      v_revision.recurrence_rule,
      v_revision.recurrence_anchor,
      v_effective_date,
      v_revision.defaults
    ) returning * into v_revision;
  end if;

  update public.recurring_task_series
  set current_revision_id = v_revision.id,
      status = 'ended',
      revision_token = revision_token + 1,
      updated_at = now()
  where id = v_series_id;

  select greatest(
    v_effective_date,
    coalesce(v_series.coverage_horizon, v_effective_date),
    coalesce(v_requested_to, v_effective_date),
    coalesce((
      select max(occurrence.scheduled_date)
      from public.recurring_task_occurrences as occurrence
      where occurrence.series_id = v_series_id
    ), v_effective_date)
  )
  into v_to_date;

  perform public.recurring_task_reconcile_stopping_policy(
    v_series_id,
    v_effective_date,
    v_to_date
  );

  update public.recurring_tasks as legacy
  set status = 'archived',
      instances_generated = (
        select count(*)::integer
        from public.recurring_task_occurrences as occurrence
        where occurrence.series_id = v_series_id
          and occurrence.state <> 'withdrawn'
      ),
      next_generate_date = (
        select series.coverage_horizon + 1
        from public.recurring_task_series as series
        where series.id = v_series_id
      )
  where legacy.id = v_series_id
    and legacy.user_id = v_user_id;

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
  if p_operation = 'end-series' then
    return public.recurring_task_end_atomic(p_request);
  end if;
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

create or replace function public.recurring_task_stopping_policy_reconcile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_to_date date;
begin
  select greatest(
    coalesce(new.coverage_horizon, new.activation_date),
    coalesce((
      select max(occurrence.scheduled_date)
      from public.recurring_task_occurrences as occurrence
      where occurrence.series_id = new.id
    ), new.activation_date)
  )
  into v_to_date;

  perform public.recurring_task_reconcile_stopping_policy(
    new.id,
    new.activation_date,
    v_to_date
  );
  return new;
end;
$function$;

-- The trigger is created after its function so a fresh migration and a
-- migration replay both resolve the same function object.
drop trigger if exists recurring_task_stopping_policy_reconcile
  on public.recurring_task_series;
create trigger recurring_task_stopping_policy_reconcile
after update of occurrence_limit, last_scheduled_date
on public.recurring_task_series
for each row
when (
  old.occurrence_limit is distinct from new.occurrence_limit
  or old.last_scheduled_date is distinct from new.last_scheduled_date
)
execute function public.recurring_task_stopping_policy_reconcile();

revoke all on function public.recurring_task_materialize_locked_legacy(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.recurring_task_reconcile_stopping_policy(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.recurring_task_materialize_locked(uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.recurring_task_end_atomic(jsonb)
  from public, anon, authenticated;
revoke all on function public.recurring_task_stopping_policy_reconcile()
  from public, anon, authenticated;
revoke all on function public.recurring_task_lifecycle(text, jsonb)
  from public, anon;
grant execute on function public.recurring_task_lifecycle(text, jsonb)
  to authenticated, service_role;
