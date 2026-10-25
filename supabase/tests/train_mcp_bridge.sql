-- Service-only authority cannot be exercised by the constrained runner role.
-- Setup is disposable; command assertions run as the real service_role.
begin;
select public.sql_fixture_create_auth_user('64151000-0000-4000-8000-000000000001','train-mcp-owner@example.test');
select public.sql_fixture_create_auth_user('64151000-0000-4000-8000-000000000002','train-mcp-other@example.test');
insert into public.routines(id,user_id,name) values
 ('64151000-0000-4000-8000-000000000003','64151000-0000-4000-8000-000000000001','Owned routine'),
 ('64151000-0000-4000-8000-000000000004','64151000-0000-4000-8000-000000000002','Foreign routine');
insert into public.exercises(id,user_id,name,muscle_group_primary,equipment,is_custom)
 values('64151000-0000-4000-8000-000000000005','64151000-0000-4000-8000-000000000002','Private reference','other','other',true);
select set_config('request.jwt.claims','{"role":"service_role","sub":"64151000-0000-4000-8000-000000000002"}',true);
select set_config('request.jwt.claim.sub','64151000-0000-4000-8000-000000000002',true);
set local role service_role;
do $$
declare owner uuid:='64151000-0000-4000-8000-000000000001'; preset uuid;
 old_claims text:=current_setting('request.jwt.claims'); old_subject text:=current_setting('request.jwt.claim.sub');
 request jsonb; result jsonb; workout uuid; entry uuid;
begin
 select id into preset from public.exercises where catalog_key='strength.barbell-bench-press.v1';
 request:=jsonb_build_object('p_user_id',owner,'p_workout',jsonb_build_object('title','MCP exact values','routine_id','64151000-0000-4000-8000-000000000003'),
  'p_exercises',jsonb_build_array(jsonb_build_object('exercise',jsonb_build_object('exercise_id',preset,'sort_order',0,'rest_timer_seconds',null),
  'sets',jsonb_build_array(jsonb_build_object('set_number',1,'set_type','normal','weight_kg',0.123,'reps',9007199254740991,'is_completed',false)))));
 result:=public.mcp_workout_command(owner,'start_workout_from_routine',request);
 workout:=(result->>'id')::uuid;
 if workout is null or result->'exercises'->0->'sets'->0->'reps' is distinct from '9007199254740991'::jsonb then raise exception 'Trusted routine start failed'; end if;
 if current_setting('request.jwt.claims')<>old_claims or current_setting('request.jwt.claim.sub')<>old_subject then raise exception 'Successful bridge leaked principal'; end if;
 if public.complete_workout_atomically(owner,workout,now(),'{}')->>'type'<>'not-found' then raise exception 'Original RPC auth.uid protection was loosened'; end if;
 begin
  perform public.mcp_workout_command(owner,'start_workout_from_routine',jsonb_set(request,'{p_workout,routine_id}','"64151000-0000-4000-8000-000000000004"'));
  raise exception 'Trusted bridge accepted foreign routine';
 exception when insufficient_privilege then null; end;
 begin
  perform public.mcp_workout_command(owner,'start_workout_from_routine',jsonb_set(request,'{p_exercises,0,exercise,exercise_id}','"64151000-0000-4000-8000-000000000005"'));
  raise exception 'Trusted bridge accepted foreign custom reference';
 exception when insufficient_privilege then null; end;
 begin
  perform public.mcp_workout_command(owner,'start_workout_from_routine',request);
  raise exception 'Duplicate active start unexpectedly succeeded';
 exception when unique_violation then null; end;
 begin
  perform public.mcp_workout_command(owner,'arbitrary_function',request);
  raise exception 'Trusted bridge executed unknown operation';
 exception when invalid_parameter_value then null; end;
 if current_setting('request.jwt.claims')<>old_claims or current_setting('request.jwt.claim.sub')<>old_subject then raise exception 'Failed bridge leaked principal'; end if;
 update public.workout_sets set is_completed=true where workout_exercise_id=(result->'exercises'->0->>'id')::uuid;
 result:=public.mcp_workout_command(owner,'complete_workout_atomically',jsonb_build_object('p_user_id',owner,'p_workout_id',workout,'p_completed_at',now(),'p_changes','{}'::jsonb));
 if result->>'type'<>'transitioned' then raise exception 'Trusted terminal command failed'; end if;
 insert into public.workouts(user_id) values(owner) returning id into workout;
 insert into public.workout_exercises(workout_id,exercise_id,sort_order) values(workout,'64151000-0000-4000-8000-000000000005',0) returning id into entry;
 begin
  perform public.mcp_workout_command(owner,'complete_workout_atomically',jsonb_build_object('p_user_id',owner,'p_workout_id',workout,'p_completed_at',now(),'p_changes','{}'::jsonb));
  raise exception 'Trusted terminal command accepted existing foreign reference';
 exception when insufficient_privilege then null; end;
 if current_setting('request.jwt.claims')<>old_claims or current_setting('request.jwt.claim.sub')<>old_subject then raise exception 'Terminal bridge leaked principal'; end if;
end $$;
set constraints all immediate;
rollback;
