-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('62800000-0000-0000-0000-000000000001','capture-confirmation@example.test');
select public.sql_fixture_create_auth_user('62800000-0000-0000-0000-000000000002','capture-confirmation-other@example.test');
select set_config('request.jwt.claims','{"sub":"62800000-0000-0000-0000-000000000001","role":"authenticated"}',true);
create function pg_temp.expire_confirmation() returns trigger language plpgsql as $$
begin
 if new.body->>'message' like 'Expired%' then new.expires_at:=statement_timestamp()-interval '1 minute';end if;
 if new.body->>'message' like 'Crossed%' then new.created_at:=statement_timestamp()-interval '2 days';end if;
 return new;
end $$;
create trigger confirmation_expiry before insert on public.planner_ai_proposals for each row execute function pg_temp.expire_confirmation();

do $$
declare proposal jsonb; body jsonb; command jsonb; result jsonb;
begin
 set local role authenticated;
 body:=jsonb_build_object('message','Expired plain task','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','task-create','changes','{"title":"Drink water"}'::jsonb)));
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'expired-plain',body)->'proposal';
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version');
 if public.planner_ai_proposal_command(command)->>'status'<>'conflict' then raise exception 'Legacy expiry changed';end if;
 command:=command||'{"revalidate":true}';
 result:=public.planner_ai_proposal_command(command);
 if result->>'status'<>'complete' then raise exception 'Unchanged expired task could not be added: %',result;end if;
 if (select count(*) from public.tasks where title='Drink water')<>1 or exists(select 1 from public.calendar_events) then raise exception 'Plain task reserved time or did not save';end if;
 if public.planner_ai_proposal_command(command)->>'status'<>'already-applied' or (select count(*) from public.tasks where title='Drink water')<>1 then raise exception 'Exact retry duplicated the task';end if;
 if public.planner_ai_proposal_command(command-'revalidate')->>'status'<>'conflict' then raise exception 'Operation identity was reused with a different command';end if;
 if (select p.body from public.planner_ai_proposals p where id=(proposal->>'id')::uuid) is distinct from body then raise exception 'Revalidation rewrote the exact proposal';end if;
 reset role;
end $$;

do $$
declare proposal jsonb; body jsonb; command jsonb; result jsonb; day text:=to_char(current_date+2,'YYYY-MM-DD');
begin
 set local role authenticated;
 body:=jsonb_build_object('message','Expired timed task','contextVersion',public.planner_schedule_context(day::date)->>'version','items',jsonb_build_array(jsonb_build_object(
  'id',gen_random_uuid(),'kind','task-create','changes','{"title":"Read tomorrow"}'::jsonb,'schedule',jsonb_build_object('startDate',day,'endDate',day,'startTime','20:00','endTime','20:30','timezone','UTC','durationSource','default'))));
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'expired-timed',body)->'proposal';
 perform public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Unrelated new task"}');
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTimedTasks',true,'revalidate',true);
 result:=public.planner_ai_proposal_command(command);
 if result->>'status'<>'complete' then raise exception 'Unrelated change blocked exact slot revalidation: %',result;end if;
 if (select count(*) from public.calendar_events where title='Read tomorrow' and start_date=day::date and start_time='20:00'::time)<>1 then raise exception 'Revalidated slot changed';end if;
 if public.planner_ai_proposal_command(command)->>'status'<>'already-applied' then raise exception 'Timed receipt did not bypass changed state';end if;

 body:=jsonb_set(jsonb_set(body,'{message}','"Expired occupied task"'),'{contextVersion}',public.planner_schedule_context(day::date)->'version');
 body:=jsonb_set(body,'{items,0,id}',to_jsonb(gen_random_uuid()));
 body:=jsonb_set(body,'{items,0,changes,title}','"Never add this overlap"');
 body:=jsonb_set(jsonb_set(body,'{items,0,schedule,startTime}','"21:00"'),'{items,0,schedule,endTime}','"21:30"');
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'occupied-later',body)->'proposal';
 perform public.calendar_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','New commitment','start_date',day,'end_date',day,'start_time','21:00','end_time','21:30','timezone','UTC','is_protected',true));
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTimedTasks',true,'revalidate',true);
 if public.planner_ai_proposal_command(command)->>'status'<>'conflict' or exists(select 1 from public.tasks where title='Never add this overlap') then raise exception 'Revalidation ignored new occupancy or partially wrote';end if;
 reset role;
