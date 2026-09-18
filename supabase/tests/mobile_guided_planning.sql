-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('61500000-0000-0000-0000-000000000001','planning-owner@example.test');
select set_config('request.jwt.claims','{"sub":"61500000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare context jsonb; proposal jsonb; request jsonb; result jsonb;
begin
 set local role authenticated;
 context:=public.planner_schedule_context('2030-01-01');
 proposal:=public.planner_schedule_store_proposal(gen_random_uuid(),'first',jsonb_build_object('date','2030-01-01','timezone','UTC','contextVersion',context->>'version','message','Rest','questions','[]'::jsonb,'assumptions','[]'::jsonb,'freeTime','[]'::jsonb,'capture',jsonb_build_object('message','','items','[]'::jsonb),'events',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','event-create','changes',jsonb_build_object('title','Rest','start_date','2030-01-01','end_date','2030-01-01','start_time','12:00','end_time','12:30','timezone','UTC','is_protected',true,'task_id',null))),'priorities',null))->'proposal';
 if proposal is null then raise exception 'preview missing';end if;
 if exists(select 1 from public.calendar_events) then raise exception 'preview mutated plan';end if;
 request:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version');
 result:=public.planner_schedule_command(request);
 if result->>'status'<>'complete' or (select count(*) from public.calendar_events)<>1 then raise exception 'accept failed %',result;end if;
 if public.planner_schedule_command(request)->>'status'<>'already-applied' then raise exception 'retry failed';end if;
 result:=public.planner_schedule_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',result->>'changeId','expectedVersion',result->>'changeVersion'));
 if result->>'status'<>'complete' or exists(select 1 from public.calendar_events) then raise exception 'revert failed %',result;end if;
 reset role;
end $$;
do $$
declare body jsonb; proposal jsonb; result jsonb; task jsonb; commitment jsonb; command jsonb;
begin
 set local role authenticated;
 task:=public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Unknown effort"}')->'task';
 body:=jsonb_build_object('date','2030-01-01','timezone','UTC','contextVersion',public.planner_schedule_context('2030-01-01')->>'version','message','Atomic preview','questions','[]'::jsonb,'assumptions','[]'::jsonb,'freeTime','[]'::jsonb,'capture',jsonb_build_object('items','[]'::jsonb),'priorities',null,'events',jsonb_build_array(
  jsonb_build_object('id',gen_random_uuid(),'kind','event-create','changes',jsonb_build_object('title','First valid item','start_date','2030-01-01','end_date','2030-01-01','start_time','10:00','end_time','10:30','timezone','UTC','is_protected',false,'task_id',null)),
  jsonb_build_object('id',gen_random_uuid(),'kind','event-create','changes',jsonb_build_object('title','Unknown estimate','start_date','2030-01-01','end_date','2030-01-01','start_time','11:00','end_time','11:30','timezone','UTC','is_protected',false,'task_id',task->>'id'))));
 proposal:=public.planner_schedule_store_proposal(gen_random_uuid(),'atomic',body)->'proposal';
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version');
 result:=public.planner_schedule_command(command);
 if result->>'status' not in('conflict','invalid') or exists(select 1 from public.calendar_events) then raise exception 'partial failure did not rollback %',result;end if;
 if exists(select 1 from public.planner_command_receipts where operation_id=(command->>'operationId')::uuid) then raise exception 'failed receipt persisted';end if;
 result:=public.planner_schedule_store_proposal(gen_random_uuid(),'missing-kind',jsonb_set(body,'{events}',jsonb_build_array((body->'events'->0)-'kind')));
 if result->>'status'<>'invalid' then raise exception 'missing kind accepted %',result;end if;
 body:=jsonb_set(body,'{events}',jsonb_build_array(body->'events'->0));
 proposal:=public.planner_schedule_store_proposal(gen_random_uuid(),'stale',body)->'proposal';
 commitment:=public.calendar_capture_command('create',gen_random_uuid(),null,null,'{"title":"New commitment","start_date":"2030-01-01","end_date":"2030-01-01","start_time":"14:00","end_time":"15:00","timezone":"UTC","is_protected":true}')->'event';
 result:=public.planner_schedule_command(jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version'));
 if result->>'status'<>'conflict' or (select count(*) from public.calendar_events)<>1 then raise exception 'new commitment not preserved %',result;end if;
 body:=jsonb_set(body,'{contextVersion}',public.planner_schedule_context('2030-01-01')->'version');
 body:=jsonb_set(body,'{events}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','event-remove','targetId',commitment->>'id','expectedVersion',commitment->>'version','changes','{}'::jsonb)));
 if public.planner_schedule_store_proposal(gen_random_uuid(),'protected',body)->>'status'<>'unsupported' then raise exception 'protected edit allowed';end if;
 reset role;
end $$;
rollback;
