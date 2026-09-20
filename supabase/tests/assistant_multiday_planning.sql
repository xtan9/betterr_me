-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('61700000-0000-0000-0000-000000000001','horizon-owner@example.test');
select public.sql_fixture_create_auth_user('61700000-0000-0000-0000-000000000002','horizon-other@example.test');
select set_config('request.jwt.claims','{"sub":"61700000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare body jsonb; proposal jsonb; result jsonb; plan_request jsonb; preview_id uuid:=gen_random_uuid(); task jsonb;
begin
 set local role authenticated;
 body:=jsonb_build_object('date','2030-01-01','timezone','UTC','horizon',jsonb_build_object('startDate','2030-01-01','endDate','2030-01-14','timezone','UTC'),
  'contextVersion',public.planner_horizon_context('2030-01-01','2030-01-14')->>'version','message','Review two weeks','questions','[]'::jsonb,'assumptions','[]'::jsonb,'freeTime','[]'::jsonb,'capture',jsonb_build_object('items','[]'::jsonb),'priorities',null,
  'events',jsonb_build_array(
   jsonb_build_object('id',gen_random_uuid(),'kind','event-create','changes',jsonb_build_object('title','First day','start_date','2030-01-01','end_date','2030-01-01','start_time','10:00','end_time','10:30','timezone','UTC','is_protected',false)),
   jsonb_build_object('id',gen_random_uuid(),'kind','event-create','changes',jsonb_build_object('title','Last day family','start_date','2030-01-14','end_date','2030-01-14','start_time','15:00','end_time','18:00','timezone','UTC','is_protected',true))));
 result:=public.planner_schedule_store_proposal(preview_id,'multi-day',body);proposal:=result->'proposal';
 if result->>'status'<>'complete' or proposal is null or exists(select 1 from public.calendar_events) then raise exception 'Multi-day preview failed or mutated calendar %',result;end if;
 if public.planner_schedule_store_proposal(preview_id,'different',body)->>'status'<>'conflict' then raise exception 'Fingerprint mismatch allowed';end if;
 if public.planner_schedule_store_proposal(preview_id,'multi-day',body)->'proposal' is distinct from proposal then raise exception 'Preview replay changed';end if;
 -- A second authenticated owner cannot read, accept, or replay the first owner's preview.
 perform set_config('request.jwt.claims','{"sub":"61700000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 if exists(select 1 from public.planner_ai_proposals where id=preview_id) then raise exception 'Foreign preview visible';end if;
 if public.planner_schedule_command(jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',preview_id,'expectedVersion',proposal->>'version'))->>'status'<>'not-found' then raise exception 'Foreign accept allowed';end if;
 perform set_config('request.jwt.claims','{"sub":"61700000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 plan_request:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',preview_id,'expectedVersion',proposal->>'version');
 result:=public.planner_schedule_command(plan_request);
 if result->>'status'<>'complete' or (select count(*) from public.calendar_events)<>2 then raise exception 'Atomic horizon accept failed %',result;end if;
 if public.planner_schedule_command(plan_request)->>'status'<>'already-applied' or (select count(*) from public.calendar_events)<>2 then raise exception 'Accept replay duplicated';end if;
 plan_request:=jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',result->>'changeId','expectedVersion',result->>'changeVersion');
 result:=public.planner_schedule_command(plan_request);
 if result->>'status'<>'complete' or exists(select 1 from public.calendar_events) then raise exception 'Multi-day undo failed %',result;end if;
 if public.planner_schedule_command(plan_request)->>'status'<>'already-applied' then raise exception 'Undo replay failed';end if;
 -- A late infeasible task must roll back an earlier valid day and every receipt.
 task:=public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Unknown effort"}')->'task';
 body:=jsonb_set(body,'{contextVersion}',public.planner_horizon_context('2030-01-01','2030-01-14')->'version');
 body:=jsonb_set(body,'{events,1,changes,task_id}',to_jsonb(task->>'id'));
 proposal:=public.planner_schedule_store_proposal(gen_random_uuid(),'late-failure',body)->'proposal';
 plan_request:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version');
 result:=public.planner_schedule_command(plan_request);
 if result->>'status'<>'conflict' or exists(select 1 from public.calendar_events) or exists(select 1 from public.planner_command_receipts where operation_id=(plan_request->>'operationId')::uuid) then raise exception 'Late-day failure leaked partial changes %',result;end if;
 body:=jsonb_set(body,'{events,1,changes,start_date}','"2030-01-15"');body:=jsonb_set(body,'{events,1,changes,end_date}','"2030-01-15"');
 if public.planner_schedule_store_proposal(gen_random_uuid(),'outside',body)->>'status'<>'invalid' then raise exception 'Outside date accepted';end if;
 reset role;
end $$;
do $$
declare cid uuid:=gen_random_uuid(); turn_id uuid:=gen_random_uuid(); result jsonb; plan jsonb; body jsonb; proposal jsonb; seq bigint; called boolean;
 output jsonb:='{"message":"Draft for two days","intent":"planning","planning":{"status":"drafted","horizon":{"startDate":"2030-01-01","endDate":"2030-01-02","timezone":"UTC"},"readiness":{"horizon":"known"},"facts":{"workBoundaries":"Family after 15:00"},"assumptions":[],"travelMinutes":15},"missing":[],"ui":{"quickReplies":[]},"capture":{"message":"Draft for two days","items":[]},"memoryUpdates":[]}';
begin
 select last_value,is_called into seq,called from public.assistant_messages_sequence_seq;
 set local role authenticated;
 perform public.assistant_begin_turn(turn_id,cid,true,repeat('a',64),'[{"role":"user","content":"Plan January 1 and 2"}]');
 result:=public.assistant_finish_turn(turn_id,repeat('a',64),output);plan:=result->'response'->'planning';
 if result->>'status'<>'complete' or plan->>'version' is null or plan->'horizon' is distinct from output->'planning'->'horizon' then raise exception 'Missing versioned session handle %',result;end if;
 if (select travel_minutes from public.planning_sessions where id=(plan->>'sessionId')::uuid) is distinct from 15 then raise exception 'Confirmed travel missing';end if;
 body:=jsonb_build_object('date','2030-01-01','timezone','UTC','horizon',plan->'horizon','planningSession',jsonb_build_object('id',plan->>'sessionId','version',plan->>'version'),
 'contextVersion',public.planner_horizon_context('2030-01-01','2030-01-02')->>'version','message','Exact preview','questions','[]'::jsonb,'assumptions','[]'::jsonb,'freeTime','[]'::jsonb,'capture',jsonb_build_object('items','[]'::jsonb),'priorities',null,
 'events',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','event-create','changes',jsonb_build_object('title','Focus','start_date','2030-01-02','end_date','2030-01-02','start_time','10:00','end_time','10:30','timezone','UTC','is_protected',false))));
 proposal:=public.planner_schedule_store_proposal(gen_random_uuid(),'session-preview',body)->'proposal';
 if proposal is null then raise exception 'Session preview missing';end if;
 turn_id:=gen_random_uuid();perform public.assistant_begin_turn(turn_id,cid,false,repeat('b',64),'[{"role":"user","content":"Change the family boundary"}]');
 result:=public.assistant_finish_turn(turn_id,repeat('b',64),output);plan:=result->'response'->'planning';
 if public.planner_schedule_command(jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version'))->>'status'<>'conflict' then raise exception 'Stale session accepted';end if;
 if exists(select 1 from public.calendar_events) then raise exception 'Stale session mutated calendar';end if;
 body:=jsonb_set(body,'{planningSession,version}',plan->'version');
 proposal:=public.planner_schedule_store_proposal(gen_random_uuid(),'current-session',body)->'proposal';
 result:=public.planner_schedule_command(jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version'));
 if result->>'status'<>'complete' or (select status from public.planning_sessions where id=(plan->>'sessionId')::uuid)<>'applied' then raise exception 'Session acceptance did not complete %',result;end if;
 result:=public.planner_schedule_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',result->>'changeId','expectedVersion',result->>'changeVersion'));
 if result->>'status'<>'complete' or exists(select 1 from public.calendar_events) then raise exception 'Session undo failed %',result;end if;
 if result->'planning'->>'status'<>'drafted' or result->'planning'->>'version' is null then raise exception 'Undo did not restore usable planning session';end if;
 body:=jsonb_set(body,'{planningSession,version}',result->'planning'->'version');body:=jsonb_set(body,'{contextVersion}',public.planner_horizon_context('2030-01-01','2030-01-02')->'version');
 if public.planner_schedule_store_proposal(gen_random_uuid(),'after-undo',body)->>'status'<>'complete' then raise exception 'Cannot preview again after Undo';end if;
 reset role;
 perform setval('public.assistant_messages_sequence_seq',seq,called);
end $$;
rollback;
