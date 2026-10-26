-- Public authenticated template commands/readback; every fixture is rolled back.
begin;
select set_config('train.fixture.template_was_ready',(select ready::text from fitness_private.template_rollout where singleton),true);
-- Exercise contract C is an upstream dependency; no ordinary exercise writes.
revoke insert,update,delete,truncate,references,trigger on public.exercises from anon,authenticated;
revoke truncate,trigger on public.exercises from service_role;
update fitness_private.custom_exercise_rollout set ready=true where singleton;
select public.sql_fixture_create_auth_user('64190000-0000-4000-8000-000000000001','train-template-owner@example.test');
select public.sql_fixture_create_auth_user('64190000-0000-4000-8000-000000000003','train-template-other@example.test');
insert into public.exercises(id,name,muscle_group_primary,equipment,exercise_type,is_custom)
values('64190000-0000-4000-8000-000000000010','Legacy timed load','other','band','duration_weight',false);
insert into public.exercises(id,name,muscle_group_primary,equipment,exercise_type,is_custom)
values('64190000-0000-4000-8000-000000000040','Unkeyed band load','other','band','weight_reps',false);
insert into public.routines(id,user_id,name) values('64190000-0000-4000-8000-000000000011','64190000-0000-4000-8000-000000000001','Legacy source');
insert into public.routine_exercises(id,routine_id,exercise_id,sort_order,target_sets,target_reps,target_weight_kg,target_duration_seconds,target_distance_meters,rest_timer_seconds,notes)
values('64190000-0000-4000-8000-000000000012','64190000-0000-4000-8000-000000000011','64190000-0000-4000-8000-000000000010',0.75,2,0,0.123,0,12.34,null,'Keep every legacy field'),
('64190000-0000-4000-8000-000000000013','64190000-0000-4000-8000-000000000011','64190000-0000-4000-8000-000000000010',-4,null,null,null,null,null,0,null);
-- After C, construct only this fixture's two synthetic historical sidecars.
-- The standalone migration rehearsal proves real A-to-C preservation; no live
-- contract flag, existing template, or unrelated materialization is reset here.
do $$ begin
 if current_setting('train.fixture.template_was_ready')::boolean then
  insert into fitness_private.template_entries(entry_id,position,targets_resolved,legacy_source)
  select e.id,row_number() over(order by e.sort_order,e.id)-1,coalesce(e.target_sets between 1 and 20,false),
   jsonb_build_object('targetSets',e.target_sets::text,'sortOrder',e.sort_order::text,
    'measurements',jsonb_build_object('weightKg',e.target_weight_kg::text,'reps',e.target_reps::text,'durationSeconds',e.target_duration_seconds::text,'distanceMeters',e.target_distance_meters::text))
  from public.routine_exercises e where e.routine_id='64190000-0000-4000-8000-000000000011';
  insert into fitness_private.template_targets(id,entry_id,position,kind,weight_kg,reps,duration_seconds,distance_meters)
  select gen_random_uuid(),e.id,i,'working',e.target_weight_kg,e.target_reps,e.target_duration_seconds,e.target_distance_meters
  from public.routine_exercises e cross join generate_series(0,1) i where e.id='64190000-0000-4000-8000-000000000012';
 end if;
end $$;
create temporary table original_legacy_entry as select id,to_jsonb(e) as value from public.routine_exercises e where routine_id='64190000-0000-4000-8000-000000000011';
do $$ declare previous bigint; begin
 select version into previous from public.routines where id='64190000-0000-4000-8000-000000000011';
 update public.routines set last_performed_at='2026-10-25T00:00:00Z' where id='64190000-0000-4000-8000-000000000011';
 update public.routines set last_performed_at=last_performed_at where id='64190000-0000-4000-8000-000000000011';
 if (select version from public.routines where id='64190000-0000-4000-8000-000000000011')<>previous then raise exception 'Usage changed content revision'; end if;
