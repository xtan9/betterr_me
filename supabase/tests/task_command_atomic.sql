-- constrained-sql-fixture: true
-- Exercise ordinary Task Commands through the same explicit operation boundary.
-- The transaction proves owner binding, idempotent replay, and rollback.
begin;

select public.sql_fixture_create_auth_user(
  '68200000-0000-0000-0000-000000000001',
  'task-commands@example.test'
);
select public.sql_fixture_create_auth_user(
  '68200000-0000-0000-0000-000000000002',
  'task-commands-other@example.test'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"68200000-0000-0000-0000-000000000001"}',
  true
);

do $privileges$
begin
  if not has_function_privilege(
    'authenticated',
    'public.task_command_atomic(text,jsonb)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute Task Commands';
  end if;
  if has_function_privilege(
    'anon',
    'public.task_command_atomic(text,jsonb)',
    'execute'
  ) then
    raise exception 'anonymous users can execute Task Commands';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.task_command_replay(text,jsonb)',
    'execute'
  ) then
    raise exception 'authenticated cannot replay Task Commands';
  end if;
  if has_function_privilege(
    'anon',
    'public.task_command_replay(text,jsonb)',
    'execute'
  ) then
    raise exception 'anonymous users can replay Task Commands';
  end if;
end
$privileges$;

-- Seed ordinary projections while the disposable runner role owns the table
-- grant; all command assertions below execute as authenticated.
insert into public.tasks (id, user_id, title, status, is_completed)
values
  (
    '68200000-0000-0000-0000-000000000101',
    '68200000-0000-0000-0000-000000000001',
    'Complete me',
    'todo',
    false
  ),
  (
    '68200000-0000-0000-0000-000000000102',
    '68200000-0000-0000-0000-000000000001',
    'Skip me',
    'todo',
    false
  ),
  (
    '68200000-0000-0000-0000-000000000103',
    '68200000-0000-0000-0000-000000000001',
    'Rollback me',
    'todo',
    false
  ),
  (
    '68200000-0000-0000-0000-000000000104',
    '68200000-0000-0000-0000-000000000001',
    'Edit me',
    'todo',
    false
  );

set local role authenticated;

do $edit$
declare
  outcome jsonb;
  retry_outcome jsonb;
  conflict_outcome jsonb;
begin
  outcome := public.task_command_atomic(
    'edit',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000104',
      'updates', jsonb_build_object(
        'title', 'Edited task',
        'priority', 2,
        'completion_difficulty', 1
      ),
      'idempotencyKey', 'task-edit-682'
    )
  );
  retry_outcome := public.task_command_atomic(
    'edit',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000104',
      'updates', jsonb_build_object(
        'title', 'Edited task',
        'priority', 2,
        'completion_difficulty', 1
      ),
      'idempotencyKey', 'task-edit-682'
    )
  );
  conflict_outcome := public.task_command_replay(
    'edit',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000104',
      'updates', jsonb_build_object(
        'title', 'Different task',
        'priority', 2,
        'completion_difficulty', 1
      ),
      'idempotencyKey', 'task-edit-682'
    )
  );
  if outcome->>'status' <> 'complete'
     or retry_outcome->>'status' <> 'already-applied'
     or conflict_outcome->>'status' <> 'conflict'
     or (select title from public.tasks
         where id = '68200000-0000-0000-0000-000000000104') <> 'Edited task'
     or (select priority from public.tasks
         where id = '68200000-0000-0000-0000-000000000104') <> 2
     or (select completion_difficulty from public.tasks
         where id = '68200000-0000-0000-0000-000000000104') <> 1 then
    raise exception 'Ordinary Task edit did not apply and replay atomically: %, %, %',
      outcome, retry_outcome, conflict_outcome;
  end if;
end
$edit$;

do $complete$
declare
  outcome jsonb;
  retry_outcome jsonb;
begin
  outcome := public.task_command_atomic(
    'complete',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000101',
      'idempotencyKey', 'task-complete-682'
    )
  );
  if outcome->>'status' <> 'complete'
     or outcome->'task'->>'id' <> '68200000-0000-0000-0000-000000000101'
     or (outcome->'task'->>'is_completed')::boolean is distinct from true
     or outcome->'task'->>'status' <> 'done' then
    raise exception 'Ordinary completion did not update the Task projection: %', outcome;
  end if;

  retry_outcome := public.task_command_atomic(
    'complete',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000101',
      'idempotencyKey', 'task-complete-682'
    )
  );
  if retry_outcome->>'status' <> 'already-applied'
     or retry_outcome->>'type' <> 'already-applied' then
    raise exception 'Ordinary completion replay was not idempotent: %', retry_outcome;
  end if;
