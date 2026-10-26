-- Admin fixture: rehearse the separate C gate/grants inside a rollback only.
-- Production activation still requires the reviewed B alias/cookie proof.
begin;
-- Preserve the A→C boundary proof after the deployed database has reached C.
update fitness_private.custom_exercise_rollout set ready=false where singleton;
grant insert,update,delete on public.exercises to authenticated;
select public.sql_fixture_create_auth_user('11111111-1111-4111-8111-111111111111','train-custom-contract@example.test');
select public.sql_fixture_create_auth_user('88888888-8888-4888-8888-888888888888','train-custom-other@example.test');
insert into public.exercises(id,user_id,name,is_custom,muscle_group_primary,muscle_groups_secondary,equipment,exercise_type,created_at,updated_at)
values('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111','',true,'other',null,'band','weight_reps',null,null);
insert into public.routines(id,user_id,name) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Retained custom reference');
insert into public.routine_exercises(routine_id,exercise_id,sort_order,target_sets,target_reps,rest_timer_seconds)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','99999999-9999-4999-8999-999999999999',0,2,5,null);
insert into public.exercise_media(exercise_id,instructions) values('99999999-9999-4999-8999-999999999999',array['Preserved linked media']);
-- First prove the A gate without creating an outcome; the same durable command
-- may proceed after the real release becomes ready.
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
do $$
declare command_request jsonb := '{"protocolVersion":1,"operationId":"22222222-2222-4222-8222-222222222222","command":{"kind":"create","definition":{"name":"My kettlebell press","equipment":"kettlebell","mode":"weight_reps","convention":"selected-load","primaryMuscle":"shoulders","secondaryMuscles":[]}}}'; document jsonb := '{"version":3,"id":"44444444-4444-4444-8444-444444444444","ownerId":"11111111-1111-4111-8111-111111111111","sourceId":"55555555-5555-4555-8555-555555555555","startedAt":"2026-10-25T10:00:00Z","completedAt":"2026-10-25T10:05:00Z","durationSeconds":300,"timezone":"UTC","workoutDay":"2026-10-25","planId":null,"exercises":[{"id":"66666666-6666-4666-8666-666666666666","definition":{"reference":{"kind":"custom","exerciseId":"22222222-2222-4222-8222-222222222222","ownerId":"11111111-1111-4111-8111-111111111111"},"name":"My kettlebell press","equipment":"kettlebell","mode":"weight_reps","convention":"selected-load"},"sets":[{"id":"77777777-7777-4777-8777-777777777777","performed":{"mode":"weight_reps","weightKg":0.123,"reps":5,"kind":"working"}}]}]}';
begin
 begin
   delete from public.exercises where id='99999999-9999-4999-8999-999999999999';
   set constraints routine_exercises_exercise_id_fkey immediate;
   raise exception 'Phase A allowed deleting a referenced definition';
 exception when foreign_key_violation then null; end;
 if public.execute_train_exercise_command(command_request)->>'status'<>'not_ready' then raise exception 'A allowed command creation'; end if;
 if public.upload_completed_workout((document->>'id')::uuid,document)->>'status'<>'invalid_completion' then raise exception 'A allowed v3 recording'; end if;
 if exists(select 1 from public.train_exercise_command_outcomes where operation_id=(command_request->>'operationId')::uuid) then raise exception 'A wrote a false rejection'; end if;
