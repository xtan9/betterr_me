-- Keep Series Revision mutations on the existing lifecycle transaction while
-- making revision retries and idempotency-key conflicts typed outcomes.

create or replace function public.recurring_task_revision_replay(
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
  v_operation_key text := coalesce(
    nullif(p_request->>'idempotencyKey', ''),
    nullif(p_request->>'operationKey', '')
  );
  v_fingerprint text;
  v_existing public.recurring_task_idempotency%rowtype;
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
  if not exists (
    select 1
    from public.recurring_task_series as series
    where series.id = v_series_id
      and series.user_id = v_user_id
  ) then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;
  if v_operation_key is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || v_operation_key, 0)
  );
  v_fingerprint := public.recurring_task_lifecycle_fingerprint(
    'revise-series',
    p_request
  );

  select *
  into v_existing
  from public.recurring_task_idempotency as record
  where record.user_id = v_user_id
    and record.operation_key = v_operation_key
  for update;
  if not found then
    return null;
  end if;
  if v_existing.fingerprint <> v_fingerprint then
    return jsonb_build_object(
      'status', 'conflict',
      'type', 'conflict',
      'reason', 'Idempotency key was reused for a different request'
    );
  end if;

  return jsonb_set(
    jsonb_set(
      v_existing.outcome,
      '{status}',
      '"already-applied"'::jsonb
    ),
    '{type}',
    '"already-applied"'::jsonb
  );
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

revoke all on function public.recurring_task_revision_replay(jsonb)
  from public, anon, authenticated;
revoke all on function public.recurring_task_lifecycle(text, jsonb)
  from public, anon;
grant execute on function public.recurring_task_lifecycle(text, jsonb)
  to authenticated, service_role;
