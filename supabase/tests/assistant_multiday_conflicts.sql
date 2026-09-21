-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('61800000-0000-0000-0000-000000000001','multiday-conflicts@example.test');
select set_config('request.jwt.claims','{"sub":"61800000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare body jsonb; proposal jsonb; result jsonb; task jsonb; cause text; command jsonb; before_count integer; old_version jsonb;
begin
 set local role authenticated;
 task:=public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Three-hour video","estimate_minutes":180}')->'task';
 foreach cause in array array['calendar','task','priority','timezone'] loop
  body:=jsonb_build_object('date','2030-01-01','timezone','UTC','horizon',jsonb_build_object('startDate','2030-01-01','endDate','2030-01-14','timezone','UTC'),
   'contextVersion',public.planner_horizon_context('2030-01-01','2030-01-14')->>'version','message','Review both weeks','questions','[]'::jsonb,'assumptions','[]'::jsonb,'freeTime','[]'::jsonb,'capture',jsonb_build_object('items','[]'::jsonb),'priorities',null,
   'events',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','event-create','changes',jsonb_build_object('title','Must not partially apply','start_date','2030-01-01','end_date','2030-01-01','start_time','09:00','end_time','10:00','timezone','UTC','is_protected',false)),jsonb_build_object('id',gen_random_uuid(),'kind','event-create','changes',jsonb_build_object('title','Later day','start_date','2030-01-14','end_date','2030-01-14','start_time','10:00','end_time','13:00','timezone','UTC','task_id',task->>'id','is_protected',false))));
  result:=public.planner_schedule_store_proposal(gen_random_uuid(),'conflict-'||cause,body);proposal:=result->'proposal';
  if result->>'status'<>'complete' then raise exception 'Preview setup failed %',result;end if;
  if cause='calendar' then
   result:=public.calendar_capture_command('create',gen_random_uuid(),null,null,'{"title":"New protected appointment","start_date":"2030-01-14","end_date":"2030-01-14","start_time":"11:00","end_time":"12:00","timezone":"UTC","is_protected":true}');
  elsif cause='task' then
   result:=public.task_capture_command('edit',gen_random_uuid(),(task->>'id')::uuid,(task->>'version')::uuid,'{"estimate_minutes":240}');task:=result->'task';
  elsif cause='priority' then
   result:=public.priority_command(jsonb_build_object('operation','set','operationId',gen_random_uuid(),'date','2030-01-14','expectedVersion',public.priority_snapshot('2030-01-14')->'version','taskIds',jsonb_build_array(task->>'id')));
  else
   update public.profiles set timezone='America/Los_Angeles' where id=auth.uid();result:='{"status":"complete"}';
  end if;
  if result->>'status'<>'complete' then raise exception 'Conflict mutation setup failed %',result;end if;
  select count(*) into before_count from public.calendar_events;
  old_version:=public.planner_horizon_context('2030-01-01','2030-01-14')->'version';
  command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version');
  result:=public.planner_schedule_command(command);
  if result->>'status'<>'conflict' then raise exception 'Stale % accepted %',cause,result;end if;
  if (select count(*) from public.calendar_events)<>before_count or exists(select 1 from public.calendar_events where title='Must not partially apply') then raise exception 'Partial mutation after %',cause;end if;
  if public.planner_horizon_context('2030-01-01','2030-01-14')->'version' is distinct from old_version then raise exception 'Conflict mutated revision';end if;
  if public.planner_schedule_command(command)->>'status'<>'conflict' then raise exception 'Failed accept replay became success';end if;
  -- A context mutation during model generation must also prevent storing the old snapshot.
  if public.planner_schedule_store_proposal(gen_random_uuid(),'stale-generation',body)->>'status'<>'conflict' then raise exception 'Stale generation stored';end if;
  result:=public.planner_schedule_command(jsonb_build_object('operation','reject','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version'));
  if result->>'status'<>'complete' then raise exception 'Cannot reject stale proposal';end if;
 end loop;
end $$;
rollback;
