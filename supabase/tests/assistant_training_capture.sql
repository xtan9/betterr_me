-- constrained-sql-fixture: true
begin;
do $$ declare value bigint; called boolean;begin
 select last_value,is_called into value,called from public.assistant_messages_sequence_seq;
 perform set_config('test.training_sequence',value::text,true);
 perform set_config('test.training_sequence_called',called::text,true);
end $$;
select public.sql_fixture_create_auth_user('62900000-0000-0000-0000-000000000001','assistant-training@example.test');
select public.sql_fixture_create_auth_user('62900000-0000-0000-0000-000000000002','assistant-training-other@example.test');
select set_config('request.jwt.claims','{"sub":"62900000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare request jsonb; result jsonb; plan jsonb; snapshot jsonb; occurrence uuid; series uuid; day date:=current_date+20;
begin
 request:=jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Leg day',
  'activityKind','training','repeatMode','once','timingMode','anytime','date',day,'timezone','UTC',
  'trainingTemplateId',null,'rule','{"frequency":"daily","interval":1}'::jsonb);
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'Date-only training could not be planned: %',result;end if;
 series:=(result->>'seriesId')::uuid;
 if public.planner_routine_command(request)->>'status' is distinct from 'already-applied' then raise exception 'Training retry lost identity';end if;
 select value into plan from jsonb_array_elements(public.read_train_plans(day)->'plans') where value->>'seriesId'=series::text;
 occurrence:=(plan->>'occurrenceId')::uuid;
 if occurrence is null or plan->>'plannedDay' is distinct from day::text or plan->'version'->'eventVersion'<>'null'::jsonb
  or plan->'completed'<>'false'::jsonb then raise exception 'Train did not expose the unscheduled plan: %',plan;end if;
 select value into snapshot from jsonb_array_elements(public.planner_routine_snapshot_v2(day)->'rows') where value->'series'->>'id'=series::text;
 if snapshot->'schedule'->>'timing_mode' is distinct from 'anytime' or snapshot->'timeIssue'<>'false'::jsonb
  or snapshot->'event'<>'null'::jsonb then raise exception 'Date-only plan invented a time or time issue: %',snapshot;end if;
 if exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot(day)->'rows') value where value->'series'->>'id'=series::text)
  or exists(select 1 from jsonb_array_elements(public.planner_routine_series_snapshot()->'rows') value where value->>'id'=series::text)
  then raise exception 'Unsupported date-only plan leaked to legacy timed reads';end if;
 if not exists(select 1 from jsonb_array_elements(public.planner_routine_series_snapshot_v2()->'rows') value
   where value->>'id'=series::text and value->>'nextDate'=day::text and value->'nextStartTime'='null'::jsonb and value->'nextReason'='null'::jsonb)
  then raise exception 'Date-only plan disappeared from planning library';end if;
 if jsonb_array_length(public.read_train_workout_day(day)->'workouts')<>0
  then raise exception 'Planning training fabricated a reservation or performed workout';end if;
 if exists(select 1 from jsonb_array_elements(public.read_train_plans(day+1)->'plans') value where value->>'seriesId'=series::text)
  then raise exception 'One-off date-only training repeated';end if;
 request:=jsonb_build_object('operation','edit','operationId',gen_random_uuid(),'timingMode','anytime','seriesId',series,'occurrenceId',occurrence,
  'title','Moved leg day','date',day+1,'trainingTemplateId',null,'expectedSeriesToken',plan->'version'->'seriesToken',
  'expectedOccurrenceVersion',plan->'version'->'occurrenceVersion','expectedTaskVersion',plan->'version'->'taskVersion','expectedEventVersion',null);
 if public.planner_routine_command(request||jsonb_build_object('expectedTaskVersion',gen_random_uuid()))->>'status' is distinct from 'conflict' then raise exception 'Stale anytime edit applied';end if;
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'Anytime edit failed: %',result;end if;
 plan:=public.read_train_plans(null,occurrence)->'plan';
 if plan->>'plannedDay' is distinct from (day+1)::text or plan->>'scheduledDate' is distinct from day::text or plan->>'title' is distinct from 'Moved leg day'
  or jsonb_array_length(public.read_train_plans(day)->'plans')<>0 then raise exception 'Anytime edit lost identity or placement: %',plan;end if;
 if not exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2(day+1)->'rows') value
  where value->'occurrence'->>'id'=occurrence::text and value->>'date'=(day+1)::text and value->'event'='null'::jsonb) then raise exception 'Today missed moved date-only plan';end if;
 if public.planner_routine_command(request)->>'status' is distinct from 'already-applied' then raise exception 'Edit retry changed its receipt';end if;
 result:=public.execute_train_plan_command(jsonb_build_object('protocolVersion',1,'ownerId',auth.uid(),'operationId',gen_random_uuid(),
  'command',jsonb_build_object('kind','fulfill-plan','occurrenceId',occurrence,'expected',plan->'version')));
 if result->>'status' is distinct from 'accepted' then raise exception 'Date-only plan could not be fulfilled: %',result;end if;
 plan:=public.read_train_plans(null,occurrence)->'plan';
 if plan->'completed'<>'true'::jsonb or plan->>'plannedDay' is distinct from (day+1)::text
  or jsonb_array_length(public.read_train_workout_day(day+1)->'workouts')<>0 then raise exception 'Fulfillment lost day or fabricated performed training';end if;
