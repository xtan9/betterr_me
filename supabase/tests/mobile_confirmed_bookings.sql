-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('61100000-0000-0000-0000-000000000001','booking-owner@example.test');
select set_config('request.jwt.claims','{"sub":"61100000-0000-0000-0000-000000000001","role":"authenticated"}',true);
create function pg_temp.fail_visit_insert() returns trigger language plpgsql as $$
begin
 if new.visit_status='pending' then raise exception using errcode='23514',message='simulated visit storage failure';end if;
 return new;
end $$;
create trigger booking_fixture_failure before insert on public.calendar_events for each row execute function pg_temp.fail_visit_insert();
create temporary table booking_fixture_request(payload jsonb);
do $$
declare task jsonb; event jsonb; preview jsonb; command_request jsonb; result jsonb;
begin
 set local role authenticated;
 task:=public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Book appointment"}')->'task';
 event:=public.calendar_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Booking work','start_date','2090-04-01','end_date','2090-04-01','start_time','09:00','end_time','10:00','timezone','UTC','task_id',task->>'id','is_protected',false))->'event';
 preview:=public.planner_completion_preview((task->>'id')::uuid);
 command_request:=jsonb_build_object('operation','confirm-booking','operationId',gen_random_uuid(),'taskId',task->>'id','expectedVersion',task->>'version','plan',preview->'plan','confirmed',true,
  'visit',jsonb_build_object('title','Doctor visit','date','2090-04-02','startTime','10:00','endTime','11:00','timezone','UTC','location','Clinic'));
 result:=public.planner_command(command_request);
 if result->>'status' is distinct from 'invalid' then raise exception 'expected forced failure %',result;end if;
 if (select is_completed from public.tasks where id=(task->>'id')::uuid)
  or not exists(select 1 from public.calendar_events where id=(event->>'id')::uuid)
  or exists(select 1 from public.planner_changes)
  or exists(select 1 from public.planner_command_receipts where operation_id=(command_request->>'operationId')::uuid)
  then raise exception 'partial booking mutation';end if;
 reset role;
 insert into booking_fixture_request values(command_request);
end $$;
create or replace function pg_temp.fail_visit_insert() returns trigger language plpgsql as $$ begin return new; end $$;
do $$
declare command_request jsonb; result jsonb; change public.planner_changes;
begin
 select payload into command_request from booking_fixture_request;
 set local role authenticated;
 result:=public.planner_command(command_request);
 if result->>'status' is distinct from 'complete' then raise exception 'retry failed %',result;end if;
 if public.planner_command(command_request)->>'status' is distinct from 'already-applied' then raise exception 'duplicate booking';end if;
 select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
 if public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version))->>'status' is distinct from 'complete' then raise exception 'booking undo failed';end if;
 if exists(select 1 from public.calendar_events where visit_status='pending') or (select is_completed from public.tasks where id=(command_request->>'taskId')::uuid)
  or not exists(select 1 from public.calendar_events where title='Booking work') then raise exception 'booking undo incomplete';end if;
end $$;
rollback;
