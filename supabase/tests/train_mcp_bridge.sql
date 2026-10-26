-- Service-only authority cannot be exercised by the constrained runner role.
-- Setup is disposable; command assertions run as the real service_role.
begin;
select public.sql_fixture_create_auth_user('64151000-0000-4000-8000-000000000001','train-mcp-owner@example.test');
select public.sql_fixture_create_auth_user('64151000-0000-4000-8000-000000000002','train-mcp-other@example.test');
insert into public.routines(id,user_id,name) values
 ('64151000-0000-4000-8000-000000000003','64151000-0000-4000-8000-000000000001','Owned routine'),
 ('64151000-0000-4000-8000-000000000004','64151000-0000-4000-8000-000000000002','Foreign routine');
insert into public.exercises(id,user_id,name,muscle_group_primary,equipment,is_custom,measurement_convention)
 values('64151000-0000-4000-8000-000000000005','64151000-0000-4000-8000-000000000002','Private reference','other','other',true,'selected-load');
-- C ignores caller-provided Start arrays. Construct only this synthetic owned
-- template's authoritative historical target; A still exercises the old array.
do $$ begin
 if (select ready from fitness_private.template_rollout where singleton) then
  insert into public.routine_exercises(id,routine_id,exercise_id,sort_order,rest_timer_seconds)
  select '64151000-0000-4000-8000-000000000006','64151000-0000-4000-8000-000000000003',id,0,null
  from public.exercises where catalog_key='strength.barbell-bench-press.v1';
  insert into fitness_private.template_entries(entry_id,position,targets_resolved)
  values('64151000-0000-4000-8000-000000000006',0,true);
  insert into fitness_private.template_targets(id,entry_id,position,kind,weight_kg,reps)
  values('64151000-0000-4000-8000-000000000007','64151000-0000-4000-8000-000000000006',0,'working',0.123,9007199254740991);
 end if;
end $$;
select set_config('request.jwt.claims','{"role":"service_role","sub":"64151000-0000-4000-8000-000000000002"}',true);
select set_config('request.jwt.claim.sub','64151000-0000-4000-8000-000000000002',true);
set local role service_role;
do $$
declare owner uuid:='64151000-0000-4000-8000-000000000001'; preset uuid;
 old_claims text:=current_setting('request.jwt.claims'); old_subject text:=current_setting('request.jwt.claim.sub');
 old_float_digits text:=current_setting('extra_float_digits');
 request jsonb; result jsonb; workout uuid; entry uuid;
begin
 -- Runtime numeric acceptance must not depend on the caller's display setting.
 perform set_config('extra_float_digits','0',true);
 select id into preset from public.exercises where catalog_key='strength.barbell-bench-press.v1';
 request:=jsonb_build_object('p_user_id',owner,'p_workout',jsonb_build_object('title','MCP exact values','routine_id','64151000-0000-4000-8000-000000000003'),
  'p_exercises',jsonb_build_array(jsonb_build_object('exercise',jsonb_build_object('exercise_id',preset,'sort_order',0,'rest_timer_seconds',null),
  'sets',jsonb_build_array(jsonb_build_object('set_number',1,'set_type','normal','weight_kg',0.123,'reps',9007199254740991,'is_completed',false)))));
 result:=public.mcp_workout_command(owner,'start_workout_from_routine',request);
 workout:=(result->>'id')::uuid;
 if workout is null or result->'exercises'->0->'sets'->0->'reps' is distinct from '9007199254740991'::jsonb then raise exception 'Trusted routine start failed'; end if;
 if current_setting('extra_float_digits')<>'0' then raise exception 'Trusted Start leaked numeric rendering setting'; end if;
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
 if (public.train_template_capabilities()->'templates'->>'ready')::boolean then
  perform set_config('extra_float_digits','3',true);
  result:=public.mcp_workout_command(owner,'start_train_template_workout',jsonb_build_object('p_user_id',owner,'p_template_id','64151000-0000-4000-8000-000000000003'));
  if result->>'status' is distinct from 'started'
    or result->'workout'->'exercises'->0->'sets'->0->'weight_kg' is distinct from '0.123'::jsonb
    or result->'workout'->'exercises'->0->'sets'->0->'reps' is distinct from '9007199254740991'::jsonb then
   raise exception 'Current trusted template Start lost authoritative values';
  end if;
  if current_setting('extra_float_digits')<>'3' then raise exception 'Current Start leaked numeric rendering setting'; end if;
  if current_setting('request.jwt.claims')<>old_claims or current_setting('request.jwt.claim.sub')<>old_subject then raise exception 'Current Start leaked principal'; end if;
  if public.mcp_workout_command(owner,'start_train_template_workout',jsonb_build_object('p_user_id',owner,'p_template_id','64151000-0000-4000-8000-000000000004'))->>'status' is distinct from 'not_found' then
   raise exception 'Current bridge exposed a foreign template';
  end if;
  delete from public.workouts where id=(result->'workout'->>'id')::uuid;
 end if;
 insert into public.workouts(user_id) values(owner) returning id into workout;
 insert into public.workout_exercises(workout_id,exercise_id,sort_order) values(workout,'64151000-0000-4000-8000-000000000005',0) returning id into entry;
 begin
  perform public.mcp_workout_command(owner,'complete_workout_atomically',jsonb_build_object('p_user_id',owner,'p_workout_id',workout,'p_completed_at',now(),'p_changes','{}'::jsonb));
  raise exception 'Trusted terminal command accepted existing foreign reference';
 exception when insufficient_privilege then null; end;
 if current_setting('request.jwt.claims')<>old_claims or current_setting('request.jwt.claim.sub')<>old_subject then raise exception 'Terminal bridge leaked principal'; end if;
 perform set_config('extra_float_digits',old_float_digits,true);
end $$;
set constraints all immediate;
rollback;