end $$;
create temporary table original_legacy_parent as select to_jsonb(r) as value from public.routines r where id='64190000-0000-4000-8000-000000000011';
select set_config('request.jwt.claims','{"sub":"64190000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare request jsonb := '{"protocolVersion":1,"operationId":"64190000-0000-4000-8000-000000000002","command":{"kind":"create","name":"Empty session","notes":null,"entries":[]}}';
begin
 if not current_setting('train.fixture.template_was_ready')::boolean then
  if public.execute_train_template_command(request)->>'status' is distinct from 'not_ready' then raise exception 'Expansion enabled new commands'; end if;
 elsif public.train_template_capabilities()->'templates'->'ready' is distinct from 'true'::jsonb then
  raise exception 'C did not advertise ready template capability';
 end if;
end $$;
reset role;
-- The production C migration calls this only after exact B alias/cookie proof.
select fitness_private.activate_template_contract();
do $$ begin
 if exists(select 1 from original_legacy_entry original join public.routine_exercises e using(id) where original.value is distinct from to_jsonb(e)) then raise exception 'Cutover rewrote original legacy fields'; end if;
 if (select value from original_legacy_parent) is distinct from (select to_jsonb(r) from public.routines r where id='64190000-0000-4000-8000-000000000011') then raise exception 'Cutover rewrote original parent content/version/timestamps'; end if;
end $$;
set local role authenticated;
do $$
declare request jsonb := '{"protocolVersion":1,"operationId":"64190000-0000-4000-8000-000000000002","command":{"kind":"create","name":"Empty session","notes":null,"entries":[]}}'; first_result jsonb; readback jsonb;
begin
 first_result := public.execute_train_template_command(request);
 if first_result->>'status' is distinct from 'accepted' then raise exception 'Named empty template rejected: %',first_result; end if;
 if first_result->'receipt'->'template'->'entries' is distinct from '[]'::jsonb or first_result->'receipt'->'template'->>'version' is null then raise exception 'Empty template altered'; end if;
 if public.execute_train_template_command(request) is distinct from first_result then raise exception 'Retry changed first receipt'; end if;
 if public.execute_train_template_command(jsonb_set(request,'{command,name}','"Different"'))->>'status' is distinct from 'operation_conflict' then raise exception 'Changed retry accepted'; end if;
 readback:=public.read_train_templates('64190000-0000-4000-8000-000000000002',null);
 if readback->'template' is distinct from first_result->'receipt'->'template' then raise exception 'Saved content differs from readback'; end if;
 if readback->'startability'->'ready' is distinct from 'true'::jsonb then raise exception 'Empty session was not startable'; end if;
 readback:=public.read_train_templates('64190000-0000-4000-8000-000000000011',null);
 if readback->'template'->'entries'->0->>'id'<>'64190000-0000-4000-8000-000000000013' or readback->'template'->'entries'->0->'targets' is distinct from '{"kind":"legacy-unresolved"}'::jsonb then raise exception 'Unknown count/order was invented'; end if;
 if readback->'template'->'entries'->1->'targets'->'items'->0->'measurements' is distinct from '{"weightKg":"0.123","reps":"0","durationSeconds":"0","distanceMeters":"12.34"}'::jsonb
  or jsonb_array_length(readback->'template'->'entries'->1->'targets'->'items')<>2
  or readback->'template'->'entries'->1->'restSeconds' is distinct from 'null'::jsonb then raise exception 'Legacy values/null rest changed: %',readback; end if;
 if readback->'definitions'->0->>'kind'<>'unkeyed-preset' or readback->'definitions'->0->>'exerciseId'<>'64190000-0000-4000-8000-000000000010' then raise exception 'Real unkeyed identity unavailable'; end if;
 if readback->'startability'->'ready' is distinct from 'false'::jsonb then raise exception 'Unsupported/unresolved legacy source advertised startable'; end if;
 perform set_config('request.jwt.claims','{"sub":"64190000-0000-4000-8000-000000000003","role":"authenticated"}',true);
 if public.read_train_templates('64190000-0000-4000-8000-000000000002',null) is distinct from '{"status":"not_found"}'::jsonb then raise exception 'Foreign template leaked'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"64190000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare request jsonb := '{"protocolVersion":1,"operationId":"64190000-0000-4000-8000-000000000020","command":{"kind":"create","name":"Repeated ordered exercise","notes":null,"entries":[{"id":"64190000-0000-4000-8000-000000000021","exerciseId":"64190000-0000-4000-8000-000000000010","notes":"First","restSeconds":0,"targets":[{"id":"64190000-0000-4000-8000-000000000022","kind":"warmup","measurements":{"weightKg":0.123,"reps":5,"durationSeconds":90,"distanceMeters":12.34}},{"id":"64190000-0000-4000-8000-000000000023","kind":"working","measurements":{"weightKg":0.45359237,"reps":7,"durationSeconds":120,"distanceMeters":null}}]},{"id":"64190000-0000-4000-8000-000000000024","exerciseId":"64190000-0000-4000-8000-000000000010","notes":null,"restSeconds":null,"targets":[{"id":"64190000-0000-4000-8000-000000000025","kind":"working","measurements":{"weightKg":null,"reps":null,"durationSeconds":null,"distanceMeters":null}}]}]}}'; result jsonb; edited jsonb; edit_request jsonb; first_rejection jsonb;
begin
 result:=public.execute_train_template_command(request);
 if result->>'status' is distinct from 'accepted' then raise exception 'Heterogeneous template rejected: %',result; end if;
 if result->'receipt'->'template'->'entries'->0->'targets'->'items'->1->'measurements'->>'weightKg'<>'0.45359237'
  or result->'receipt'->'template'->'entries'->0->'targets'->'items'->0->>'kind'<>'warmup'
  or jsonb_array_length(result->'receipt'->'template'->'entries')<>2 then raise exception 'Target authority flattened values/order'; end if;
 edit_request:=jsonb_build_object('protocolVersion',1,'operationId','64190000-0000-4000-8000-000000000026','command',jsonb_build_object('kind','edit','templateId','64190000-0000-4000-8000-000000000020','expectedVersion',result->'receipt'->'template'->>'version','changes','[{"kind":"patch-target","entryId":"64190000-0000-4000-8000-000000000021","targetId":"64190000-0000-4000-8000-000000000022","patch":{"measurements":{"weightKg":1.133980925}}},{"kind":"order-entries","entryIds":["64190000-0000-4000-8000-000000000024","64190000-0000-4000-8000-000000000021"]}]'::jsonb));
 edited:=public.execute_train_template_command(edit_request);
 if edited->>'status' is distinct from 'accepted' or (edited->'receipt'->'template'->>'version')::bigint<=(result->'receipt'->'template'->>'version')::bigint then raise exception 'CAS edit failed: %',edited; end if;
 if edited->'receipt'->'template'->'entries'->1->'targets'->'items'->0->'measurements' is distinct from '{"weightKg":"1.133980925","reps":"5","durationSeconds":"90","distanceMeters":"12.34"}'::jsonb then raise exception 'Narrow patch lost deferred values'; end if;
 if public.execute_train_template_command(request) is distinct from result then raise exception 'Later content changed create receipt'; end if;
 edit_request:=jsonb_set(edit_request,'{operationId}','"64190000-0000-4000-8000-000000000027"');
 first_rejection:=public.execute_train_template_command(edit_request);
 if first_rejection->>'status' is distinct from 'version_conflict' or first_rejection->'rejection'->'current' is distinct from edited->'receipt'->'template' then raise exception 'Stale edit lacks owned current version'; end if;
 if public.execute_train_template_command(edit_request) is distinct from first_rejection then raise exception 'Rejection retry changed first evidence'; end if;
 result:=public.read_train_template_definitions(null);
 if not exists(select 1 from jsonb_array_elements(result->'definitions') row where row->'definition'->>'exerciseId'='64190000-0000-4000-8000-000000000010' and row->'definition'->>'name'='Legacy timed load' and row->'archivedAt'='null'::jsonb) then raise exception 'Selectable real identity missing'; end if;
end $$;
do $$ declare result jsonb; begin
 result:=public.execute_train_template_command('{"protocolVersion":1,"operationId":"64190000-0000-4000-8000-000000000060","command":{"kind":"create","name":"Colliding identities","notes":null,"entries":[{"id":"64190000-0000-4000-8000-000000000061","exerciseId":"64190000-0000-4000-8000-000000000040","notes":null,"restSeconds":null,"targets":[{"id":"64190000-0000-4000-8000-000000000061","kind":"working","measurements":{"weightKg":null,"reps":null,"durationSeconds":null,"distanceMeters":null}}]}]}}');
 if result->>'status' is distinct from 'invalid_template' or exists(select 1 from public.routines where id='64190000-0000-4000-8000-000000000060') then raise exception 'Accepted unreadable cross-domain identity: %',result; end if;
end $$;
do $$
declare source uuid:='64190000-0000-4000-8000-000000000030'; workout_entry uuid:='64190000-0000-4000-8000-000000000031';
 request jsonb:='{"protocolVersion":1,"operationId":"64190000-0000-4000-8000-000000000032","command":{"kind":"save-workout-as-template","workoutId":"64190000-0000-4000-8000-000000000030","name":"Representative zero"}}'; result jsonb;
begin
 insert into public.workouts(id,user_id,title,status) values(source,auth.uid(),'Unfinished source','in_progress');
 insert into public.workout_exercises(id,workout_id,exercise_id,rest_timer_seconds) values(workout_entry,source,'64190000-0000-4000-8000-000000000010',null);
 insert into public.workout_sets(workout_exercise_id,set_number,set_type,weight_kg,duration_seconds,is_completed) values(workout_entry,1,'normal',0.123,0,false),(workout_entry,2,'normal',0.45359237,0,false),(workout_entry,3,'warmup',99,900,true);
 result:=public.execute_train_template_command(request);
 if result->>'status' is distinct from 'accepted' then raise exception 'Continuing source conversion failed: %',result; end if;
 if jsonb_array_length(result->'receipt'->'template'->'entries'->0->'targets'->'items')<>2
  or result->'receipt'->'template'->'entries'->0->'targets'->'items'->0->'measurements' is distinct from '{"weightKg":"0.123","reps":null,"durationSeconds":"0","distanceMeters":null}'::jsonb then raise exception 'Representative zero selection was rewritten: %',result; end if;
 delete from public.workouts where id=source;
 if public.execute_train_template_command(request) is distinct from result then raise exception 'Retry reread disappeared source'; end if;
 insert into public.workouts(id,user_id,title,status) values('64190000-0000-4000-8000-000000000062',auth.uid(),'Empty source','discarded');
 result:=public.execute_train_template_command('{"protocolVersion":1,"operationId":"64190000-0000-4000-8000-000000000063","command":{"kind":"save-workout-as-template","workoutId":"64190000-0000-4000-8000-000000000062","name":"Empty conversion"}}');
 if result->>'status' is distinct from 'invalid_template' then raise exception 'Empty source fabricated a representative conversion'; end if;
 delete from public.workouts where id='64190000-0000-4000-8000-000000000062';
end $$;
do $$
declare document jsonb:='{"version":4,"id":"64190000-0000-4000-8000-000000000041","ownerId":"64190000-0000-4000-8000-000000000001","sourceId":"64190000-0000-4000-8000-000000000042","startedAt":"2026-10-25T10:00:00Z","completedAt":"2026-10-25T10:05:00Z","durationSeconds":300,"timezone":"UTC","workoutDay":"2026-10-25","planId":null,"exercises":[{"id":"64190000-0000-4000-8000-000000000043","definition":{"reference":{"kind":"preset","exerciseId":"64190000-0000-4000-8000-000000000040"},"name":"Unkeyed band load","equipment":"band","mode":"weight_reps","convention":null},"sets":[{"id":"64190000-0000-4000-8000-000000000044","performed":{"mode":"weight_reps","weightKg":0.123,"reps":5,"kind":"working"}}]}]}'; result jsonb; origin jsonb;
begin
 result:=public.execute_train_template_command('{"protocolVersion":1,"operationId":"64190000-0000-4000-8000-000000000045","command":{"kind":"create","name":"Full origin","notes":null,"entries":[{"id":"64190000-0000-4000-8000-000000000046","exerciseId":"64190000-0000-4000-8000-000000000040","notes":null,"restSeconds":null,"targets":[{"id":"64190000-0000-4000-8000-000000000047","kind":"working","measurements":{"weightKg":0.123,"reps":5,"durationSeconds":null,"distanceMeters":12.34}},{"id":"64190000-0000-4000-8000-000000000048","kind":"warmup","measurements":{"weightKg":null,"reps":null,"durationSeconds":null,"distanceMeters":null}}]}]}}');
 if result->>'status'<>'accepted' then raise exception 'Origin fixture creation failed'; end if;
 origin:=jsonb_build_object('content',result->'receipt'->'template','definitions',jsonb_build_array(jsonb_build_object('entryId','64190000-0000-4000-8000-000000000046','definition',document->'exercises'->0->'definition')),
 'bindings','[{"entryId":"64190000-0000-4000-8000-000000000046","workoutEntryId":"64190000-0000-4000-8000-000000000043","targets":[{"targetId":"64190000-0000-4000-8000-000000000047","workoutSetId":"64190000-0000-4000-8000-000000000044"},{"targetId":"64190000-0000-4000-8000-000000000048","workoutSetId":"64190000-0000-4000-8000-000000000049"}]}]'::jsonb);
 document:=document||jsonb_build_object('templateOrigin',origin);
 result:=public.upload_completed_workout((document->>'id')::uuid,jsonb_set(document,'{exercises,0,definition,name}','"Changed bound capture"'));
 if result->>'status' is distinct from 'invalid_completion' then raise exception 'Origin binding accepted a different captured meaning: %',result; end if;
 result:=public.upload_completed_workout((document->>'id')::uuid,document);
 if result->>'status' is distinct from 'accepted' then raise exception 'V4 template origin rejected: %',result; end if;
 set constraints all immediate;
 if not exists(select 1 from public.workouts where id=(document->>'id')::uuid and routine_id='64190000-0000-4000-8000-000000000045' and recorded_completion=document and native_completion is null) then raise exception 'Template reference/capture not retained'; end if;
 if public.upload_completed_workout((document->>'id')::uuid,document) is distinct from result then raise exception 'V4 retry changed first receipt'; end if;
end $$;
do $$
declare result jsonb; current_version text;
begin
 current_version:=public.read_train_templates('64190000-0000-4000-8000-000000000045',null)->'template'->>'version';
 result:=public.execute_train_template_command(jsonb_build_object('protocolVersion',1,'operationId','64190000-0000-4000-8000-000000000050','command',jsonb_build_object('kind','archive','templateId','64190000-0000-4000-8000-000000000045','expectedVersion',current_version)));
 if result->>'status'<>'accepted' then raise exception 'Archive failed'; end if;
 current_version:=result->'receipt'->'template'->>'version';
 result:=public.start_train_template_workout(auth.uid(),'64190000-0000-4000-8000-000000000045');
 if result->>'status' is distinct from 'started' or result->'workout'->'exercises'->0->'sets'->0->'weight_kg'<>'0.123'::jsonb
  or result->'workout'->'exercises'->0->'sets'->0->'is_completed'<>'false'::jsonb
  or result->'workout'->'exercises'->0->'sets'->1->>'set_type'<>'warmup'
  or result->'workout'->'exercises'->0->'sets'->1->'reps'<>'null'::jsonb
  or result->'workout'->'exercises'->0->'rest_timer_seconds'<>'null'::jsonb then raise exception 'Web start flattened targets or invented actuals: %',result; end if;
 if public.read_train_templates('64190000-0000-4000-8000-000000000045',null)->'template'->>'version'<>current_version then raise exception 'Starting changed content authority'; end if;
 if public.start_train_template_workout(auth.uid(),'64190000-0000-4000-8000-000000000045')->>'status'<>'conflict' then raise exception 'Web active uniqueness lost'; end if;
 delete from public.workouts where id=(result->'workout'->>'id')::uuid;
 result:=public.start_train_template_workout(auth.uid(),'64190000-0000-4000-8000-000000000020');
 if result->>'status' is distinct from 'started' or result->'workout'->'exercises'->1->'sets'->0->'weight_kg'<>'1.133980925'::jsonb
  or result->'workout'->'exercises'->1->'sets'->0->'duration_seconds'<>'90'::jsonb
  or result->'workout'->'exercises'->1->'sets'->1->'weight_kg'<>'0.45359237'::jsonb then raise exception 'Continuing deferred-mode Web start changed: %',result; end if;
 delete from public.workouts where id=(result->'workout'->>'id')::uuid;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"64190000-0000-4000-8000-000000000003","role":"service_role"}',true);
