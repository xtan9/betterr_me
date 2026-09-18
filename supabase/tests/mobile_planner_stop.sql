-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('68700000-0000-0000-0000-000000000001','stop-owner@example.test');
select public.sql_fixture_create_auth_user('68700000-0000-0000-0000-000000000002','stop-other@example.test');
select set_config('request.jwt.claims','{"sub":"68700000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare task jsonb; event jsonb; request jsonb; result jsonb; stopped public.calendar_events;
  from_time timestamp := (now() at time zone 'UTC')-interval '40 minutes';
  to_time timestamp := (now() at time zone 'UTC')+interval '40 minutes';
begin
  task := public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Video"}')->'task';
  event := public.calendar_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Video',
    'start_date',from_time::date,'start_time',to_char(from_time,'HH24:MI:SS'),'end_date',to_time::date,'end_time',to_char(to_time,'HH24:MI:SS'),
    'timezone','UTC','task_id',task->>'id','is_protected',false))->'event';
  request := jsonb_build_object('operation','stop','operationId',gen_random_uuid(),'eventId',event->>'id','expectedVersion',event->>'version');
  -- A transaction failure after the command must roll back its entire linked effect.
  begin
    result := public.planner_command(request);
    if result->>'status'<>'complete' then raise exception 'stop failed %',result; end if;
    raise exception using errcode='PT499',message='simulated caller failure';
  exception when sqlstate 'PT499' then null;
  end;
  if exists(select 1 from public.work_sessions) or exists(select 1 from public.planner_changes)
    or exists(select 1 from public.planner_command_receipts) then raise exception 'partial history survived rollback'; end if;
  select * into stopped from public.calendar_events where id=(event->>'id')::uuid;
  if to_jsonb(stopped)<>event then raise exception 'partial event survived rollback'; end if;
  result := public.planner_command(request);
  if result->>'status'<>'complete' then raise exception 'stop failed %',result; end if;
  if public.planner_command(request)->>'status'<>'already-applied' then raise exception 'retry failed'; end if;
  if (select count(*) from public.work_sessions)<>1 or (select count(*) from public.planner_changes)<>1 then raise exception 'duplicate effect'; end if;
  if exists(select 1 from public.planner_changes where before_state->'task' is distinct from task or after_state->'task' is distinct from task) then raise exception 'task version missing from undo contract'; end if;
  if public.planner_command(request||jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',gen_random_uuid()))->>'status'<>'conflict' then raise exception 'stale stop accepted'; end if;
  if exists(select 1 from public.work_sessions where actual_start is not null or worked_seconds is not null) then raise exception 'invented work'; end if;
  if (select to_jsonb(t) from public.tasks t where id=(task->>'id')::uuid)<>task then raise exception 'task changed'; end if;
  select * into stopped from public.calendar_events where id=(event->>'id')::uuid;
  if public.planner_command(request||jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',stopped.version))->>'status'<>'conflict' then raise exception 'already-ended instant stopped twice'; end if;
  perform set_config('request.jwt.claims','{"sub":"68700000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists(select 1 from public.work_sessions) or exists(select 1 from public.planner_changes) or exists(select 1 from public.planner_command_receipts) then raise exception 'history leaked'; end if;
  if public.planner_command(request)->>'status'<>'not-found' then raise exception 'foreign stop'; end if;
end $$;
rollback;
