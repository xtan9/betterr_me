-- ralph-ci: true
-- Exercise all-scope recurring task deletion through its authenticated,
-- transactional lifecycle boundary. The fixture rolls back every assertion.
begin;

select public.ralph_ci_create_auth_user(
  '63300000-0000-0000-0000-000000000001',
  'recurring-deletion@example.test'
);
create temporary table recurring_task_deletion_fixture_state (
  series_id uuid not null
);
grant select, insert on recurring_task_deletion_fixture_state to authenticated;

select public.ralph_ci_create_auth_user(
  '63300000-0000-0000-0000-000000000002',
  'recurring-deletion-other@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63300000-0000-0000-0000-000000000001"}',
  true
);

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.recurring_task_delete_series(text,jsonb)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute recurring task deletion RPC';
  end if;
  if has_function_privilege(
    'anon',
    'public.recurring_task_delete_series(text,jsonb)',
    'execute'
  ) then
    raise exception 'anon can execute recurring task deletion RPC';
  end if;
end
$$;

do $all_scope$
declare
  v_outcome jsonb;
  v_series_id uuid;
begin
  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '63300000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-01',
      'activationDate', '2026-08-01',
      'timeZone', 'America/Los_Angeles',
      'defaults', jsonb_build_object('title', 'All-scope deletion'),
      'coverage', jsonb_build_object('from', '2026-08-01', 'to', '2026-08-04'),
      'idempotencyKey', '633-all-create'
    )
  );
  v_series_id := (v_outcome->'series'->>'id')::uuid;
  insert into recurring_task_deletion_fixture_state(series_id)
  values (v_series_id);

  select public.recurring_task_lifecycle(
    'complete-occurrence',
    jsonb_build_object(
      'userId', '63300000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'occurrenceId', (
        select occurrence.id
        from public.recurring_task_occurrences occurrence
        where occurrence.series_id = v_series_id
          and occurrence.scheduled_date = date '2026-08-01'
      )
    )
  ) into v_outcome;

  v_outcome := public.recurring_task_delete_series(
    'delete-series',
    jsonb_build_object(
      'userId', '63300000-0000-0000-0000-000000000001',
      'seriesId', v_series_id,
      'effectiveDate', '2026-08-03',
      'idempotencyKey', '633-all-delete'
    )
  );

  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'ended'
     or (select count(*) from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.state = 'completed') <> 1
     or (select count(*) from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.state = 'withdrawn') <> 3
     or (select count(*) from public.tasks task
         join public.recurring_task_occurrences occurrence
           on occurrence.task_id = task.id
         where occurrence.series_id = v_series_id
           and occurrence.state = 'withdrawn'
           and task.recurrence_occurrence_state <> 'withdrawn') <> 0 then
    raise exception 'all-scope deletion did not preserve completed history and withdraw incomplete work: %', v_outcome;
  end if;

  if (select task.is_completed
      from public.tasks task
      join public.recurring_task_occurrences occurrence
        on occurrence.task_id = task.id
      where occurrence.series_id = v_series_id
        and occurrence.state = 'completed') is distinct from true then
    raise exception 'completed task history was changed by all-scope deletion';
  end if;

  if (public.recurring_task_delete_series(
        'delete-series',
        jsonb_build_object(
          'userId', '63300000-0000-0000-0000-000000000002',
          'seriesId', v_series_id,
          'effectiveDate', '2026-08-03'
        )
      )->>'status') <> 'not-found' then
    raise exception 'cross-owner recurring deletion was not hidden';
  end if;
end
$all_scope$;

reset role;
do $legacy_projection$
declare
  v_series_id uuid;
begin
  select series_id into v_series_id
  from recurring_task_deletion_fixture_state;
  if (select status from public.recurring_tasks legacy
      where legacy.id = v_series_id) <> 'archived' then
    raise exception 'all-scope deletion did not archive the legacy projection';
  end if;
end
$legacy_projection$;

set local role authenticated;

do $rollback$
declare
  v_outcome jsonb;
  v_series_id uuid;
  v_request jsonb;
  v_failed boolean := false;
begin
  create function pg_temp.fail_task_deletion()
  returns trigger
  language plpgsql
  as $function$
  begin
    if new.recurrence_occurrence_state = 'withdrawn'
       and current_setting('betterr.allow_task_deletion', true)
           is distinct from 'on' then
      raise exception 'fixture recurring deletion rollback probe';
    end if;
    return new;
  end
  $function$;
  create trigger recurring_task_deletion_fixture_failure
  before update on public.tasks
  for each row execute function pg_temp.fail_task_deletion();

  v_outcome := public.recurring_task_lifecycle(
    'create-series',
    jsonb_build_object(
      'userId', '63300000-0000-0000-0000-000000000001',
      'recurrenceRule', jsonb_build_object('frequency', 'daily', 'interval', 1),
      'recurrenceAnchor', '2026-08-10',
      'activationDate', '2026-08-10',
      'defaults', jsonb_build_object('title', 'Deletion rollback'),
      'coverage', jsonb_build_object('from', '2026-08-10', 'to', '2026-08-12'),
      'idempotencyKey', '633-rollback-create'
    )
  );
  v_series_id := (v_outcome->'series'->>'id')::uuid;
  v_request := jsonb_build_object(
    'userId', '63300000-0000-0000-0000-000000000001',
    'seriesId', v_series_id,
    'effectiveDate', '2026-08-11',
    'idempotencyKey', '633-rollback-delete'
  );

  begin
    perform public.recurring_task_delete_series('delete-series', v_request);
  exception when others then
    v_failed := true;
  end;
  if not v_failed
     or (select status from public.recurring_task_series where id = v_series_id) <> 'active'
     or (select count(*) from public.recurring_task_occurrences occurrence
         where occurrence.series_id = v_series_id
           and occurrence.state = 'open') <> 3 then
    raise exception 'failed recurring deletion did not roll back every write';
  end if;

  perform set_config('betterr.allow_task_deletion', 'on', true);
  v_outcome := public.recurring_task_delete_series('delete-series', v_request);
  if v_outcome->>'status' <> 'complete'
     or v_outcome->'series'->>'status' <> 'ended' then
    raise exception 'recurring deletion retry after rollback did not converge: %', v_outcome;
  end if;
end
$rollback$;

rollback;
