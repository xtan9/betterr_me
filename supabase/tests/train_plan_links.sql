-- constrained-sql-fixture: true
-- Training association and fulfillment use real authenticated planner commands.
-- Every generated record and mutation in this fixture rolls back.
begin;
select public.sql_fixture_create_auth_user('64220000-0000-4000-8000-000000000001','train-plan-owner@example.test');
select public.sql_fixture_create_auth_user('64220000-0000-4000-8000-000000000002','train-plan-other@example.test');
select set_config('request.jwt.claims','{"sub":"64220000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare result jsonb; begin
 result:=public.execute_train_template_command('{"protocolVersion":1,"operationId":"64220000-0000-4000-8000-000000000010","command":{"kind":"create","name":"Owned archived template","notes":null,"entries":[]}}');
 if result->>'status' is distinct from 'accepted' then raise exception 'Template setup failed: %',result; end if;
 result:=public.execute_train_template_command(jsonb_build_object('protocolVersion',1,'operationId','64220000-0000-4000-8000-000000000011','command',jsonb_build_object('kind','archive','templateId',result->'receipt'->'template'->>'id','expectedVersion',result->'receipt'->'template'->>'version')));
 if result->>'status' is distinct from 'accepted' then raise exception 'Template archive failed: %',result; end if;
end $$;
do $$ declare request jsonb := '{"operation":"create","operationId":"64220000-0000-4000-8000-000000000020","activityKind":"training","repeatMode":"once","title":"Planned strength","date":"2026-11-05","startTime":"10:00","endTime":"11:00","timezone":"UTC","protected":false,"rule":{"frequency":"daily","interval":1},"trainingTemplateId":"64220000-0000-4000-8000-000000000010"}'; result jsonb; plan jsonb;
begin
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'Training create with archived template failed: %',result; end if;
 if public.planner_routine_command(request)->>'status' is distinct from 'already-applied' then raise exception 'Planner retry lost receipt'; end if;
 plan:=public.read_train_plans('2026-11-05',null,null)->'plans'->0;
 if plan->>'ownerId'<>'64220000-0000-4000-8000-000000000001' or plan->>'templateId'<>'64220000-0000-4000-8000-000000000010'
   or plan->>'plannedDay'<>'2026-11-05' or plan->>'scheduledDate'<>'2026-11-05' or plan->'completed' is distinct from 'false'::jsonb then raise exception 'Plan identity/readback changed: %',plan; end if;
 if (select count(*) from public.workouts where user_id=auth.uid())<>0 then raise exception 'Planning fabricated a workout'; end if;
end $$;
do $$ declare plan jsonb; document jsonb; uploaded jsonb; linked jsonb; fulfilled jsonb; request jsonb;
begin
 plan:=public.read_train_plans('2026-11-05',null,null)->'plans'->0;
 document:='{"version":2,"id":"64220000-0000-4000-8000-000000000030","ownerId":"64220000-0000-4000-8000-000000000001","sourceId":"64220000-0000-4000-8000-000000000031","startedAt":"2026-11-05T09:00:00Z","completedAt":"2026-11-05T09:05:00Z","durationSeconds":300,"timezone":"UTC","workoutDay":"2026-11-05","planId":"opaque old provenance","exercises":[{"id":"64220000-0000-4000-8000-000000000032","definition":{"catalogKey":"strength.barbell-bench-press.v1","name":{"en":"Captured Bench","zh":"卧推"},"equipment":"barbell","mode":"weight_reps","convention":"barbell-total"},"sets":[{"id":"64220000-0000-4000-8000-000000000033","performed":{"mode":"weight_reps","weightKg":0.123,"reps":5,"kind":"warmup"}}]}]}';
 uploaded:=public.upload_completed_workout((document->>'id')::uuid,document);
 if uploaded->>'status' is distinct from 'accepted' then raise exception 'Saved workout upload failed: %',uploaded; end if;
 request:=jsonb_build_object('protocolVersion',1,'ownerId',auth.uid(),'operationId','64220000-0000-4000-8000-000000000040','command',jsonb_build_object('kind','link-workout','workoutId',document->>'id','occurrenceId',plan->>'occurrenceId'));
 linked:=public.execute_train_plan_command(request);
 if linked->>'status' is distinct from 'accepted' or linked->'receipt'->>'occurrenceId' is distinct from plan->>'occurrenceId' then raise exception 'Explicit association failed: %',linked; end if;
 if public.execute_train_plan_command(request) is distinct from linked then raise exception 'Association retry changed first receipt'; end if;
 if public.read_train_workout_link((document->>'id')::uuid)->'link'->'current'->'completed' is distinct from 'false'::jsonb then raise exception 'Link automatically fulfilled plan'; end if;
 fulfilled:=public.execute_train_plan_command(jsonb_build_object('protocolVersion',1,'ownerId',auth.uid(),'operationId','64220000-0000-4000-8000-000000000041','command',jsonb_build_object('kind','fulfill-plan','occurrenceId',plan->>'occurrenceId','expected',plan->'version')));
 if fulfilled->>'status' is distinct from 'accepted' or fulfilled->'receipt'->>'outcome' is distinct from 'completed' or fulfilled->'receipt'->>'changeId' is null then raise exception 'Planner fulfillment failed: %',fulfilled; end if;
 plan:=public.read_train_workout_link((document->>'id')::uuid)->'link'->'current';
 if plan->'completed' is distinct from 'true'::jsonb or plan->>'plannedDay' is distinct from '2026-11-05' then raise exception 'Fulfillment lost placement or truth: %',plan; end if;
 if (select recorded_completion from public.workouts where id=(document->>'id')::uuid) is distinct from document or (select count(*) from public.workouts where user_id=auth.uid())<>1 then raise exception 'Plan action rewrote or fabricated actual work'; end if;
 if public.execute_train_plan_command(request) is distinct from linked then raise exception 'Later fulfillment rewrote association receipt'; end if;
 plan:=public.read_train_workout_day('2026-11-05',null);
 if jsonb_array_length(plan->'workouts')<>1 or plan->'workouts'->0->'record'->'recorded_completion' is distinct from document or plan->'workouts'->0->'link'->>'occurrenceId' is distinct from linked->'receipt'->>'occurrenceId' then raise exception 'Persisted day read lost completion/link: %',plan; end if;
 if public.read_train_workout_day('2026-11-06',null)->'workouts' is distinct from '[]'::jsonb then raise exception 'Link redated actual workout'; end if;
end $$;
-- Offline intent revalidation uses the same occurrence and actual online planner.
do $$ declare created jsonb; original jsonb; current_plan jsonb; edit_request jsonb; intent jsonb; result jsonb; rejected jsonb;
 document jsonb; linked jsonb; id uuid; i integer; first_page jsonb; second_page jsonb;
begin
 created:=public.planner_routine_command('{"operation":"create","operationId":"64220000-0000-4000-8000-000000000050","activityKind":"training","repeatMode":"once","title":"Move me","date":"2026-11-06","startTime":"10:00","endTime":"11:00","timezone":"UTC","protected":false,"rule":{"frequency":"daily","interval":1},"trainingTemplateId":"64220000-0000-4000-8000-000000000010"}');
 if created->>'status' is distinct from 'complete' then raise exception 'Second plan failed: %',created; end if;
 original:=public.read_train_plans('2026-11-06',null,null)->'plans'->0;
 intent:=jsonb_build_object('protocolVersion',1,'ownerId',auth.uid(),'operationId','64220000-0000-4000-8000-000000000051','command',jsonb_build_object('kind','fulfill-plan','occurrenceId',original->>'occurrenceId','expected',original->'version'));
 edit_request:=jsonb_build_object('operation','edit','operationId',gen_random_uuid(),'seriesId',original->>'seriesId','occurrenceId',original->>'occurrenceId',
  'expectedSeriesToken',original->'version'->'seriesToken','expectedOccurrenceVersion',original->'version'->>'occurrenceVersion',
  'expectedTaskVersion',original->'version'->>'taskVersion','expectedEventVersion',original->'version'->>'eventVersion',
  'title','Moved after offline choice','date','2026-11-09','startTime','12:00','endTime','13:00','trainingTemplateId',null);
 result:=public.planner_routine_command(edit_request);
 if result->>'status' is distinct from 'complete' then raise exception 'Move/defer failed: %',result; end if;
 current_plan:=public.read_train_plans(null,(original->>'occurrenceId')::uuid,null)->'plan';
 if not exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2026-11-06')->'rows') row
  where row->'occurrence'->>'id'=original->>'occurrenceId' and row->'occurrence' ? 'training_template_id' and row->'occurrence'->'training_template_id'='null'::jsonb
   and row->'schedule'->>'training_template_id'='64220000-0000-4000-8000-000000000010') then raise exception 'Existing editor lost resolved explicit defer'; end if;
 if current_plan->>'scheduledDate'<>'2026-11-06' or current_plan->>'plannedDay'<>'2026-11-09' or current_plan->'templateId'<>'null'::jsonb
  or jsonb_array_length(public.read_train_plans('2026-11-06',null,null)->'plans')<>0
  or public.read_train_plans('2026-11-09',null,null)->'plans'->0 is distinct from current_plan then raise exception 'Moved plan lost identity/current placement: %',current_plan; end if;
 rejected:=public.execute_train_plan_command(intent);
 if rejected->>'status' is distinct from 'changed' or rejected->'rejection'->'current' is distinct from current_plan then raise exception 'Changed plan did not require review: %',rejected; end if;
 result:=public.execute_train_plan_command(jsonb_set(intent,'{command,expected}',current_plan->'version'));
 if result->>'status' is distinct from 'operation_conflict' then raise exception 'Changed request reused old operation'; end if;
 result:=public.execute_train_plan_command(jsonb_set(jsonb_set(intent,'{command,expected}',current_plan->'version'),'{operationId}',to_jsonb(gen_random_uuid())));
 if result->>'status' is distinct from 'accepted' or result->'receipt'->>'outcome'<>'completed' then raise exception 'Explicit reviewed replacement failed: %',result; end if;
 if public.execute_train_plan_command(intent) is distinct from rejected then raise exception 'Old rejection changed after successful replacement'; end if;
 result:=public.execute_train_plan_command(jsonb_set(intent,'{operationId}',to_jsonb(gen_random_uuid())));
 if result->>'status' is distinct from 'accepted' or result->'receipt'->>'outcome'<>'already-completed' or result->'receipt'->'changeId'<>'null'::jsonb then raise exception 'Already complete claimed new effect: %',result; end if;
 if public.read_train_plans(null,(original->>'occurrenceId')::uuid,null)->'plan'->>'plannedDay'<>'2026-11-09' then raise exception 'Fulfillment reverted moved date'; end if;
 -- Two partial workouts can independently link; their captured days never move.
 select recorded_completion into document from public.workouts w where w.id='64220000-0000-4000-8000-000000000030';
 for i in 1..2 loop
  id:=gen_random_uuid(); document:=jsonb_set(document,'{id}',to_jsonb(id));
  document:=jsonb_set(document,'{exercises,0,id}',to_jsonb(gen_random_uuid())); document:=jsonb_set(document,'{exercises,0,sets,0,id}',to_jsonb(gen_random_uuid()));
  if public.upload_completed_workout(id,document)->>'status'<>'accepted' then raise exception 'Partial workout failed'; end if;
  result:=public.execute_train_plan_command(jsonb_build_object('protocolVersion',1,'ownerId',auth.uid(),'operationId',gen_random_uuid(),'command',jsonb_build_object('kind','link-workout','workoutId',id,'occurrenceId',original->>'occurrenceId')));
  if result->>'status'<>'accepted' then raise exception 'Many workouts to one occurrence failed: %',result; end if;
 end loop;
 if (select count(*) from public.train_workout_plan_links where captured_occurrence_id=(original->>'occurrenceId')::uuid)<>2
  or jsonb_array_length(public.read_train_workout_day('2026-11-05',null)->'workouts')<>3
  or public.read_train_workout_day('2026-11-09',null)->'workouts'<>'[]'::jsonb then raise exception 'Cross-day association redated/deduplicated workouts'; end if;
 result:=public.execute_train_plan_command(jsonb_build_object('protocolVersion',1,'ownerId',auth.uid(),'operationId',gen_random_uuid(),'command',jsonb_build_object('kind','link-workout','workoutId','64220000-0000-4000-8000-000000000030','occurrenceId',original->>'occurrenceId')));
 if result->>'status'<>'link_conflict' then raise exception 'A workout silently relinked'; end if;
 -- Day paging scans that whole persisted day, with exact sub-millisecond ordering.
 for i in 1..21 loop
  id:=gen_random_uuid(); document:=document||jsonb_build_object('id',id,'sourceId',gen_random_uuid(),'startedAt','2026-11-01T08:30:00.123456Z','completedAt','2026-11-01T09:30:00.123456Z','durationSeconds',3600,'timezone','America/Los_Angeles','workoutDay','2026-11-01');
  document:=jsonb_set(document,'{exercises,0,id}',to_jsonb(gen_random_uuid())); document:=jsonb_set(document,'{exercises,0,sets,0,id}',to_jsonb(gen_random_uuid()));
  if public.upload_completed_workout(id,document)->>'status'<>'accepted' then raise exception 'DST workout failed'; end if;
 end loop;
 first_page:=public.read_train_workout_day('2026-11-01',null); second_page:=public.read_train_workout_day('2026-11-01',first_page->'nextCursor');
 if jsonb_array_length(first_page->'workouts')<>20 or jsonb_array_length(second_page->'workouts')<>1 or second_page->'nextCursor'<>'null'::jsonb
  or first_page->'nextCursor'->>'startedAt' not like '%.123456%' then raise exception 'Day page lost exact cursor or truncated history'; end if;
 if exists(select 1 from jsonb_array_elements(first_page->'workouts') a join jsonb_array_elements(second_page->'workouts') b on a->'record'->>'id'=b->'record'->>'id') then raise exception 'Day pagination duplicated actual workout'; end if;
 -- Foreign owner cannot read or mutate plans, completed workouts or receipts.
 perform set_config('request.jwt.claims','{"sub":"64220000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 if public.read_train_plans(null,(original->>'occurrenceId')::uuid,null)->>'status'<>'not_found' or public.read_train_workout_link('64220000-0000-4000-8000-000000000030')->>'status'<>'not_found'
  or exists(select 1 from public.train_workout_plan_links) or exists(select 1 from public.train_plan_command_outcomes) then raise exception 'Foreign owner read escaped RLS'; end if;
 result:=public.execute_train_plan_command(jsonb_set(jsonb_set(intent,'{ownerId}',to_jsonb(auth.uid())),'{operationId}',to_jsonb(gen_random_uuid())));
 if result->>'status'<>'not_found' then raise exception 'Foreign occurrence fulfilled'; end if;
 if public.execute_train_plan_command(intent)->>'status'<>'owner_mismatch' then raise exception 'Captured owner not authenticated'; end if;
 perform set_config('request.jwt.claims','{"sub":"64220000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 -- A lost accepted association receipt cannot recreate a deleted workout/link.
 select request,jsonb_build_object('status','accepted','receipt',receipt) into intent,linked from public.train_plan_command_outcomes where operation_id='64220000-0000-4000-8000-000000000040';
 delete from public.workouts w where w.id='64220000-0000-4000-8000-000000000030';
 if public.execute_train_plan_command(intent) is distinct from linked or exists(select 1 from public.train_workout_plan_links where workout_id='64220000-0000-4000-8000-000000000030') then raise exception 'Retry resurrected association'; end if;
 if has_table_privilege('authenticated','public.train_workout_plan_links','INSERT') or has_table_privilege('authenticated','public.train_plan_command_outcomes','UPDATE')
  or has_table_privilege('service_role','public.train_workout_plan_links','INSERT') then raise exception 'Direct link/outcome write bypass'; end if;
end $$;
-- Missing, skipped and deleted plans are durable honest outcomes. A transaction
-- that fails after planner completion leaves neither fulfillment nor a receipt.
do $$ declare created jsonb; plan jsonb; intent jsonb; result jsonb; original jsonb; command jsonb; action text;
begin
 foreach action in array array['skip','delete','rollback'] loop
  created:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'activityKind','training','repeatMode','once','title',action,
   'date','2026-11-10','startTime','10:00','endTime','11:00','timezone','UTC','protected',false,'rule','{"frequency":"daily","interval":1}'::jsonb));
  select p into plan from jsonb_array_elements(public.read_train_plans('2026-11-10',null,null)->'plans') p where p->>'seriesId'=created->>'seriesId';
  intent:=jsonb_build_object('protocolVersion',1,'ownerId',auth.uid(),'operationId',gen_random_uuid(),'command',jsonb_build_object('kind','fulfill-plan','occurrenceId',plan->>'occurrenceId','expected',plan->'version'));
  if action='skip' then
   command:=jsonb_build_object('operation','skip','operationId',gen_random_uuid(),'seriesId',plan->>'seriesId','occurrenceId',plan->>'occurrenceId',
    'expectedSeriesToken',plan->'version'->'seriesToken','expectedOccurrenceVersion',plan->'version'->>'occurrenceVersion','expectedTaskVersion',plan->'version'->>'taskVersion','expectedEventVersion',plan->'version'->>'eventVersion');
   if public.planner_routine_command(command)->>'status'<>'complete' then raise exception 'Skip failed'; end if;
  elsif action='delete' then
   delete from public.tasks where id=(plan->>'taskId')::uuid;
  else
   begin
    result:=public.execute_train_plan_command(intent);
    if result->>'status'<>'accepted' then raise exception 'Atomicity setup failed'; end if;
    raise exception using errcode='PT499',message='Injected enclosing transaction failure';
   exception when sqlstate 'PT499' then null; end;
   if exists(select 1 from public.train_plan_command_outcomes where operation_id=(intent->>'operationId')::uuid)
    or public.read_train_plans(null,(plan->>'occurrenceId')::uuid,null)->'plan'->'completed'<>'false'::jsonb then raise exception 'Failed transaction retained planner effect/receipt'; end if;
   continue;
  end if;
  result:=public.execute_train_plan_command(intent);
  if result->>'status' not in ('unavailable_occurrence','not_found') or public.execute_train_plan_command(intent) is distinct from result then raise exception 'Unavailable plan outcome changed: %',result; end if;
 end loop;
 intent:=jsonb_set(intent,'{command,occurrenceId}',to_jsonb(gen_random_uuid()));intent:=jsonb_set(intent,'{operationId}',to_jsonb(gen_random_uuid()));
 result:=public.execute_train_plan_command(intent);
 if result->>'status'<>'not_found' or public.execute_train_plan_command(intent) is distinct from result then raise exception 'Missing occurrence was not stable'; end if;
 original:=intent;
 intent:=jsonb_set(jsonb_set(intent,'{operationId}',to_jsonb(gen_random_uuid())),'{command,expected,seriesToken}','null');
 if public.execute_train_plan_command(intent)->>'status'<>'invalid_request' then raise exception 'Invalid version accepted'; end if;
 perform set_config('request.jwt.claims','{}',true);
 if public.execute_train_plan_command(original)->>'status'<>'unauthenticated' or public.read_train_plans('2026-11-10',null,null)->>'status'<>'unauthenticated' then raise exception 'Unauthenticated planner escaped boundary'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"64220000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare result jsonb; plan jsonb; request jsonb; undo jsonb; begin
 result:=public.planner_routine_command('{"operation":"create","operationId":"64220000-0000-4000-8000-000000000070","activityKind":"training","repeatMode":"once","title":"Undo reference","date":"2026-11-12","startTime":"10:00","endTime":"11:00","timezone":"UTC","protected":false,"rule":{"frequency":"daily","interval":1},"trainingTemplateId":"64220000-0000-4000-8000-000000000010"}');
 plan:=public.read_train_plans('2026-11-12',null,null)->'plans'->0;
 request:=jsonb_build_object('operation','edit','operationId',gen_random_uuid(),'seriesId',plan->>'seriesId','occurrenceId',plan->>'occurrenceId',
 'expectedSeriesToken',plan->'version'->'seriesToken','expectedOccurrenceVersion',plan->'version'->>'occurrenceVersion','expectedTaskVersion',plan->'version'->>'taskVersion','expectedEventVersion',plan->'version'->>'eventVersion',
 'title','Defer and move','date','2026-11-13','startTime','12:00','endTime','13:00','steps','[]'::jsonb,'trainingTemplateId',null);
 result:=public.planner_routine_command(request);
 if result->>'changeId' is null then raise exception 'Editor save lost existing Undo'; end if;
 undo:=jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',result->>'changeId','expectedVersion',(select version from public.planner_changes where id=(result->>'changeId')::uuid));
 result:=public.planner_command(undo);
 if result->>'status'<>'complete' then raise exception 'Template editor broke existing Undo: %',result; end if;
 plan:=public.read_train_plans(null,(plan->>'occurrenceId')::uuid,null)->'plan';
 if plan->>'plannedDay'<>'2026-11-12' or plan->>'title'<>'Undo reference' or plan->>'templateId'<>'64220000-0000-4000-8000-000000000010' then raise exception 'Undo lost original placement/title/template: %',plan; end if;
 if public.planner_command(undo)->>'status'<>'already-applied' then raise exception 'Undo retry not idempotent'; end if;
end $$;
rollback;
