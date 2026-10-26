-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('64150000-0000-4000-8000-000000000001','train-upload-owner@example.test');
select public.sql_fixture_create_auth_user('64150000-0000-4000-8000-000000000002','train-upload-other@example.test');
select set_config('request.jwt.claims','{"sub":"64150000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare document jsonb := '{"version":1,"id":"64150000-0000-4000-8000-000000000010","ownerId":"64150000-0000-4000-8000-000000000001","sourceId":"64150000-0000-4000-8000-000000000020","startedAt":"2026-10-25T10:00:00.000Z","completedAt":"2026-10-25T10:01:00.000Z","durationSeconds":60,"timezone":"America/Los_Angeles","workoutDay":"2026-10-25","planId":"opaque:unverified-plan","exercises":[{"id":"64150000-0000-4000-8000-000000000030","definition":{"catalogKey":"strength.barbell-bench-press.v1","name":{"en":"Captured bench","zh":"已记录卧推"},"equipment":"barbell","mode":"weight_reps","convention":"barbell-total"},"sets":[{"id":"64150000-0000-4000-8000-000000000040","performed":{"weightKg":0.123,"reps":9007199254740991,"kind":"warmup"}}]}]}';
  accepted jsonb; retry jsonb; saved public.workouts; active_id uuid; web_entry uuid; web_result jsonb; invalid jsonb; collision_id uuid;
begin
 -- Exercise the authenticated RPC, not only its private validator: rejected
 -- documents must leave neither history nor an acceptance receipt.
 for invalid in select value from jsonb_array_elements('[
   {"completedAt":"tomorrow"}, {"completedAt":"2026-10-25"},
   {"startedAt":"2026-10-25T10:00:00"}, {"completedAt":"2026-10-25T10:01:00 UTC"},
   {"completedAt":"2026-10-25T23:59:60Z"}, {"completedAt":"2026-10-25T24:00:00Z"},
   {"completedAt":"2026-02-29T10:01:00Z"}, {"completedAt":"2026-04-31T10:01:00Z"},
   {"completedAt":"294000-01-01T00:00:00Z"}, {"completedAt":"infinity"},
   {"timezone":"UTC+1"}, {"timezone":"PST"}, {"timezone":"Factory"},
   {"timezone":"posix/America/Los_Angeles"}, {"timezone":"right/UTC"}, {"timezone":"localtime"}
 ]'::jsonb) loop
   if public.upload_completed_workout((document->>'id')::uuid,document||invalid)->>'status'<>'invalid_completion'
     or exists(select 1 from public.workouts where id=(document->>'id')::uuid)
     or exists(select 1 from public.train_completion_receipts where operation_id=(document->>'id')::uuid) then
     raise exception 'Unreadable temporal snapshot reached history or receipt: %',invalid;
   end if;
 end loop;
 insert into public.workouts(user_id,title,status) values(auth.uid(),'Existing Web active','in_progress') returning id into active_id;
 accepted := public.upload_completed_workout((document->>'id')::uuid,document);
 if accepted->>'status' <> 'accepted' then raise exception 'Upload rejected: %',accepted; end if;
 set constraints all immediate;
 retry := public.upload_completed_workout((document->>'id')::uuid,document);
 if retry is distinct from accepted then raise exception 'Receipt changed on identical retry'; end if;
 select * into saved from public.workouts where id=(document->>'id')::uuid;
 if saved.status <> 'completed' or saved.native_completion is distinct from document or saved.routine_id is not null then raise exception 'Saved completion/provenance changed'; end if;
 if not exists(select 1 from public.workout_sets where id='64150000-0000-4000-8000-000000000040' and weight_kg=0.123 and reps=9007199254740991 and set_type='warmup' and is_completed) then raise exception 'Performed measurements were rounded or lost'; end if;
 if not exists(select 1 from public.workouts where id=active_id and status='in_progress') then raise exception 'Native upload replaced Web active workout'; end if;
 for invalid in select value from jsonb_array_elements('[
   {"startedAt":"2024-02-29T23:59:59.123Z","completedAt":"2024-03-01T00:00:00Z","timezone":"UTC","workoutDay":"2024-02-29"},
   {"startedAt":"2026-11-01T01:30:00-04:00","completedAt":"2026-11-01T01:30:00-05:00","timezone":"US/Eastern","workoutDay":"2026-11-01"},
   {"timezone":"Asia/Katmandu"}, {"timezone":"america/los_angeles"}, {"timezone":"Etc/GMT+12","workoutDay":"2026-10-24"}
 ]'::jsonb) loop
   set constraints all deferred;
   invalid:=document||invalid||jsonb_build_object('id',gen_random_uuid());
   invalid:=jsonb_set(jsonb_set(invalid,'{exercises,0,id}',to_jsonb(gen_random_uuid()::text)),
     '{exercises,0,sets,0,id}',to_jsonb(gen_random_uuid()::text));
   retry:=public.upload_completed_workout((invalid->>'id')::uuid,invalid);
   if retry->>'status'<>'accepted'
     or not exists(select 1 from public.workouts where id=(invalid->>'id')::uuid and native_completion=invalid) then
     raise exception 'Explicit instant or IANA alias did not roundtrip unchanged: % / %',invalid,retry;
   end if;
   set constraints all immediate;
 end loop;
 web_result:=public.complete_workout_atomically(auth.uid(),active_id,now(),'{}');
 if web_result->>'type'<>'invalid' or not exists(select 1 from public.workouts where id=active_id and status='in_progress') then raise exception 'Empty Web completion was accepted'; end if;
 web_result:=public.add_active_workout_exercise(auth.uid(),active_id,(select id from public.exercises where catalog_key='strength.barbell-bench-press.v1'),90);
 web_entry:=(web_result->'exercise'->>'id')::uuid;
 web_result:=public.add_active_workout_set(auth.uid(),active_id,web_entry,'{"weight_kg":0.123,"reps":9007199254740991,"set_type":"warmup","is_completed":true}');
 if web_result->'set'->'reps' is distinct from '9007199254740991'::jsonb or web_result->'set'->'weight_kg' is distinct from '0.123'::jsonb then raise exception 'Web command lost accepted native precision'; end if;
 web_result:=public.complete_workout_atomically(auth.uid(),active_id,now(),'{}');
 if web_result->>'type'<>'transitioned' then raise exception 'Warmup-only Web completion was rejected'; end if;
 begin
   perform public.mcp_workout_command(auth.uid(),'complete_workout_atomically',jsonb_build_object('p_workout_id',active_id));
   raise exception 'An arbitrary authenticated caller reached the trusted MCP bridge';
 exception when insufficient_privilege then null; end;
 begin
   update public.workout_sets set weight_kg=9 where id='64150000-0000-4000-8000-000000000040';
   raise exception 'Direct table edit rewrote immutable performed values';
 exception when check_violation then null; end;
 begin
   update public.workouts set native_completion=null where id=saved.id;
   raise exception 'Direct table edit stripped native identity';
 exception when check_violation then null; end;
 if public.upload_completed_workout(saved.id,jsonb_set(document,'{planId}','"changed"'))->>'status'<>'operation_conflict' then raise exception 'Changed frozen request was accepted'; end if;
 invalid:=jsonb_set(document,'{ownerId}','"64150000-0000-4000-8000-000000000002"');
 if public.upload_completed_workout(saved.id,invalid)->>'status'<>'owner_mismatch' then raise exception 'Owner mismatch was accepted'; end if;
 if exists(select 1 from public.train_completion_receipts where owner_id<>'64150000-0000-4000-8000-000000000001') then raise exception 'Foreign receipt exposed'; end if;
 begin
   insert into public.workout_sets(workout_exercise_id,set_number,is_completed) values('64150000-0000-4000-8000-000000000030',2,true);
   raise exception 'Direct insert extended an immutable completion';
 exception when check_violation then null; end;
 begin
   delete from public.workout_exercises where id='64150000-0000-4000-8000-000000000030';
   raise exception 'Direct delete rewrote immutable completion';
 exception when check_violation then null; end;
 begin
   insert into public.workouts(user_id,status) values(auth.uid(),'completed');
   raise exception 'Direct empty completion was accepted';
 exception when check_violation then null; end;
 begin
   perform public.add_active_workout_set(auth.uid(),active_id,web_entry,'{"weight_kg":0.123,"reps":0.5}');
   raise exception 'Fractional reps reached an integer cast';
 exception when invalid_parameter_value then null; end;
 set constraints all deferred;
 collision_id:=gen_random_uuid();
 invalid:=jsonb_set(document,'{id}',to_jsonb(collision_id::text));
 if public.upload_completed_workout(collision_id,invalid)->>'status'<>'identity_conflict'
   or exists(select 1 from public.workouts where id=collision_id) then raise exception 'Child collision left partial history'; end if;
 begin
   insert into public.workouts(id,user_id,status,native_completion) values(collision_id,auth.uid(),'completed',invalid);
   set constraints all immediate;
   raise exception 'Direct insert forged a native completion without a receipt';
 exception when check_violation then null; end;
 set constraints all immediate;
 if (public.train_history_capabilities()->>'historyReady')::boolean then
  begin
   delete from public.workouts where id=saved.id;
   raise exception 'Unreviewed completed deletion bypassed current authority';
  exception when check_violation then null; end;
  if public.execute_train_history_command(jsonb_build_object('protocolVersion',1,'ownerId',auth.uid(),'operationId',gen_random_uuid(),
    'command',jsonb_build_object('kind','delete-workout','workoutId',saved.id,'expectedRevision',public.read_train_history_record(saved.id)->'record'->>'revision')))->'receipt'->>'operation' is distinct from 'delete-workout' then
   raise exception 'Reviewed completed deletion was not accepted';
  end if;
  if public.read_train_history_record(saved.id)->'record'->>'state' is distinct from 'deleted' then
   raise exception 'Reviewed completed deletion did not retain its tombstone';
  end if;
 else
  delete from public.workouts where id=saved.id;
 end if;
 retry:=public.upload_completed_workout((document->>'id')::uuid,document);
 if retry is distinct from accepted or exists(select 1 from public.workouts where id=saved.id) then raise exception 'Delayed retry resurrected deleted history'; end if;
end $$;
rollback;