end $$;
do $$
declare proposal jsonb; body jsonb; command jsonb; result jsonb; plan jsonb; day date:=current_date+3; item uuid:=gen_random_uuid();
begin
 body:=jsonb_build_object('message','Review leg day','items',jsonb_build_array(jsonb_build_object('id',item,'kind','training-create',
  'changes',jsonb_build_object('title','Assistant leg day','date',day,'timezone','UTC','trainingTemplateId',null))));
 result:=public.planner_ai_store_proposal(gen_random_uuid(),'training-capture',body);proposal:=result->'proposal';
 if result->>'status' is distinct from 'complete' then raise exception 'Training preview unavailable: %',result;end if;
 if jsonb_array_length(public.read_train_plans(day)->'plans')<>0 then raise exception 'Preview saved training before confirmation';end if;
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version');
 if public.planner_ai_proposal_command(command)->>'status' is distinct from 'invalid' then raise exception 'Legacy client accepted unsupported training';end if;
 command:=command||'{"supportsTrainingPlans":true,"revalidate":true}';
 result:=public.planner_ai_proposal_command(command);
 if result->>'status' is distinct from 'complete' or result->'results'->0->>'kind'<>'training-create' then raise exception 'Training acceptance failed: %',result;end if;
 plan:=public.read_train_plans(null,(result->'results'->0->>'recordId')::uuid)->'plan';
 if plan->>'title' is distinct from 'Assistant leg day' or plan->>'plannedDay' is distinct from day::text
  or plan->'completed'<>'false'::jsonb then raise exception 'Receipt did not identify the actual training occurrence: %',plan;end if;
 if public.planner_ai_proposal_command(command)->>'status' is distinct from 'already-applied'
  or jsonb_array_length(public.read_train_plans(day)->'plans')<>1 then raise exception 'Acceptance retry duplicated training';end if;
 if public.planner_ai_proposal_command(command-'supportsTrainingPlans')->>'status' is distinct from 'conflict' then raise exception 'Changed retry reused operation identity';end if;
end $$;
do $$
declare source jsonb; revised jsonb; request jsonb; result jsonb; conversation uuid:=gen_random_uuid(); turn uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); day date:=current_date+5;
begin
 perform public.assistant_begin_turn(turn,conversation,true,repeat('d',64),'[{"role":"user","content":"今天要练腿"}]');
 result:=public.assistant_finish_turn(turn,repeat('d',64),jsonb_build_object('message','Review training','intent','capture','planning',null,'missing','[]'::jsonb,'ui','{"quickReplies":[]}'::jsonb,'memoryUpdates','[]'::jsonb,
  'capture',jsonb_build_object('message','Review training','items',jsonb_build_array(jsonb_build_object('id',item,'kind','training-create','changes',jsonb_build_object('title','Leg day','date',day,'timezone','UTC','trainingTemplateId',null))))));
 source:=result->'response'->'proposal';
 if source is null then raise exception 'Training turn was not persisted: %',result;end if;
 request:=jsonb_build_object('requestId',gen_random_uuid(),'conversationId',conversation,'proposalId',turn,'expectedVersion',source->>'version','locale','zh','supportsTrainingPlans',true,
  'changes',jsonb_build_object('title','Lower body','date',day+1,'timezone','UTC','trainingTemplateId',null));
 result:=public.planner_ai_revise_capture(request);revised:=result->'response'->'proposal';
 if result->>'status' is distinct from 'complete' or revised->'body'->'items'->0->>'kind'<>'training-create'
  or revised->'body'->'items'->0->'changes' is distinct from request->'changes' then raise exception 'Native training edit failed or invented fields: %',result;end if;
 if jsonb_array_length(public.read_train_plans(day+1)->'plans')<>0 then raise exception 'Native preview edit saved a plan';end if;
 if public.planner_ai_revise_capture(request) is distinct from result then raise exception 'Training revision lost exact retry';end if;
 if public.planner_ai_revise_capture(jsonb_set(request,'{changes,title}','"Changed retry"'))->>'status' is distinct from 'conflict' then raise exception 'Training revision reused request identity';end if;
 if public.planner_ai_store_proposal(turn,repeat('d',64),source->'body')->'proposal'->>'state' is distinct from 'rejected' then raise exception 'Old training preview remained actionable';end if;
