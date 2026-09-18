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
rollback;