end $$;
do $$
declare proposal jsonb; body jsonb; command jsonb; result jsonb; day text:=to_char(current_date-1,'YYYY-MM-DD');
begin
 set local role authenticated;
 body:=jsonb_build_object('message','Crossed task start','contextVersion',public.planner_schedule_context(day::date)->>'version','items',jsonb_build_array(jsonb_build_object(
  'id',gen_random_uuid(),'kind','task-create','changes','{"title":"Passed while waiting"}'::jsonb,'schedule',jsonb_build_object('startDate',day,'endDate',day,'startTime','20:00','endTime','20:30','timezone','UTC','durationSource','default'))));
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'crossed-timed',body)->'proposal';
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTimedTasks',true,'revalidate',true);
 result:=public.planner_ai_proposal_command(command);
 if result->>'status'<>'past-time' or exists(select 1 from public.tasks where title='Passed while waiting') or exists(select 1 from public.planner_command_receipts where operation_id=(command->>'operationId')::uuid) then raise exception 'Newly past slot did not stay pending without a receipt: %',result;end if;
 if not exists(select 1 from public.planner_ai_proposals where id=(proposal->>'id')::uuid and state='pending') then raise exception 'Past-time discarded proposal';end if;

 body:=jsonb_set(jsonb_set(body,'{message}','"Intentionally historical"'),'{items,0,id}',to_jsonb(gen_random_uuid()));
 body:=jsonb_set(body,'{items,0,changes,title}','"Historical task"');
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'historical-timed',body)->'proposal';
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTimedTasks',true,'revalidate',true);
 if public.planner_ai_proposal_command(command)->>'status'<>'complete' then raise exception 'Intentional historical task was blocked';end if;

 body:=jsonb_build_object('message','Crossed routine start','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','routine-create','changes',jsonb_build_object('title','Past routine','date',day,'startTime','19:00','endTime','19:30','timezone','UTC','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb))));
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'crossed-routine',body)->'proposal';
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','revalidate',true);
 if public.planner_ai_proposal_command(command)->>'status'<>'past-time' or exists(select 1 from public.recurring_task_series) then raise exception 'Newly past routine start was accepted';end if;
 reset role;
end $$;
do $$
declare original jsonb; revised jsonb; request jsonb; result jsonb; conversation uuid:=gen_random_uuid(); turn uuid:=gen_random_uuid(); item_id uuid:=gen_random_uuid(); count_before bigint;
begin
 set local role authenticated;
 perform public.assistant_begin_turn(turn,conversation,true,repeat('a',64),'[{"role":"user","content":"Add a task"}]');
 result:=public.assistant_finish_turn(turn,repeat('a',64),jsonb_build_object('message','Review task','intent','capture','planning',null,'missing','[]'::jsonb,'ui','{"quickReplies":[]}'::jsonb,'memoryUpdates','[]'::jsonb,'capture',jsonb_build_object('message','Review task','items',jsonb_build_array(jsonb_build_object('id',item_id,'kind','task-create','changes','{"title":"Original title","estimate_minutes":20,"due_date":"2030-02-03"}'::jsonb)))));
 original:=result->'response'->'proposal';
 if original is null then raise exception 'Source turn unavailable: %',result;end if;
 select count(*) into count_before from public.tasks;
 request:=jsonb_build_object('requestId',gen_random_uuid(),'conversationId',conversation,'proposalId',turn,'expectedVersion',original->>'version','locale','zh','changes','{"title":"喝水","estimate_minutes":null}'::jsonb);
 result:=public.planner_ai_revise_capture(request);revised:=result->'response'->'proposal';
 if result->>'status'<>'complete' or revised->>'id'<>request->>'requestId' or result->'response'->>'supersededCaptureProposalId'<>turn::text then raise exception 'Deterministic revision failed: %',result;end if;
 if revised->'body'->'items'->0->>'id'<>item_id::text or revised->'body'->'items'->0->'changes'<>'{"title":"喝水","estimate_minutes":null,"due_date":"2030-02-03"}'::jsonb then raise exception 'Revision lost exact fields or identity: %',revised;end if;
 if not exists(select 1 from public.planner_ai_proposals where id=turn and state='rejected') or (select count(*) from public.tasks)<>count_before then raise exception 'Revision did not retire source or wrote a task';end if;
 if public.planner_ai_revise_capture(request)<>result then raise exception 'Revision retry changed its result';end if;
 if public.planner_ai_revise_capture(jsonb_set(request,'{changes,title}','"Different request"'))->>'status'<>'conflict' then raise exception 'Revision request identity was reused';end if;
 reset role;
end $$;
do $$
declare source jsonb; request jsonb; result jsonb; conversation uuid:=gen_random_uuid(); turn uuid:=gen_random_uuid(); total bigint;
begin
 set local role authenticated;
 perform public.assistant_begin_turn(turn,conversation,true,repeat('b',64),'[{"role":"user","content":"Add a task"}]');
 source:=public.assistant_finish_turn(turn,repeat('b',64),jsonb_build_object('message','Original','intent','capture','planning',null,'missing','[]'::jsonb,'ui','{"quickReplies":[]}'::jsonb,'memoryUpdates','[]'::jsonb,'capture',jsonb_build_object('message','Original','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','task-create','changes','{"title":"Preserve me"}'::jsonb)))))->'response'->'proposal';
 select count(*) into total from public.assistant_messages;
 request:=jsonb_build_object('requestId',gen_random_uuid(),'conversationId',conversation,'proposalId',turn,'expectedVersion',source->>'version','locale','en','changes','{"title":"Broken date","due_date":"2030-02-31"}'::jsonb);
 result:=public.planner_ai_revise_capture(request);
 if result->>'status'<>'invalid' then raise exception 'Invalid revision was not definitive: %',result;end if;
 if (select count(*) from public.assistant_messages)<>total or exists(select 1 from public.assistant_turns where id=(request->>'requestId')::uuid) or exists(select 1 from public.planner_ai_proposals where id=(request->>'requestId')::uuid) then raise exception 'Invalid revision left partial history or replacement';end if;
 if not exists(select 1 from public.planner_ai_proposals where id=turn and state='pending' and version=(source->>'version')::uuid) then raise exception 'Invalid revision retired source';end if;
 request:=jsonb_set(request,'{changes}','{"title":"Another conversation"}');
 request:=jsonb_set(request,'{conversationId}',to_jsonb(gen_random_uuid()));
 if public.planner_ai_revise_capture(request)->>'status'<>'not-found' or (select count(*) from public.assistant_messages)<>total then raise exception 'Revision crossed conversation ownership';end if;
 request:=jsonb_set(jsonb_set(request,'{conversationId}',to_jsonb(conversation)),'{expectedVersion}',to_jsonb(gen_random_uuid()));
 if public.planner_ai_revise_capture(request)->>'status'<>'conflict' or (select count(*) from public.assistant_messages)<>total then raise exception 'Stale revision left history';end if;
 request:=jsonb_set(request,'{expectedVersion}',source->'version');
 perform set_config('request.jwt.claims','{"sub":"62800000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 if public.planner_ai_revise_capture(request)->>'status'<>'not-found' or exists(select 1 from public.assistant_messages) then raise exception 'Revision leaked another owner source/history';end if;
 perform set_config('request.jwt.claims','{"sub":"62800000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 reset role;
end $$;
do $$
declare original jsonb; revised jsonb; request jsonb; result jsonb; body jsonb; project jsonb; schedule jsonb;
 conversation uuid:=gen_random_uuid(); turn uuid:=gen_random_uuid(); item_id uuid:=gen_random_uuid(); day text:=to_char(current_date+3,'YYYY-MM-DD'); events_before bigint;
begin
 set local role authenticated;
 project:=public.project_capture_command('create',gen_random_uuid(),null,null,'{"name":"Keep project"}')->'project';
 schedule:=jsonb_build_object('startDate',day,'endDate',day,'startTime','12:00','endTime','12:30','timezone','UTC','durationSource','default');
 body:=jsonb_build_object('message','Project task','contextVersion',public.planner_schedule_context(day::date)->>'version','items',jsonb_build_array(jsonb_build_object('id',item_id,'kind','task-create','projectId',project->>'id','projectVersion',project->>'version','before',jsonb_build_object('projectName','Keep project'),'changes','{"title":"Scheduled draft","estimate_minutes":null}'::jsonb,'schedule',schedule)));
 perform public.assistant_begin_turn(turn,conversation,true,repeat('c',64),'[{"role":"user","content":"Create project task at noon"}]');
 original:=public.assistant_finish_turn(turn,repeat('c',64),jsonb_build_object('message','Project task','intent','capture','planning',null,'missing','[]'::jsonb,'ui','{"quickReplies":[]}'::jsonb,'memoryUpdates','[]'::jsonb,'capture',body))->'response'->'proposal';
 select count(*) into events_before from public.calendar_events;
 request:=jsonb_build_object('requestId',gen_random_uuid(),'conversationId',conversation,'proposalId',turn,'expectedVersion',original->>'version','locale','en','changes','{"title":"Edited draft"}'::jsonb,'schedule',schedule||'{"startTime":"13:00","endTime":"14:00","durationSource":"explicit"}'::jsonb);
 result:=public.planner_ai_revise_capture(request);revised:=result->'response'->'proposal';
 if result->>'status'<>'complete' or revised->'body'->'items'->0->'schedule' is distinct from request->'schedule' or revised->'body'->'items'->0->>'projectId'<>project->>'id' or revised->'body'->'items'->0->'before' is distinct from body->'items'->0->'before' then raise exception 'Scheduled revision changed metadata or exact interval: %',result;end if;
 request:=request||jsonb_build_object('requestId',gen_random_uuid(),'proposalId',revised->>'id','expectedVersion',revised->>'version','schedule',null);
 result:=public.planner_ai_revise_capture(request);revised:=result->'response'->'proposal';
 if result->>'status'<>'complete' or revised->'body' ? 'contextVersion' or revised->'body'->'items'->0 ? 'schedule' then raise exception 'Explicit schedule removal failed: %',result;end if;
 result:=public.planner_ai_proposal_command(jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',revised->>'id','expectedVersion',revised->>'version','revalidate',true));
 if result->>'status'<>'complete' or (select count(*) from public.calendar_events)<>events_before or not exists(select 1 from public.tasks where title='Edited draft' and project_id=(project->>'id')::uuid) then raise exception 'Removing schedule did not preserve an ordinary project task: %',result;end if;
 reset role;
end $$;

do $$
declare task jsonb; proposal jsonb; command jsonb;
begin
 set local role authenticated;
 task:=public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Original edit target"}')->'task';
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'edit-stale',jsonb_build_object('message','Expired edit','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','task-edit','targetId',task->>'id','expectedVersion',task->>'version','changes','{"title":"Outdated edit"}'::jsonb))))->'proposal';
 perform public.task_capture_command('edit',gen_random_uuid(),(task->>'id')::uuid,(task->>'version')::uuid,'{"title":"Newer edit"}');
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','revalidate',true);
 if public.planner_ai_proposal_command(command)->>'status'<>'conflict' or not exists(select 1 from public.tasks where id=(task->>'id')::uuid and title='Newer edit') then raise exception 'Revalidation overwrote a newer entity version';end if;
 if has_function_privilege('anon','public.planner_ai_revise_capture(jsonb)','EXECUTE') or has_function_privilege('authenticated','planner_private.capture_has_newly_past_start(jsonb,timestamptz)','EXECUTE') then raise exception 'Revision helper privileges are too broad';end if;
 reset role;
end $$;
rollback;
