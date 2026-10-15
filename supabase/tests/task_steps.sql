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
select set_config('request.jwt.claims','{"sub":"61500000-0000-0000-0000-000000000001","role":"authenticated"}',true);

-- Checklist transitions use the same occurrence ledger as parent completion.
do $$
declare result jsonb; row jsonb; prior_steps jsonb; change public.planner_changes;
  checklist jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'title','First','checked',false),
    jsonb_build_object('id',gen_random_uuid(),'title','Second','checked',false));
begin
  result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),
    'title','Routine checklist','date','2090-03-13','startTime','09:00','endTime','10:00','timezone','UTC',
    'protected',false,'rule','{"frequency":"daily","interval":1}'::jsonb,'steps',checklist));
  if result->>'status' is distinct from 'complete' then raise exception 'Routine creation: %',result; end if;
  row:=public.planner_routine_snapshot('2090-03-13')->'rows'->0;
  for i in 0..1 loop
    result:=public.planner_command(jsonb_build_object('operation','check-step','operationId',gen_random_uuid(),
      'taskId',row->'task'->>'id','expectedVersion',row->'task'->>'version','stepId',checklist->i->>'id','checked',true));
    if result->>'status' is distinct from 'complete' then raise exception 'Routine final Step: %',result; end if;
    row:=public.planner_routine_snapshot('2090-03-13')->'rows'->0;
  end loop;
  if row->'occurrence'->>'state' is distinct from 'completed' then raise exception 'Routine ledger not completed'; end if;
  select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
  result:=public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version));
  if result->>'status' is distinct from 'complete' then raise exception 'Routine final Step Undo: %',result; end if;
  row:=public.planner_routine_snapshot('2090-03-13')->'rows'->0;
  if row->'occurrence'->>'state' is distinct from 'open' or row->'task'->'steps'->0->>'checked'<>'true'
    or row->'task'->'steps'->1->>'checked'<>'false' or row->'event'->>'id' is null then raise exception 'Routine Undo lost progress/reservation'; end if;
  result:=public.planner_command(jsonb_build_object('operation','check-step','operationId',gen_random_uuid(),
    'taskId',row->'task'->>'id','expectedVersion',row->'task'->>'version','stepId',checklist->1->>'id','checked',true));
  row:=public.planner_routine_snapshot('2090-03-13')->'rows'->0;
  prior_steps:=row->'task'->'steps';
  result:=public.task_capture_command('edit',gen_random_uuid(),(row->'task'->>'id')::uuid,(row->'task'->>'version')::uuid,
    jsonb_build_object('steps',jsonb_build_array(prior_steps->1||'{"title":"Renamed"}'::jsonb)));
  if result->>'status' is distinct from 'complete' or not (result->'task'->>'is_completed')::boolean then raise exception 'Completed Steps structural edit: %',result; end if;
  select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
  result:=public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version));
  if result->>'status' is distinct from 'complete' then raise exception 'Completed Steps structural Undo: %',result; end if;
  row:=public.planner_routine_snapshot('2090-03-13')->'rows'->0;
  if row->'occurrence'->>'state' is distinct from 'completed' or row->'task'->'steps' is distinct from prior_steps then raise exception 'Completed structural Undo changed state'; end if;
end $$;

-- A newly checked Step also counts as checking, while deletion alone does not.
do $$
declare result jsonb; task jsonb; change public.planner_changes;
  checklist jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'title','Done','checked',true));
begin
  task:=public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Empty checklist"}')->'task';
  result:=public.task_capture_command('edit',gen_random_uuid(),(task->>'id')::uuid,(task->>'version')::uuid,jsonb_build_object('steps',checklist));
  if result->>'status' is distinct from 'complete' or not (result->'task'->>'is_completed')::boolean then raise exception 'New checked Step failed to complete: %',result; end if;
  result:=public.task_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Priority checklist','priority',3,'steps',checklist));
  if result->>'status' is distinct from 'complete' or result->'task'->>'priority'<>'3' or not (result->'task'->>'is_completed')::boolean then raise exception 'Atomic priority/Steps: %',result; end if;
  select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
  result:=public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version));
  if result->>'status' is distinct from 'complete' then raise exception 'Atomic priority/Steps Undo: %',result; end if;
end $$;

-- An intervening project completion prevents Undo from restoring an open child.
do $$
declare parent jsonb; task jsonb; result jsonb; change public.planner_changes;
  checklist jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'title','First','checked',false));
begin
  parent:=public.project_capture_command('create',gen_random_uuid(),null,null,'{"name":"Former project"}')->'project';
  task:=public.task_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Move this',
    'project_id',parent->>'id','expected_project_version',parent->>'version','steps',checklist))->'task';
  result:=public.task_capture_command('edit',gen_random_uuid(),(task->>'id')::uuid,(task->>'version')::uuid,
    jsonb_build_object('project_id',null,'steps',jsonb_build_array(checklist->0||'{"title":"Renamed"}'::jsonb)));
  if result->>'status' is distinct from 'complete' then raise exception 'Combined move/Steps: %',result; end if;
  select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
  select to_jsonb(p) into parent from public.projects p where id=(parent->>'id')::uuid;
  result:=public.planner_command(jsonb_build_object('operation','complete-project','operationId',gen_random_uuid(),
    'projectId',parent->>'id','expectedVersion',parent->>'version'));
  if result->>'status' is distinct from 'complete' then raise exception 'Complete emptied project: %',result; end if;
  result:=public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version));
  if result->>'status' is distinct from 'conflict' then raise exception 'Steps Undo silently reopened project: %',result; end if;
  if (select completed_at from public.projects where id=(parent->>'id')::uuid) is null
    or (select project_id from public.tasks where id=(task->>'id')::uuid) is not null then raise exception 'Conflicting Undo changed project assignment'; end if;
