-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('69900000-0000-0000-0000-000000000001','undo-owner@example.test');
select set_config('request.jwt.claims','{"sub":"69900000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare owner_id uuid := '69900000-0000-0000-0000-000000000001';
  task jsonb; event jsonb; preview jsonb; result jsonb; change public.planner_changes; undo_request jsonb;
  before_reminders jsonb; completed_task jsonb; restored_event public.calendar_events;
  tomorrow timestamp := (statement_timestamp() at time zone 'UTC')+interval '1 day'; category_id uuid := gen_random_uuid();
begin
  set local role authenticated;
  task := public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Original title"}')->'task';
  event := public.calendar_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Tomorrow',
    'start_date',tomorrow::date,'start_time',to_char(tomorrow,'HH24:MI:SS'),'end_date',tomorrow::date,
    'end_time',to_char(tomorrow+interval '1 hour','HH24:MI:SS'),'timezone','UTC','task_id',task->>'id','is_protected',false))->'event';
  perform public.update_calendar_event_with_reminders(owner_id,(event->>'id')::uuid,'{}',
    '[{"reminder_type":"relative","relative_minutes":10,"channels":["push"]},{"reminder_type":"relative","relative_minutes":20,"channels":["push"]}]');
  select jsonb_agg(to_jsonb(r) order by id) into before_reminders from public.reminders r where source_id=(event->>'id')::uuid;
  -- A legacy mixed edit must restore its full task state, not only completion.
  set local role authenticated;
  update public.tasks set title='Edited and completed',is_completed=true where id=(task->>'id')::uuid;
  select * into change from public.planner_changes where after_state->'task'->>'id'=task->>'id';
  select to_jsonb(t) into completed_task from public.tasks t where id=(task->>'id')::uuid;
  undo_request := jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version);
  begin
    result := public.planner_command(undo_request);
    if result->>'status' is distinct from 'complete' then raise exception 'undo failed %',result; end if;
    raise exception using errcode='PT499',message='simulated enclosing transaction failure';
  exception when sqlstate 'PT499' then null;
  end;
  if exists(select 1 from public.calendar_events where id=(event->>'id')::uuid) or exists(select 1 from public.reminders where source_id=(event->>'id')::uuid)
    or exists(select 1 from public.planner_command_receipts where operation_id=(undo_request->>'operationId')::uuid)
    or (select undone_at from public.planner_changes where id=change.id) is not null
    or (select to_jsonb(t) from public.tasks t where id=(task->>'id')::uuid) is distinct from completed_task then raise exception 'partial rollback'; end if;
  if public.planner_command(undo_request)->>'status' is distinct from 'complete' then raise exception 'undo retry failed'; end if;
  if public.planner_command(undo_request)->>'status' is distinct from 'already-applied' then raise exception 'undo replay failed'; end if;
  if (select title from public.tasks where id=(task->>'id')::uuid) is distinct from 'Original title' then raise exception 'mixed edit not restored'; end if;
  if (select jsonb_agg(to_jsonb(r) order by id) from public.reminders r where source_id=(event->>'id')::uuid) is distinct from before_reminders then raise exception 'reminder intent/history not restored'; end if;
  select * into restored_event from public.calendar_events where id=(event->>'id')::uuid;
  if restored_event.version=(event->>'version')::uuid then raise exception 'restored version reused'; end if;
  -- Delete/recreate/delete of a released ID must invalidate its tombstone.
  select to_jsonb(t) into task from public.tasks t where id=(task->>'id')::uuid;
  preview := public.planner_completion_preview((task->>'id')::uuid);
  result := public.planner_command(jsonb_build_object('operation','complete','operationId',gen_random_uuid(),'taskId',task->>'id','expectedVersion',task->>'version','plan',preview->'plan'));
  select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
  reset role;
  restored_event.is_protected := true;
  insert into public.calendar_events select (restored_event).*;
  delete from public.calendar_events where id=restored_event.id;
  set local role authenticated;
  result := public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version));
  if result->>'status' is distinct from 'conflict' or not (select is_completed from public.tasks where id=(task->>'id')::uuid) then raise exception 'recreated release overwrote state'; end if;
  -- A missing restored FK fails after the task update; the function must roll it back.
  task := public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Atomic failure"}')->'task';
  reset role;
  insert into public.categories(id,user_id,name,color) values(category_id,owner_id,'Temporary','#123456');
  insert into public.calendar_events(user_id,title,task_id,category_id,start_date,start_time,end_date,end_time,timezone,app_owned,is_protected)
    values(owner_id,'Released category',(task->>'id')::uuid,category_id,tomorrow::date,tomorrow::time,tomorrow::date,(tomorrow+interval '1 hour')::time,'UTC',true,false);
  set local role authenticated;
  preview := public.planner_completion_preview((task->>'id')::uuid);
  result := public.planner_command(jsonb_build_object('operation','complete','operationId',gen_random_uuid(),'taskId',task->>'id','expectedVersion',task->>'version','plan',preview->'plan'));
  select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
  select to_jsonb(t) into completed_task from public.tasks t where id=(task->>'id')::uuid;
  reset role;
  delete from public.categories where id=category_id;
  set local role authenticated;
  undo_request := jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version);
  result := public.planner_command(undo_request);
  if result->>'status' is distinct from 'conflict' or (select to_jsonb(t) from public.tasks t where id=(task->>'id')::uuid) is distinct from completed_task
    or exists(select 1 from public.calendar_events where task_id=(task->>'id')::uuid)
    or exists(select 1 from public.planner_command_receipts where operation_id=(undo_request->>'operationId')::uuid)
    or (select undone_at from public.planner_changes where id=change.id) is not null then raise exception 'partial FK failure restoration'; end if;
end $$;
rollback;
