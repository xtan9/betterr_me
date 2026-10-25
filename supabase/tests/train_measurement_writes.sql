-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('64160000-0000-4000-8000-000000000002','train-web-measurement-owner@example.test');
select set_config('request.jwt.claims','{"sub":"64160000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$
declare workout_id uuid:=gen_random_uuid(); entry_id uuid; definition_id uuid; set_id uuid; mode text; payload jsonb; outcome jsonb;
begin
 insert into public.workouts(id,user_id,status) values(workout_id,auth.uid(),'in_progress');
 for mode,payload in select * from (values
   ('weight_reps','{"weight_kg":0.123,"reps":5}'::jsonb),
   ('bodyweight_reps','{"reps":9007199254740991}'::jsonb),
   ('weighted_bodyweight','{"weight_kg":0.45359237,"reps":6}'::jsonb),
   ('assisted_bodyweight','{"weight_kg":0,"reps":8}'::jsonb),
   ('duration','{"duration_seconds":90}'::jsonb)
 ) as cases(mode,payload) loop
   select id into strict definition_id from public.exercises where exercise_type=mode and catalog_key is not null order by catalog_key limit 1;
   insert into public.workout_exercises(workout_id,exercise_id,sort_order) values(workout_id,definition_id,0) returning id into entry_id;
   outcome:=public.add_active_workout_set(auth.uid(),workout_id,entry_id,'{"is_completed":true}'::jsonb);
   if outcome->>'type'<>'invalid' or outcome->>'field'<>'measurements' then raise exception 'Blank % completed through RPC: %',mode,outcome; end if;
   outcome:=public.add_active_workout_set(auth.uid(),workout_id,entry_id,payload||'{"is_completed":false}'::jsonb);
   if outcome->>'type'<>'added' then raise exception 'Draft % rejected: %',mode,outcome; end if;
   set_id:=(outcome->'set'->>'id')::uuid;
   outcome:=public.update_active_workout_set(auth.uid(),workout_id,entry_id,set_id,'{"is_completed":true}'::jsonb);
   if outcome->>'type'<>'updated' or not (outcome->'set'->>'is_completed')::boolean then raise exception 'Valid % not performed: %',mode,outcome; end if;
   outcome:=public.update_active_workout_set(auth.uid(),workout_id,entry_id,set_id,
     case when mode='duration' then '{"duration_seconds":86401}' else '{"reps":0}' end::jsonb);
   if outcome->>'type'<>'invalid' then raise exception 'Invalid changed % measurements accepted: %',mode,outcome; end if;
   begin
     update public.workout_sets set reps=0,duration_seconds=0 where id=set_id;
     raise exception 'Direct grant bypassed % performed validation',mode;
   exception when check_violation then null; end;
   if mode='duration' then
     if (select duration_seconds from public.workout_sets where id=set_id)<>90 then raise exception 'Rejected duration edit changed saved fact'; end if;
   elsif (select reps from public.workout_sets where id=set_id)<>(payload->>'reps')::bigint then raise exception 'Rejected reps edit changed saved fact'; end if;
 end loop;
end $$;
rollback;