end $$;
-- A combined occurrence edit can create a missing reservation. Undo may remove
-- it only while its event and reminder state still matches the saved operation.
do $$
declare row jsonb; result jsonb; change public.planner_changes; event_id uuid;
  checklist jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'title','One','checked',false));
begin
  result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),
    'title','Reservation checklist','date','2090-04-13','startTime','09:00','endTime','10:00','timezone','UTC',
    'protected',false,'rule','{"frequency":"daily","interval":1}'::jsonb,'steps',checklist));
  select value into row from jsonb_array_elements(public.planner_routine_snapshot('2090-04-13')->'rows')
    where value->'series'->>'id'=result->>'seriesId';
  perform public.delete_calendar_event_with_reminders(auth.uid(),(row->'event'->>'id')::uuid);
  result:=public.planner_routine_command(jsonb_build_object('operation','edit','operationId',gen_random_uuid(),
    'seriesId',row->'series'->>'id','occurrenceId',row->'occurrence'->>'id',
    'expectedSeriesToken',row->'series'->'revision_token','expectedOccurrenceVersion',row->'occurrence'->>'version',
    'expectedTaskVersion',row->'task'->>'version','title','Edited reservation','date','2090-04-13',
    'startTime','09:15','endTime','10:15','steps',jsonb_build_array(checklist->0||'{"title":"Renamed"}'::jsonb)));
  if result->>'status' is distinct from 'complete' then raise exception 'Missing reservation edit: %',result; end if;
  select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
  event_id:=(change.after_state->'createdEvents'->0->>'id')::uuid;
  if event_id is null or jsonb_array_length(change.after_state->'eventVersions')<>1 then raise exception 'Missing reservation Undo snapshot'; end if;
  perform public.update_calendar_event_with_reminders(auth.uid(),event_id,'{}'::jsonb,
    '[{"reminder_type":"relative","relative_minutes":5,"channels":["push"]}]'::jsonb);
  result:=public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version));
  if result->>'status' is distinct from 'conflict' then raise exception 'Undo deleted intervening reminder: %',result; end if;
  if not exists(select 1 from public.calendar_events where id=event_id)
    or not exists(select 1 from public.reminders where source_type='calendar_event' and source_id=event_id) then raise exception 'Conflicting Undo removed reservation/reminder'; end if;
end $$;
do $$
declare row jsonb; result jsonb; change public.planner_changes; series_id uuid; reminder_before jsonb; request jsonb;
  checklist jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'title','Finish','checked',false));
begin
  result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),
    'title','Protected final Step','date','2090-05-13','startTime','09:00','endTime','10:00','timezone','UTC',
    'protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb,'steps',checklist));
  series_id:=(result->>'seriesId')::uuid;
  select value into row from jsonb_array_elements(public.planner_routine_snapshot('2090-05-13')->'rows') where value->'series'->>'id'=series_id::text;
  reminder_before:=public.update_calendar_event_with_reminders(auth.uid(),(row->'event'->>'id')::uuid,'{}'::jsonb,
    '[{"reminder_type":"relative","relative_minutes":5,"channels":["push"]}]'::jsonb)->'reminders'->0;
  select value into row from jsonb_array_elements(public.planner_routine_snapshot('2090-05-13')->'rows') where value->'series'->>'id'=series_id::text;
  request:=jsonb_build_object('operation','edit','operationId',gen_random_uuid(),'seriesId',series_id,
    'occurrenceId',row->'occurrence'->>'id','expectedSeriesToken',row->'series'->'revision_token',
    'expectedOccurrenceVersion',row->'occurrence'->>'version','expectedTaskVersion',row->'task'->>'version',
    'expectedEventVersion',row->'event'->>'version','title','Adjusted protected','date','2090-05-13',
    'startTime','09:30','endTime','10:30','steps',jsonb_build_array(checklist->0||'{"checked":true}'::jsonb));
  result:=public.planner_routine_command(request);
  if result->>'status' is distinct from 'complete' then raise exception 'Combined protected completion: %',result; end if;
  select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
  result:=public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version));
  if result->>'status' is distinct from 'complete' then raise exception 'Combined protected Undo: %',result; end if;
  if (select fire_at from public.reminders where id=(reminder_before->>'id')::uuid) is distinct from (reminder_before->>'fire_at')::timestamptz
    or (select start_time from public.calendar_events where id=(row->'event'->>'id')::uuid)<>time '09:00' then raise exception 'Combined Undo lost reservation/reminder time'; end if;
  select value into row from jsonb_array_elements(public.planner_routine_snapshot('2090-05-13')->'rows') where value->'series'->>'id'=series_id::text;
  result:=public.planner_routine_command(request||jsonb_build_object('operationId',gen_random_uuid(),
    'expectedOccurrenceVersion',row->'occurrence'->>'version','expectedTaskVersion',row->'task'->>'version','expectedEventVersion',row->'event'->>'version'));
  select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
  perform public.update_calendar_event_with_reminders(auth.uid(),(row->'event'->>'id')::uuid,'{"title":"Later edit"}'::jsonb,null);
  result:=public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version));
  if result->>'status' is distinct from 'conflict' then raise exception 'Combined completion Undo overwrote protected edit: %',result; end if;
end $$;
rollback;