end
$complete$;

do $reopen$
declare
  outcome jsonb;
begin
  outcome := public.task_command_atomic(
    'reopen',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000101',
      'idempotencyKey', 'task-reopen-682'
    )
  );
  if outcome->>'status' <> 'complete'
     or (select is_completed from public.tasks
         where id = '68200000-0000-0000-0000-000000000101')
         is distinct from false
     or (select status from public.tasks
         where id = '68200000-0000-0000-0000-000000000101') <> 'todo' then
    raise exception 'Ordinary reopening did not restore open Task state: %', outcome;
  end if;
end
$reopen$;

do $ownership$
declare
  outcome jsonb;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"68200000-0000-0000-0000-000000000002"}',
    true
  );
  outcome := public.task_command_atomic(
    'complete',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000002',
      'taskId', '68200000-0000-0000-0000-000000000101',
      'idempotencyKey', 'cross-owner-682'
    )
  );
  perform set_config(
    'request.jwt.claims',
    '{"sub":"68200000-0000-0000-0000-000000000001"}',
    true
  );
  if outcome <> jsonb_build_object('status', 'not-found', 'type', 'not-found') then
    raise exception 'Cross-owner Task Command was distinguishable: %', outcome;
  end if;
end
$ownership$;

savepoint task_command_rollback_682;
create function pg_temp.fail_task_command_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' then
    raise exception 'fixture forced Task Command rollback';
  end if;
  return new;
end
$$;
create trigger task_command_completion_failure
before update on public.tasks
for each row execute function pg_temp.fail_task_command_completion();

do $rollback$
declare
  failed boolean := false;
begin
  begin
    perform public.task_command_atomic(
      'complete',
      jsonb_build_object(
        'userId', '68200000-0000-0000-0000-000000000001',
        'taskId', '68200000-0000-0000-0000-000000000103',
        'idempotencyKey', 'task-rollback-682'
      )
    );
  exception when others then
    failed := true;
  end;
  if not failed
     or (select is_completed from public.tasks
         where id = '68200000-0000-0000-0000-000000000103')
         is distinct from false then
    raise exception 'Task Command failure did not roll back the ordinary write';
  end if;
end
$rollback$;

rollback to savepoint task_command_rollback_682;
do $rollback_hidden_state$
declare
  replay jsonb;
begin
  replay := public.task_command_replay(
    'complete',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000103',
      'idempotencyKey', 'task-rollback-682'
    )
  );
  if replay->>'status' <> 'not-found'
     or replay->>'type' <> 'not-found' then
    raise exception 'Task Command failure persisted hidden idempotency state: %', replay;
  end if;
end
$rollback_hidden_state$;
do $rollback_retry$
declare
  outcome jsonb;
begin
  outcome := public.task_command_atomic(
    'complete',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000103',
      'idempotencyKey', 'task-rollback-682'
    )
  );
  if outcome->>'status' <> 'complete'
     or (select is_completed from public.tasks
         where id = '68200000-0000-0000-0000-000000000103')
         is distinct from true then
    raise exception 'Task Command retry did not apply after rollback: %', outcome;
  end if;
end
$rollback_retry$;
release savepoint task_command_rollback_682;

do $skip$
declare
  outcome jsonb;
  retry_outcome jsonb;
  router_replay jsonb;
begin
  outcome := public.task_command_atomic(
    'skip',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000102',
      'idempotencyKey', 'task-skip-682'
    )
  );
  retry_outcome := public.task_command_atomic(
    'skip',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000102',
      'idempotencyKey', 'task-skip-682'
    )
  );
  router_replay := public.task_command_replay(
    'skip',
    jsonb_build_object(
      'userId', '68200000-0000-0000-0000-000000000001',
      'taskId', '68200000-0000-0000-0000-000000000102',
      'idempotencyKey', 'task-skip-682'
    )
  );
  if outcome->>'status' <> 'complete'
     or retry_outcome->>'status' <> 'already-applied'
     or router_replay->>'status' <> 'already-applied'
     or exists (select 1 from public.tasks
                where id = '68200000-0000-0000-0000-000000000102') then
    raise exception 'Ordinary skip did not delete and replay idempotently: %, %, %',
      outcome, retry_outcome, router_replay;
  end if;
end
$skip$;

rollback;
