-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('68800000-0000-0000-0000-000000000001','complete-owner@example.test');
select public.sql_fixture_create_auth_user('68800000-0000-0000-0000-000000000002','complete-other@example.test');
select set_config('request.jwt.claims','{"sub":"68800000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare task jsonb; event jsonb; preview jsonb; request jsonb; result jsonb;
  start_time timestamp := (now() at time zone 'UTC')+interval '1 day';
begin
  task := public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Video"}')->'task';
  event := public.calendar_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Tomorrow',
    'start_date',start_time::date,'start_time',to_char(start_time,'HH24:MI:SS'),'end_date',(start_time+interval '1 hour')::date,
    'end_time',to_char(start_time+interval '1 hour','HH24:MI:SS'),'timezone','UTC','task_id',task->>'id','is_protected',false))->'event';
  preview := public.planner_completion_preview((task->>'id')::uuid);
  request := jsonb_build_object('operation','complete','operationId',gen_random_uuid(),'taskId',task->>'id','expectedVersion',task->>'version','plan',preview->'plan');
  begin
    result := public.planner_command(request);
    if result->>'status'<>'complete' then raise exception 'completion failed %',result; end if;
    raise exception using errcode='PT499',message='simulated transaction failure';
  exception when sqlstate 'PT499' then null;
  end;
  if exists(select 1 from public.planner_changes) or exists(select 1 from public.planner_command_receipts) then raise exception 'partial history'; end if;
  if (select to_jsonb(t) from public.tasks t where id=(task->>'id')::uuid) is distinct from task then raise exception 'partial task'; end if;
  if (select to_jsonb(e) from public.calendar_events e where id=(event->>'id')::uuid) is distinct from event then raise exception 'partial release'; end if;
  result := public.planner_command(request);
  if result->>'status'<>'complete' or public.planner_command(request)->>'status'<>'already-applied' then raise exception 'completion/replay failed'; end if;
  if exists(select 1 from public.calendar_events where id=(event->>'id')::uuid) then raise exception 'future not released'; end if;
  if (select count(*) from public.planner_changes)<>1 then raise exception 'multiple change records'; end if;
  if not exists(select 1 from public.planner_event_versions where event_id=(event->>'id')::uuid) then raise exception 'missing tombstone version'; end if;
  perform set_config('request.jwt.claims','{"sub":"68800000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if public.planner_command(request)->>'status'<>'not-found' or exists(select 1 from public.planner_changes) or exists(select 1 from public.planner_event_versions) then raise exception 'cross-owner completion/history'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"68800000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare task jsonb; preview jsonb; result jsonb; event_id uuid := gen_random_uuid(); recurring_id uuid := gen_random_uuid();
  boundary_id uuid := gen_random_uuid(); boundary timestamp := date_trunc('second',statement_timestamp() at time zone 'UTC')+interval '1 second';
  local_end timestamp := (statement_timestamp() at time zone 'America/Los_Angeles')+interval '1 hour';
begin
  update public.profiles set timezone='America/Los_Angeles' where id='68800000-0000-0000-0000-000000000001'::uuid;
  set local role authenticated;
  task := public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Legacy eligibility"}')->'task';
  reset role;
  insert into public.calendar_events(id,user_id,title,task_id,start_date,start_time,end_date,end_time,timezone,app_owned,is_protected)
    values(event_id,'68800000-0000-0000-0000-000000000001'::uuid,'NULL zone', (task->>'id')::uuid,local_end::date,(local_end-interval '30 minutes')::time,local_end::date,local_end::time,null,true,false),
    (boundary_id,'68800000-0000-0000-0000-000000000001'::uuid,'Boundary',(task->>'id')::uuid,boundary::date,boundary::time,boundary::date,(boundary+interval '1 hour')::time,'UTC',true,false);
  insert into public.calendar_events(id,user_id,title,task_id,start_date,start_time,end_date,end_time,timezone,app_owned,is_protected,is_recurring,recurrence_rule)
    values(recurring_id,'68800000-0000-0000-0000-000000000001'::uuid,'Recurring',(task->>'id')::uuid,local_end::date,(local_end-interval '30 minutes')::time,local_end::date,local_end::time,null,true,false,true,'{"frequency":"daily","interval":1}');
  set local role authenticated;
  preview := public.planner_completion_preview((task->>'id')::uuid);
  if jsonb_array_length(preview->'plan')<>2 then raise exception 'NULL zone or recurrence eligibility differs'; end if;
  -- Cross the boundary inside one statement: validation and effects must retain the same cutoff.
  perform pg_sleep(2);
  result := public.planner_command(jsonb_build_object('operation','complete','operationId',gen_random_uuid(),'taskId',task->>'id','expectedVersion',task->>'version','plan',preview->'plan'));
  if result->>'status' is distinct from 'complete' then raise exception 'boundary completion failed %',result; end if;
  reset role;
  if exists(select 1 from public.calendar_events where id in(event_id,boundary_id)) then raise exception 'accepted release changed to end'; end if;
  update public.calendar_events set title='Recurring preserved' where id=recurring_id;
  begin
    insert into public.calendar_events(user_id,title,task_id,start_date,start_time,end_date,end_time,timezone,app_owned,is_protected)
      values('68800000-0000-0000-0000-000000000001'::uuid,'Forbidden NULL zone',(task->>'id')::uuid,local_end::date,(local_end-interval '30 minutes')::time,local_end::date,local_end::time,null,true,false);
    raise exception 'completed task acquired profile-zone reservation';
  exception when sqlstate 'PT409' then null;
  end;
end $$;
rollback;
