-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('69300000-0000-0000-0000-000000000001','collection-owner@example.test');
select public.sql_fixture_create_auth_user('69300000-0000-0000-0000-000000000002','collection-other@example.test');
select set_config('request.jwt.claims','{"sub":"69300000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;

do $$
declare project jsonb; task jsonb; result jsonb; request jsonb; change_record jsonb;
  completed_project jsonb; completed_task jsonb; facts jsonb; rules jsonb;
begin
  project := public.project_capture_command('create',gen_random_uuid(),null,null,'{"name":"Garden"}')->'project';
  result := public.planner_command(jsonb_build_object('operation','complete-project','operationId',gen_random_uuid(),'projectId',project->>'id','expectedVersion',project->>'version'));
  if result->>'status' is distinct from 'complete' then raise exception 'empty project completion: %',result; end if;
  select to_jsonb(p) into completed_project from public.projects p where id=(project->>'id')::uuid;
  request := jsonb_build_object('operation','reopen-project','operationId',gen_random_uuid(),'projectId',project->>'id','expectedVersion',completed_project->>'version');
  result := public.planner_command(request);
  if result->>'status' is distinct from 'complete' or public.planner_command(request)->>'status' is distinct from 'already-applied' then raise exception 'project reopening/replay: %',result; end if;
  select to_jsonb(c) into change_record from public.planner_changes c where id=(result->>'changeId')::uuid;
  result := public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change_record->>'id','expectedVersion',change_record->>'version'));
  if result->>'status' is distinct from 'complete' then raise exception 'project reopening Undo: %',result; end if;
  select to_jsonb(p) into project from public.projects p where id=(project->>'id')::uuid;
  if project->>'completed_at' is distinct from completed_project->>'completed_at' then raise exception 'project timestamp changed'; end if;
  result := public.task_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Plant seeds','project_id',project->>'id','expected_project_version',project->>'version'));
  if result->>'status' is distinct from 'complete' then raise exception 'child creation: %',result; end if;
  task := result->'task';
  select to_jsonb(p) into project from public.projects p where id=(project->>'id')::uuid;
  if project->>'completed_at' is not null then raise exception 'new child did not reopen parent'; end if;
  result := public.planner_command(jsonb_build_object('operation','complete-project','operationId',gen_random_uuid(),'projectId',project->>'id','expectedVersion',project->>'version'));
  if result->>'status' is distinct from 'conflict' then raise exception 'open-child completion guard: %',result; end if;
  result := public.planner_command(jsonb_build_object('operation','complete','operationId',gen_random_uuid(),'taskId',task->>'id','expectedVersion',task->>'version','plan','[]'::jsonb));
  if result->>'status' is distinct from 'complete' then raise exception 'child completion: %',result; end if;
  select to_jsonb(t) into completed_task from public.tasks t where id=(task->>'id')::uuid;
  result := public.planner_command(jsonb_build_object('operation','complete-project','operationId',gen_random_uuid(),'projectId',project->>'id','expectedVersion',project->>'version'));
  if result->>'status' is distinct from 'complete' then raise exception 'resolved project completion: %',result; end if;
  result := public.planner_command(jsonb_build_object('operation','reopen','operationId',gen_random_uuid(),'taskId',task->>'id','expectedVersion',completed_task->>'version'));
  if result->>'status' is distinct from 'complete' then raise exception 'child reopening: %',result; end if;
  if (select completed_at from public.projects where id=(project->>'id')::uuid) is not null then raise exception 'reopened child did not reopen parent'; end if;
  select to_jsonb(c) into change_record from public.planner_changes c where id=(result->>'changeId')::uuid;
  result := public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change_record->>'id','expectedVersion',change_record->>'version'));
  if result->>'status' is distinct from 'complete' then raise exception 'child reopening Undo: %',result; end if;
  if (select completed_at::text from public.tasks where id=(task->>'id')::uuid)::timestamptz is distinct from (completed_task->>'completed_at')::timestamptz
    or (select completed_at from public.projects where id=(project->>'id')::uuid) is null then raise exception 'Undo lost task timestamp or parent completion'; end if;

  task := public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Later"}')->'task';
  request := jsonb_build_object('operation','rules','operationId',gen_random_uuid(),'taskId',task->>'id','expectedTaskVersion',task->>'version','expectedVersion',null,
    'waiting',false,'timezone','America/Los_Angeles','windows','[]'::jsonb,'dependencyIds','[]'::jsonb,'availableAfter','2026-09-21');
  result := public.action_queue_command(request);
  if result->>'status' is distinct from 'complete' then raise exception 'date rule: %',result; end if;
  select value into facts from jsonb_array_elements(public.action_queue_snapshot('2026-09-21T06:59:59Z')->'tasks') where value->>'id'=task->>'id';
  if facts->'facts'->>'actionable' is distinct from 'false' or not (facts->'facts'->'reasons' ? 'deferred') then raise exception 'date did not defer task: %',facts; end if;
  rules := facts->'rules';
  select value into facts from jsonb_array_elements(public.action_queue_snapshot('2026-09-21T07:00:00Z')->'tasks') where value->>'id'=task->>'id';
  if facts->'facts'->>'actionable' is distinct from 'true' then raise exception 'local midnight did not release task'; end if;
  request := (request-'availableAfter') || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',rules->>'version');
  result := public.action_queue_command(request);
  if result->>'status' is distinct from 'complete' or (select available_after from public.task_action_rules where task_id=(task->>'id')::uuid) is distinct from date '2026-09-21' then raise exception 'legacy command lost date'; end if;
  perform set_config('request.jwt.claims','{"sub":"69300000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists(select 1 from public.task_action_rules) or exists(select 1 from public.planner_changes) then raise exception 'cross-owner read'; end if;
  result := public.planner_command(jsonb_build_object('operation','reopen-project','operationId',gen_random_uuid(),'projectId',project->>'id','expectedVersion',project->>'version'));
  if result->>'status' is distinct from 'not-found' then raise exception 'cross-owner reopening'; end if;
end $$;
rollback;
