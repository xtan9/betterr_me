-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('64160000-0000-4000-8000-000000000001','train-measurement-owner@example.test');
select set_config('request.jwt.claims','{"sub":"64160000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare document jsonb := '{"version":2,"id":"64160000-0000-4000-8000-000000000010","ownerId":"64160000-0000-4000-8000-000000000001","sourceId":"64160000-0000-4000-8000-000000000020","startedAt":"2026-10-25T10:00:00.000Z","completedAt":"2026-10-25T10:01:30.000Z","durationSeconds":90,"timezone":"America/Los_Angeles","workoutDay":"2026-10-25","planId":"opaque:kept-only-as-provenance","exercises":[{"id":"64160000-0000-4000-8000-000000000030","definition":{"catalogKey":"strength.push-up.v1","name":{"en":"Captured Push-up","zh":"已记录俯卧撑"},"equipment":"bodyweight","mode":"bodyweight_reps","convention":"bodyweight-repetitions"},"sets":[{"id":"64160000-0000-4000-8000-000000000040","performed":{"mode":"bodyweight_reps","reps":9007199254740991,"kind":"warmup"}}]}]}';
 accepted jsonb; saved public.workouts;
begin
 accepted:=public.upload_completed_workout((document->>'id')::uuid,document);
 if accepted->>'status'<>'accepted' then raise exception 'V2 bodyweight completion rejected: %',accepted; end if;
 set constraints all immediate;
 select * into strict saved from public.workouts where id=(document->>'id')::uuid;
 if saved.native_completion is not null or saved.recorded_completion is distinct from document or saved.routine_id is not null then
   raise exception 'One authoritative recorded snapshot was not preserved';
 end if;
 if not exists(select 1 from public.workout_sets where id='64160000-0000-4000-8000-000000000040'
   and weight_kg is null and reps=9007199254740991 and duration_seconds is null and distance_meters is null and rpe is null
   and set_type='warmup' and is_completed) then raise exception 'Bodyweight facts or irrelevant unknowns changed'; end if;
 if public.upload_completed_workout(saved.id,document) is distinct from accepted then raise exception 'V2 retry changed the first receipt'; end if;
end $$;
set constraints all deferred;
do $$
declare document jsonb := '{"version":2,"id":"44444444-4444-4444-8444-444444444444","ownerId":"64160000-0000-4000-8000-000000000001","sourceId":"33333333-3333-4333-8333-333333333333","startedAt":"2026-10-25T06:55:00.000Z","completedAt":"2026-10-25T07:05:00.000Z","durationSeconds":600,"timezone":"America/Los_Angeles","workoutDay":"2026-10-24","planId":null,"exercises":[{"id":"20000000-0000-4000-8000-000000000001","definition":{"catalogKey":"strength.barbell-bench-press.v1","name":{"en":"Barbell Bench Press","zh":"杠铃卧推"},"equipment":"barbell","mode":"weight_reps","convention":"barbell-total"},"sets":[{"id":"10000000-0000-4000-8000-000000000001","performed":{"mode":"weight_reps","weightKg":0.123,"reps":5,"kind":"working"}}]},{"id":"20000000-0000-4000-8000-000000000002","definition":{"catalogKey":"strength.push-up.v1","name":{"en":"Push-up","zh":"俯卧撑"},"equipment":"bodyweight","mode":"bodyweight_reps","convention":"bodyweight-repetitions"},"sets":[{"id":"10000000-0000-4000-8000-000000000002","performed":{"mode":"bodyweight_reps","reps":8,"kind":"warmup"}}]},{"id":"20000000-0000-4000-8000-000000000003","definition":{"catalogKey":"strength.weighted-pull-up.v1","name":{"en":"Weighted Pull-up","zh":"负重引体向上"},"equipment":"bodyweight","mode":"weighted_bodyweight","convention":"added-load"},"sets":[{"id":"10000000-0000-4000-8000-000000000003","performed":{"mode":"weighted_bodyweight","addedWeightKg":0.45359237,"reps":6,"kind":"working"}}]},{"id":"20000000-0000-4000-8000-000000000004","definition":{"catalogKey":"strength.machine-assisted-pull-up.v1","name":{"en":"Machine-assisted Pull-up","zh":"器械辅助引体向上"},"equipment":"machine","mode":"assisted_bodyweight","convention":"assistance"},"sets":[{"id":"10000000-0000-4000-8000-000000000004","performed":{"mode":"assisted_bodyweight","assistanceKg":0,"reps":5,"kind":"warmup"}}]},{"id":"20000000-0000-4000-8000-000000000005","definition":{"catalogKey":"strength.plank.v1","name":{"en":"Plank","zh":"平板支撑"},"equipment":"bodyweight","mode":"duration","convention":"seconds"},"sets":[{"id":"10000000-0000-4000-8000-000000000005","performed":{"mode":"duration","durationSeconds":90,"kind":"working"}}]}]}'; accepted jsonb; projection jsonb; invalid jsonb; patch jsonb; candidate_id uuid;
begin
 accepted:=public.upload_completed_workout((document->>'id')::uuid,document);
 if accepted->>'status'<>'accepted' then raise exception 'Five-mode completion rejected: %',accepted; end if;
 set constraints all immediate;
 if not exists(select 1 from public.workouts where id=(document->>'id')::uuid and native_completion is null and recorded_completion=document) then
   raise exception 'Five-mode snapshot changed'; end if;
 select jsonb_agg(jsonb_build_array(d.exercise_type,s.weight_kg,s.reps,s.duration_seconds,s.set_type,s.is_completed,s.distance_meters,s.rpe) order by e.sort_order)
 into projection from public.workout_exercises e join public.exercises d on d.id=e.exercise_id join public.workout_sets s on s.workout_exercise_id=e.id
 where e.workout_id=(document->>'id')::uuid;
 if projection is distinct from '[
  ["weight_reps",0.123,5,null,"normal",true,null,null],
  ["bodyweight_reps",null,8,null,"warmup",true,null,null],
  ["weighted_bodyweight",0.45359237,6,null,"normal",true,null,null],
  ["assisted_bodyweight",0,5,null,"warmup",true,null,null],
  ["duration",null,null,90,"normal",true,null,null]
 ]'::jsonb then raise exception 'Five-mode normalized facts changed: %',projection; end if;
 if (select count(*) from public.exercises where catalog_key is not null and user_id is null and not is_custom)<>22 then raise exception 'Full starter catalog unavailable'; end if;
 begin
   update public.workouts set recorded_completion=null where id=(document->>'id')::uuid;
   raise exception 'Direct grant stripped the recorded authority';
 exception when check_violation then null; end;
 begin
   update public.workouts set native_completion=jsonb_set(recorded_completion,'{version}','1'),recorded_completion=null where id=(document->>'id')::uuid;
   raise exception 'Direct grant swapped authority columns';
 exception when check_violation then null; end;
 begin
   update public.workout_sets set weight_kg=999 where id='10000000-0000-4000-8000-000000000003';
   raise exception 'Direct grant rewrote recorded added load';
 exception when check_violation then null; end;
 begin
   insert into public.workout_sets(workout_exercise_id,set_number,is_completed) values('20000000-0000-4000-8000-000000000001',2,true);
   raise exception 'Direct grant inserted an unrecorded set';
 exception when check_violation then null; end;
 begin
   delete from public.workout_exercises where id='20000000-0000-4000-8000-000000000001';
   raise exception 'Direct grant removed a performed entry';
 exception when check_violation then null; end;
 set constraints all deferred;
 for patch in select value from jsonb_array_elements('[
   {"path":["exercises","0","sets","0","performed","mode"],"value":"weighted_bodyweight"},
   {"path":["exercises","1","sets","0","performed","weightKg"],"value":0},
   {"path":["exercises","2","sets","0","performed","addedWeightKg"],"value":-1},
   {"path":["exercises","3","sets","0","performed","assistanceKg"],"value":-1},
   {"path":["exercises","0","sets","0","performed","reps"],"value":0},
   {"path":["exercises","0","sets","0","performed","reps"],"value":9007199254740992},
   {"path":["exercises","4","sets","0","performed","durationSeconds"],"value":0},
   {"path":["exercises","4","sets","0","performed","durationSeconds"],"value":86401},
   {"path":["exercises","4","sets","0","performed","durationSeconds"],"value":1.5},
   {"path":["exercises","3","definition","convention"],"value":"added-load"},
   {"path":["exercises","2","definition","equipment"],"value":"machine"}
 ]'::jsonb) loop
   candidate_id:=gen_random_uuid();
   invalid:=jsonb_set(jsonb_set(document,'{id}',to_jsonb(candidate_id::text)),array(select jsonb_array_elements_text(patch->'path')),patch->'value');
   if public.upload_completed_workout(candidate_id,invalid)->>'status'<>'invalid_completion'
     or exists(select 1 from public.workouts where id=candidate_id)
     or exists(select 1 from public.train_completion_receipts where operation_id=candidate_id) then
       raise exception 'Invalid performed branch reached history: %',patch; end if;
 end loop;
 set constraints all immediate;
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
 if public.upload_completed_workout((document->>'id')::uuid,document) is distinct from accepted
   or exists(select 1 from public.workouts where id=(document->>'id')::uuid) then raise exception 'Retry recreated deleted v2 history'; end if;
 begin
   insert into public.workouts(id,user_id,status) values((document->>'id')::uuid,auth.uid(),'in_progress');
   raise exception 'Direct grant recreated a recorded identity as a legacy draft';
 exception when check_violation then null; end;
end $$;
rollback;
