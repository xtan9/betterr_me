-- Phase A must remain compatible with the deployed legacy cookie writer.
-- This historical phase is reconstructed only inside this rollback. Current
-- C grants and readiness are verified separately by the contraction fixture.
begin;
update fitness_private.custom_exercise_rollout set ready=false where singleton;
grant insert,update,delete on public.exercises to authenticated;
select public.sql_fixture_create_auth_user('64180000-0000-4000-8000-000000000001','train-custom-owner@example.test');
select set_config('request.jwt.claims','{"sub":"64180000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare saved public.exercises; capabilities jsonb;
begin
 capabilities:=public.train_custom_exercise_capabilities();
 if capabilities is distinct from '{"protocolVersion":1,"customExercises":{"contractVersion":1,"ready":false},"completionVersions":[1,2]}'::jsonb then
   raise exception 'Phase A advertised an unready custom writer: %',capabilities;
 end if;
 if public.read_train_custom_exercises(null,null) is distinct from '{"status":"not_ready"}'::jsonb then
   raise exception 'Native custom reads bypassed the rollout gate'; end if;
 insert into public.exercises(id,user_id,name,muscle_group_primary,muscle_groups_secondary,equipment,exercise_type,is_custom,version,created_at,updated_at)
 values('64180000-0000-4000-8000-000000000010',auth.uid(),'Legacy odd name','other',null,'band','duration_weight',true,9223372036854775807,null,null)
 returning * into saved;
 if saved.version<>1 or saved.measurement_convention is not null or saved.archived_at is not null
   or saved.muscle_groups_secondary is not null or saved.created_at is not null or saved.updated_at is not null then
   raise exception 'Legacy insert lost unknowns or forged a version';
 end if;
 update public.exercises set name='Renamed legacy',equipment='none',exercise_type='distance_duration',version=1 where id=saved.id returning * into saved;
 if saved.version<>2 or saved.name<>'Renamed legacy' or saved.equipment<>'none' or saved.exercise_type<>'distance_duration'
   or saved.measurement_convention is not null or saved.muscle_groups_secondary is not null then
   raise exception 'Phase A broke legacy full-form editing or version authority';
 end if;
 begin
   update public.exercises set measurement_convention='seconds' where id=saved.id;
   raise exception 'Phase A allowed an unprotected known meaning';
 exception when check_violation then null; end;
 delete from public.exercises where id=saved.id;
 if exists(select 1 from public.exercises where id=saved.id) then raise exception 'Phase A broke the old unreferenced DELETE'; end if;
end $$;
rollback;