end $$;
reset role;
revoke insert,update,delete,truncate,references,trigger on public.exercises from anon,authenticated;
revoke truncate,trigger on public.exercises from service_role;
update fitness_private.custom_exercise_rollout set ready=true where singleton;
set local role authenticated;
do $$
declare command_request jsonb := '{"protocolVersion":1,"operationId":"22222222-2222-4222-8222-222222222222","command":{"kind":"create","definition":{"name":"My kettlebell press","equipment":"kettlebell","mode":"weight_reps","convention":"selected-load","primaryMuscle":"shoulders","secondaryMuscles":[]}}}'; document jsonb := '{"version":3,"id":"44444444-4444-4444-8444-444444444444","ownerId":"11111111-1111-4111-8111-111111111111","sourceId":"55555555-5555-4555-8555-555555555555","startedAt":"2026-10-25T10:00:00Z","completedAt":"2026-10-25T10:05:00Z","durationSeconds":300,"timezone":"UTC","workoutDay":"2026-10-25","planId":null,"exercises":[{"id":"66666666-6666-4666-8666-666666666666","definition":{"reference":{"kind":"custom","exerciseId":"22222222-2222-4222-8222-222222222222","ownerId":"11111111-1111-4111-8111-111111111111"},"name":"My kettlebell press","equipment":"kettlebell","mode":"weight_reps","convention":"selected-load"},"sets":[{"id":"77777777-7777-4777-8777-777777777777","performed":{"mode":"weight_reps","weightKg":0.123,"reps":5,"kind":"working"}}]}]}'; accepted jsonb; first_receipt jsonb; result jsonb; invalid jsonb; identity uuid; saved public.exercises;
begin
 accepted:=public.execute_train_exercise_command(command_request);
 if accepted->>'status'<>'accepted' or accepted->'receipt'->'definition'->>'version'<>'1' then raise exception 'C create failed: %',accepted; end if;
 if public.execute_train_exercise_command(command_request) is distinct from accepted then raise exception 'Create retry changed first receipt'; end if;
 if public.execute_train_exercise_command(jsonb_set(command_request,'{command,definition,__proto__}','{"retained":true}'))->>'status'<>'operation_conflict' then raise exception 'Malformed changed command_request bypassed operation identity'; end if;
 result:=public.execute_train_exercise_command('{"protocolVersion":1,"operationId":"33333333-3333-4333-8333-333333333334","command":{"kind":"update-metadata","exerciseId":"22222222-2222-4222-8222-222222222222","expectedVersion":"1","patch":{"name":"Renamed after capture"}}}');
 if result->'receipt'->'definition'->>'version'<>'2' then raise exception 'Version did not increment exactly once'; end if;
 result:=public.execute_train_exercise_command('{"protocolVersion":1,"operationId":"33333333-3333-4333-8333-333333333335","command":{"kind":"archive","exerciseId":"22222222-2222-4222-8222-222222222222","expectedVersion":"2"}}');
 if result->'receipt'->'definition'->>'version'<>'3' then raise exception 'Archive failed'; end if;
 if public.execute_train_exercise_command(command_request) is distinct from accepted then raise exception 'Newer state rewrote original create receipt'; end if;
 first_receipt:=public.upload_completed_workout((document->>'id')::uuid,document);
 if first_receipt->>'status'<>'accepted' then raise exception 'Archived captured custom reference failed: %',first_receipt; end if;
 set constraints all immediate;
 if not exists(select 1 from public.workouts where id=(document->>'id')::uuid and native_completion is null and recorded_completion=document)
   or not exists(select 1 from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id
     where e.workout_id=(document->>'id')::uuid and e.exercise_id='22222222-2222-4222-8222-222222222222' and s.weight_kg=0.123 and s.reps=5 and s.is_completed) then
   raise exception 'Custom identity, exact measures or snapshot changed'; end if;
 if public.upload_completed_workout((document->>'id')::uuid,document) is distinct from first_receipt then raise exception 'V3 first receipt changed'; end if;
 begin
   update public.exercises set name='Direct write bypass' where id='22222222-2222-4222-8222-222222222222';
   raise exception 'Ordinary direct update allowed';
 exception when insufficient_privilege then null; end;
 begin
   delete from public.exercises where id='22222222-2222-4222-8222-222222222222';
   raise exception 'Ordinary direct delete allowed';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.exercises(name,user_id,is_custom,muscle_group_primary,equipment,exercise_type) values('Direct',auth.uid(),true,'other','band','duration');
   raise exception 'Ordinary direct insert allowed';
 exception when insufficient_privilege then null; end;
 if has_table_privilege('authenticated','public.exercises','TRUNCATE') or has_table_privilege('authenticated','public.exercises','TRIGGER') then raise exception 'Bypass grants remained'; end if;
 -- Unknown legacy meaning is retained rather than filled during maintenance.
 result:=public.execute_train_exercise_command('{"protocolVersion":1,"operationId":"33333333-3333-4333-8333-333333333336","command":{"kind":"archive","exerciseId":"99999999-9999-4999-8999-999999999999","expectedVersion":"1"}}');
 if result->'receipt'->'definition'->'convention'<>'null'::jsonb or result->'receipt'->'definition'->'secondaryMuscles'<>'null'::jsonb then raise exception 'Legacy unknown metadata was filled'; end if;
 identity:=gen_random_uuid(); invalid:=jsonb_set(document,'{id}',to_jsonb(identity));
 invalid:=jsonb_set(invalid,'{exercises,0,definition,reference,ownerId}','"88888888-8888-4888-8888-888888888888"');
 if public.upload_completed_workout(identity,invalid)->>'status'<>'invalid_completion' then raise exception 'Foreign declared owner accepted'; end if;
 -- A valid UUID for another owned definition cannot be substituted for the
 -- captured one just because both catalog keys are NULL.
 identity:=gen_random_uuid(); invalid:=jsonb_set(document,'{id}',to_jsonb(identity));
 invalid:=jsonb_set(invalid,'{exercises,0,definition,reference,exerciseId}','"99999999-9999-4999-8999-999999999999"');
 if public.upload_completed_workout(identity,invalid)->>'status'<>'reference_unavailable' then raise exception 'Custom reference identity/meaning was not checked'; end if;
 if (public.train_history_capabilities()->>'historyReady')::boolean then
  begin
   delete from public.workouts where id=(document->>'id')::uuid;
   raise exception 'Unreviewed completed deletion bypassed current authority';
  exception when check_violation then null; end;
  if public.execute_train_history_command(jsonb_build_object('protocolVersion',1,'ownerId',auth.uid(),'operationId',gen_random_uuid(),
    'command',jsonb_build_object('kind','delete-workout','workoutId',(document->>'id')::uuid,'expectedRevision',public.read_train_history_record((document->>'id')::uuid)->'record'->>'revision')))->'receipt'->>'operation' is distinct from 'delete-workout' then
   raise exception 'Reviewed completed deletion was not accepted';
  end if;
  if public.read_train_history_record((document->>'id')::uuid)->'record'->>'state' is distinct from 'deleted' then
   raise exception 'Reviewed completed deletion did not retain its tombstone';
  end if;
 else
  delete from public.workouts where id=(document->>'id')::uuid;
 end if;
 if public.upload_completed_workout((document->>'id')::uuid,document) is distinct from first_receipt or exists(select 1 from public.workouts where id=(document->>'id')::uuid) then raise exception 'Delayed create resurrected deleted v3'; end if;
 perform set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}',true);
 result:=public.read_train_custom_exercises('22222222-2222-4222-8222-222222222222',null);
 if result->>'status'<>'not_found' or result ? 'definition' then raise exception 'Foreign read leaked definition'; end if;