select set_config('request.jwt.claim.sub','64190000-0000-4000-8000-000000000003',true);
set local role service_role;
do $$
declare result jsonb; claims text:=current_setting('request.jwt.claims'); subject text:=current_setting('request.jwt.claim.sub');
begin
 result:=public.mcp_read_train_templates('64190000-0000-4000-8000-000000000001',null);
 if result->>'status'<>'available' or not exists(select 1 from jsonb_array_elements(result->'templates') t where t->'template'->>'id'='64190000-0000-4000-8000-000000000045') then raise exception 'MCP owned target authority missing'; end if;
 if public.mcp_read_train_templates('64190000-0000-4000-8000-000000000003',null)->'templates'<>'[]'::jsonb then raise exception 'MCP read crossed owner'; end if;
 result:=public.mcp_workout_command('64190000-0000-4000-8000-000000000001','start_train_template_workout','{"p_user_id":"64190000-0000-4000-8000-000000000001","p_template_id":"64190000-0000-4000-8000-000000000045"}');
 if result->>'status'<>'started' then raise exception 'MCP could not use authoritative target start: %',result; end if;
 delete from public.workouts where id=(result->'workout'->>'id')::uuid;
 begin
  perform public.mcp_workout_command('64190000-0000-4000-8000-000000000001','start_train_template_workout','{"p_user_id":"64190000-0000-4000-8000-000000000001","p_template_id":"not-an-id"}');
  raise exception 'Invalid trusted request accepted';
 exception when invalid_text_representation then null; end;
 if current_setting('request.jwt.claims') is distinct from claims or current_setting('request.jwt.claim.sub') is distinct from subject then raise exception 'MCP claims leaked after success/exception'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"64190000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','64190000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare result jsonb; begin
 begin perform public.mcp_read_train_templates(auth.uid(),null); raise exception 'Untrusted caller reached MCP bridge'; exception when insufficient_privilege then null; end;
 begin update public.routines set name='Bypass' where id='64190000-0000-4000-8000-000000000045'; raise exception 'Ordinary content write bypassed CAS'; exception when insufficient_privilege then null; end;
 result:=public.start_workout_from_routine(auth.uid(),'{"routine_id":"64190000-0000-4000-8000-000000000045","title":"Forged aggregate"}','[]');
 if result->>'title'<>'Full origin' or jsonb_array_length(result->'exercises'->0->'sets')<>2 then raise exception 'Continuing legacy RPC bypassed target authority'; end if;
 delete from public.workouts where id=(result->>'id')::uuid;
end $$;
reset role;
update public.exercises set exercise_type='bodyweight_reps' where id='64190000-0000-4000-8000-000000000040';
set local role authenticated;
do $$ declare result jsonb; begin
 result:=public.execute_train_template_command('{"protocolVersion":1,"operationId":"64190000-0000-4000-8000-000000000064","command":{"kind":"save-workout-as-template","workoutId":"64190000-0000-4000-8000-000000000041","name":"Changed recording meaning"}}');
 if result->>'status' is distinct from 'invalid_template' then raise exception 'Conversion silently reinterpreted captured meaning: %',result; end if;
end $$;
reset role;
delete from auth.users where id='64190000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.routines where user_id='64190000-0000-4000-8000-000000000001') or exists(select 1 from public.workouts where user_id='64190000-0000-4000-8000-000000000001')
  or exists(select 1 from public.train_template_command_outcomes where owner_id='64190000-0000-4000-8000-000000000001')
  or not exists(select 1 from auth.users where id='64190000-0000-4000-8000-000000000003') then raise exception 'Linked v4 account cascade lost isolation/left residue'; end if;
end $$;
rollback;
