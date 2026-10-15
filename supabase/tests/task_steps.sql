-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('61500000-0000-0000-0000-000000000001','steps-owner@example.test');
select public.sql_fixture_create_auth_user('61500000-0000-0000-0000-000000000002','steps-other@example.test');
select set_config('request.jwt.claims','{"sub":"61500000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;

do $$
declare owner_id uuid:=auth.uid(); parent jsonb; task jsonb; result jsonb; command_request jsonb; change public.planner_changes;
  checklist jsonb:=jsonb_build_array(
    jsonb_build_object('id',gen_random_uuid(),'title','Wake up','checked',false),
    jsonb_build_object('id',gen_random_uuid(),'title','Brush teeth','checked',false),
    jsonb_build_object('id',gen_random_uuid(),'title','Breakfast','checked',false));
  release_id uuid:=gen_random_uuid(); protected_id uuid:=gen_random_uuid(); sibling_id uuid:=gen_random_uuid();
  before_task jsonb; before_events jsonb; history_count integer;
begin
  parent:=public.project_capture_command('create',gen_random_uuid(),null,null,'{"name":"Wellbeing"}')->'project';
  result:=public.task_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Morning',
    'project_id',parent->>'id','expected_project_version',parent->>'version','steps',checklist));
  if result->>'status' is distinct from 'complete' then raise exception 'Step capture: %',result; end if;
  task:=result->'task';
  if task->'steps' is distinct from checklist then raise exception 'Step order/identity lost'; end if;
  insert into public.calendar_events(id,user_id,title,task_id,start_date,end_date,start_time,end_time,timezone,app_owned,is_protected)
    values(release_id,owner_id,'Exact task',(task->>'id')::uuid,'2090-01-01','2090-01-01','09:00','10:00','UTC',true,false),
      (protected_id,owner_id,'Protected',(task->>'id')::uuid,'2090-01-02','2090-01-02','09:00','10:00','UTC',true,true),
      (sibling_id,owner_id,'Unrelated',null,'2090-01-03','2090-01-03','09:00','10:00','UTC',true,false);
  for i in 0..1 loop
    command_request:=jsonb_build_object('operation','check-step','operationId',gen_random_uuid(),'taskId',task->>'id',
      'expectedVersion',task->>'version','stepId',checklist->i->>'id','checked',true);
    result:=public.planner_command(command_request);
    if result->>'status' is distinct from 'complete' then raise exception 'Partial step: %',result; end if;
    if public.planner_command(command_request)->>'status' is distinct from 'already-applied' then raise exception 'Step replay failed'; end if;
    if public.planner_command(command_request||'{"checked":false}')->>'status' is distinct from 'conflict' then raise exception 'Changed payload replay accepted'; end if;
    select to_jsonb(t) into task from public.tasks t where id=(task->>'id')::uuid;
    if (task->>'is_completed')::boolean or not exists(select 1 from public.calendar_events where id=release_id) then raise exception 'Partial step changed parent/calendar'; end if;
  end loop;
  before_task:=task;
  select jsonb_agg(to_jsonb(e) order by id) into before_events from public.calendar_events e;
  select count(*) into history_count from public.planner_changes;
  command_request:=jsonb_build_object('operation','check-step','operationId',gen_random_uuid(),'taskId',task->>'id',
    'expectedVersion',task->>'version','stepId',checklist->2->>'id','checked',true);
  begin
    result:=public.planner_command(command_request);
    if result->>'status' is distinct from 'complete' then raise exception 'Completion failed: %',result; end if;
    raise exception using errcode='PT499',message='Simulated enclosing transaction failure';
  exception when sqlstate 'PT499' then null;
  end;
  if (select to_jsonb(t) from public.tasks t where id=(task->>'id')::uuid) is distinct from before_task
    or (select jsonb_agg(to_jsonb(e) order by id) from public.calendar_events e) is distinct from before_events
    or (select count(*) from public.planner_changes)<>history_count
    or exists(select 1 from public.planner_command_receipts where operation_id=(command_request->>'operationId')::uuid)
    then raise exception 'Failed Step command left partial state'; end if;
  result:=public.planner_command(command_request);
  if result->>'status' is distinct from 'complete' then raise exception 'Final step: %',result; end if;
  select to_jsonb(t) into task from public.tasks t where id=(task->>'id')::uuid;
  if not (task->>'is_completed')::boolean or exists(select 1 from jsonb_array_elements(task->'steps') s where not (s->>'checked')::boolean)
    or exists(select 1 from public.calendar_events where id=release_id)
    or not exists(select 1 from public.calendar_events where id=protected_id)
    or not exists(select 1 from public.calendar_events where id=sibling_id)
    or (select completed_at from public.projects where id=(parent->>'id')::uuid) is not null
    then raise exception 'Final step broke linked completion effects'; end if;
  select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
  result:=public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version));
  if result->>'status' is distinct from 'complete' then raise exception 'Step completion Undo: %',result; end if;
  select to_jsonb(t) into task from public.tasks t where id=(task->>'id')::uuid;
  if (task->>'is_completed')::boolean or task->'steps' is distinct from before_task->'steps'
    or not exists(select 1 from public.calendar_events where id=release_id) then raise exception 'Undo lost partial checklist or reservation'; end if;
  -- Older clients patch unrelated fields without supplying a checklist.
  result:=public.task_capture_command('edit',gen_random_uuid(),(task->>'id')::uuid,(task->>'version')::uuid,'{"estimate_minutes":20}');
  task:=result->'task';
  if task->'steps' is distinct from before_task->'steps' then raise exception 'Legacy edit erased Steps'; end if;
  -- Existing ordinary web/AI completion writes use the same normalization.
  update public.tasks set is_completed=true where id=(task->>'id')::uuid;
  select to_jsonb(t) into task from public.tasks t where id=(task->>'id')::uuid;
  if exists(select 1 from jsonb_array_elements(task->'steps') s where not (s->>'checked')::boolean) then raise exception 'Shared completion bypassed Steps'; end if;
  perform set_config('betterr.steps_write','off',true);
  perform set_config('betterr.recurring_lifecycle','off',true);
  begin
    update public.tasks set steps='[]'::jsonb where id=(task->>'id')::uuid;
    raise exception 'Raw checklist write accepted';
  exception when check_violation then null;
  end;
  result:=public.task_capture_command('edit',gen_random_uuid(),(task->>'id')::uuid,(task->>'version')::uuid,
    jsonb_build_object('steps',jsonb_build_array(checklist->0,checklist->0)));
  if result->>'status' is distinct from 'invalid-transition' then raise exception 'Duplicate Step identities accepted'; end if;
  result:=public.task_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Invalid',
    'steps',jsonb_build_array((checklist->0)||jsonb_build_object('steps','[]'::jsonb))));
  if result->>'status' is distinct from 'invalid-transition' then raise exception 'Nested Steps accepted'; end if;
  perform set_config('request.jwt.claims','{"sub":"61500000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists(select 1 from public.tasks where id=(task->>'id')::uuid) then raise exception 'Foreign checklist read'; end if;
  result:=public.planner_command(jsonb_build_object('operation','check-step','operationId',gen_random_uuid(),'taskId',task->>'id',
    'expectedVersion',task->>'version','stepId',checklist->0->>'id','checked',false));
  if result->>'status' is distinct from 'not-found' then raise exception 'Foreign checklist mutation accepted'; end if;
end $$;
rollback;