end $$;
reset role;
-- Exercise every independent equipment/mode choice through the public commands,
-- then retain their completed references until the account-cascade assertion.
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
do $$
declare equipment text; mode text; convention text; definition_id uuid; workout_id uuid; result jsonb; definition jsonb; measure jsonb; document jsonb; noncanonical jsonb;
begin
 foreach equipment in array array['barbell','dumbbell','machine','bodyweight','kettlebell','band','cable','other','none'] loop
  foreach mode in array array['weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration'] loop
   convention:=case mode when 'weight_reps' then case equipment when 'barbell' then 'barbell-total' when 'dumbbell' then 'per-dumbbell' else 'selected-load' end
     when 'bodyweight_reps' then 'bodyweight-repetitions' when 'weighted_bodyweight' then 'added-load' when 'assisted_bodyweight' then 'assistance' else 'seconds' end;
   definition_id:=gen_random_uuid(); workout_id:=gen_random_uuid();
   if equipment='barbell' and mode='weight_reps' then definition_id:='abcdefab-1111-4111-8111-abcdefabcdef'; end if;
   result:=public.execute_train_exercise_command(jsonb_build_object('protocolVersion',1,'operationId',definition_id,'command',jsonb_build_object('kind','create','definition',
     jsonb_build_object('name',equipment||' '||mode,'equipment',equipment,'mode',mode,'convention',convention,'primaryMuscle','other','secondaryMuscles','[]'::jsonb))));
   if result->>'status'<>'accepted' or result->'receipt'->'definition'->>'convention' is distinct from convention then raise exception 'Independent matrix choice failed: % % %',equipment,mode,result; end if;
   measure:=case mode when 'weight_reps' then '{"weightKg":0.123,"reps":9007199254740991}'::jsonb
    when 'bodyweight_reps' then '{"reps":8}'::jsonb when 'weighted_bodyweight' then '{"addedWeightKg":0.45359237,"reps":6}'::jsonb
    when 'assisted_bodyweight' then '{"assistanceKg":0,"reps":5}'::jsonb else '{"durationSeconds":90}'::jsonb end || jsonb_build_object('mode',mode,'kind','warmup');
   definition:=jsonb_build_object('reference',jsonb_build_object('kind','custom','exerciseId',definition_id,'ownerId',auth.uid()),'name',equipment||' '||mode,'equipment',equipment,'mode',mode,'convention',convention);
   document:=jsonb_build_object('version',3,'id',workout_id,'ownerId',auth.uid(),'sourceId',gen_random_uuid(),'startedAt','2026-10-25T10:00:00Z','completedAt','2026-10-25T10:05:00Z',
     'durationSeconds',300,'timezone','UTC','workoutDay','2026-10-25','planId',null,'exercises',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'definition',definition,
       'sets',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'performed',measure)))));
   set constraints all deferred;
   if equipment='barbell' and mode='weight_reps' then
     noncanonical:=jsonb_set(document,'{exercises,0,definition,reference,exerciseId}',to_jsonb(upper(definition_id::text)));
     if public.upload_completed_workout(workout_id,noncanonical)->>'status'<>'invalid_completion' then raise exception 'Noncanonical custom identity entered unreadable history'; end if;
     if exists(select 1 from public.workouts where id=workout_id) or exists(select 1 from public.train_completion_receipts where operation_id=workout_id) then raise exception 'Invalid custom identity left an outcome'; end if;
   end if;
   if public.upload_completed_workout(workout_id,document)->>'status'<>'accepted' then raise exception 'Custom completion failed: % %',equipment,mode; end if;
   set constraints all immediate;
   if not exists(select 1 from public.workouts where id=workout_id and recorded_completion=document and native_completion is null) then raise exception 'Custom captured facts changed'; end if;
  end loop;
 end loop;
 foreach mode in array array['duration_weight','distance_duration','weight_distance'] loop
   definition_id:=gen_random_uuid();
   result:=public.execute_train_exercise_command(jsonb_build_object('protocolVersion',1,'operationId',definition_id,'command',jsonb_build_object('kind','create','definition',
     jsonb_build_object('name','Continuing Web '||mode,'equipment','none','mode',mode,'convention',null,'primaryMuscle','other','secondaryMuscles','[]'::jsonb))));
   if result->>'status'<>'accepted' or result->'receipt'->'definition'->'convention'<>'null'::jsonb then raise exception 'Deferred Web definition was reinterpreted'; end if;
 end loop;
 result:=public.read_train_custom_exercises();
 if result->>'status'<>'available' or jsonb_array_length(result->'definitions')<>50 then raise exception 'Owned read omitted archived or deferred definitions: %',result; end if;