end $$;
do $$
declare body jsonb; stored jsonb; proposal jsonb; command jsonb; result jsonb; template jsonb; day date:=current_date+8;
begin
 body:=jsonb_build_object('message','Stale date','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','training-create',
  'changes',jsonb_build_object('title','Yesterday intention','date',current_date-1,'timezone','UTC','trainingTemplateId',null))));
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'training-stale',body)->'proposal';
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTrainingPlans',true);
 if public.planner_ai_proposal_command(command)->>'status' is distinct from 'past-time'
  or public.planner_ai_store_proposal((proposal->>'id')::uuid,'training-stale',body)->'proposal'->>'state' is distinct from 'pending'
  or jsonb_array_length(public.read_train_plans(current_date-1)->'plans')<>0 then raise exception 'Stale date was saved, moved, or retired';end if;
 result:=public.execute_train_template_command(jsonb_build_object('protocolVersion',1,'operationId',gen_random_uuid(),
  'command',jsonb_build_object('kind','create','name','Leg template','notes',null,'entries','[]'::jsonb)));
 if result->>'status' is distinct from 'accepted' then raise exception 'Template fixture could not be created: %',result;end if;
 template:=result->'receipt'->'template';
 body:=jsonb_build_object('message','Template plan','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','training-create',
  'changes',jsonb_build_object('title','Leg template plan','date',day,'timezone','UTC','trainingTemplateId',template->>'id',
   'trainingTemplateName',template->>'name','trainingTemplateVersion',template->>'version'))));
 stored:=public.planner_ai_store_proposal(gen_random_uuid(),'training-template',body);proposal:=stored->'proposal';
 if stored->>'status' is distinct from 'complete' then raise exception 'Owned template preview rejected: %',stored;end if;
 result:=public.execute_train_template_command(jsonb_build_object('protocolVersion',1,'operationId',gen_random_uuid(),
  'command',jsonb_build_object('kind','archive','templateId',template->>'id','expectedVersion',template->>'version')));
 if result->>'status' is distinct from 'accepted' then raise exception 'Template fixture did not archive';end if;
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTrainingPlans',true);
 if public.planner_ai_proposal_command(command)->>'status' is distinct from 'conflict' or jsonb_array_length(public.read_train_plans(day)->'plans')<>0
  then raise exception 'Changed template was accepted or wrote partial training';end if;
 perform set_config('request.jwt.claims','{"sub":"62900000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 if public.planner_ai_proposal_command(command)->>'status' is distinct from 'not-found'
  or public.planner_ai_store_proposal(gen_random_uuid(),'foreign-training-template',body)->>'status' is distinct from 'invalid'
  then raise exception 'Training proposal or template crossed owner boundary';end if;
 perform set_config('request.jwt.claims','{"sub":"62900000-0000-0000-0000-000000000001","role":"authenticated"}',true);
end $$;
do $$
declare body jsonb; proposal jsonb; command jsonb; result jsonb; plan jsonb; day date:=current_date+9;
begin
 body:=jsonb_build_object('message','Training at six','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','training-create',
  'changes',jsonb_build_object('title','Evening legs','date',day,'timezone','UTC','trainingTemplateId',null,'startTime','18:00','endTime','19:00','protected',true))));
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'training-timed',body)->'proposal';
 if proposal is null then raise exception 'Explicit training interval could not be previewed';end if;
 result:=public.calendar_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','New commitment',
  'start_date',day,'end_date',day,'start_time','18:30','end_time','19:00','timezone','UTC','is_protected',true));
 if result->>'status' is distinct from 'complete' then raise exception 'Calendar fixture failed: %',result;end if;
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTrainingPlans',true);
 if public.planner_ai_proposal_command(command)->>'status' is distinct from 'conflict' or jsonb_array_length(public.read_train_plans(day)->'plans')<>0
  then raise exception 'Timed training ignored a new commitment';end if;
 body:=jsonb_set(jsonb_set(jsonb_set(body,'{items,0,id}',to_jsonb(gen_random_uuid())),'{items,0,changes,startTime}','"20:00"'),'{items,0,changes,endTime}','"21:00"');
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'training-timed-free',body)->'proposal';
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTrainingPlans',true);
 result:=public.planner_ai_proposal_command(command);
 if result->>'status' is distinct from 'complete' then raise exception 'Explicit training could not be accepted: %',result;end if;
 plan:=public.read_train_plans(null,(result->'results'->0->>'recordId')::uuid)->'plan';
 if plan->>'plannedDay' is distinct from day::text or plan->'version'->>'eventVersion' is null then raise exception 'Explicit training lost its reservation: %',plan;end if;
 body:=jsonb_set(jsonb_set(body,'{items,0,id}',to_jsonb(gen_random_uuid())),'{items,0,changes,date}',to_jsonb((day+1)::text));
 body:=jsonb_set(body,'{items}',(body->'items')||jsonb_build_array(jsonb_set(body->'items'->0,'{id}',to_jsonb(gen_random_uuid()))));
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'training-overlapping-pair',body)->'proposal';
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTrainingPlans',true);
 if public.planner_ai_proposal_command(command)->>'status' is distinct from 'conflict' or jsonb_array_length(public.read_train_plans(day+1)->'plans')<>0
  then raise exception 'Conflicting multi-training acceptance left a partial write';end if;
end $$;
reset role;
select setval('public.assistant_messages_sequence_seq',current_setting('test.training_sequence')::bigint,current_setting('test.training_sequence_called')::boolean);
rollback;