end $$;
reset role;
do $$
begin
 begin
   update public.exercises set equipment='barbell' where id='22222222-2222-4222-8222-222222222222';
   raise exception 'Privileged writer changed known recording meaning';
 exception when check_violation then null; end;
 begin
   update public.exercises set measurement_convention='selected-load' where id='99999999-9999-4999-8999-999999999999';
   raise exception 'Privileged writer filled unknown legacy meaning';
 exception when check_violation then null; end;
end $$;
-- Restore the ordinary transaction default after eager projection assertions.
set constraints all deferred;
-- Account erasure remains the lifecycle boundary for independent receipts.
delete from auth.users where id in ('11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888');
set constraints all immediate;
do $$begin
 if exists(select 1 from public.train_exercise_command_outcomes where owner_id='11111111-1111-4111-8111-111111111111')
   or exists(select 1 from public.train_completion_receipts where owner_id='11111111-1111-4111-8111-111111111111')
   or exists(select 1 from public.workouts where user_id='11111111-1111-4111-8111-111111111111')
   or exists(select 1 from public.routines where user_id='11111111-1111-4111-8111-111111111111')
   or exists(select 1 from public.exercises where user_id='11111111-1111-4111-8111-111111111111')
   or exists(select 1 from public.exercise_media where exercise_id='99999999-9999-4999-8999-999999999999') then raise exception 'Profile erasure left owned data or independent receipts'; end if;
end $$;
rollback;
