-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('64130000-0000-4000-8000-000000000001','catalog-owner@example.test');
select public.sql_fixture_create_auth_user('64130000-0000-4000-8000-000000000002','catalog-other@example.test');
select set_config('request.jwt.claims','{"sub":"64130000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare custom_id uuid; changed integer;
begin
 if (select count(*) from public.exercises where catalog_key in (
   'strength.barbell-bench-press.v1','strength.dumbbell-bench-press.v1','strength.barbell-squat.v1','strength.deadlift.v1',
   'strength.barbell-row.v1','strength.dumbbell-row.v1','strength.overhead-press.v1','strength.dumbbell-shoulder-press.v1',
   'strength.machine-chest-press.v1','strength.leg-press.v1','strength.lat-pulldown.v1','strength.seated-cable-row.v1')) <> 12
 then raise exception 'Starter catalog is incomplete'; end if;
 if exists(select 1 from public.exercises where catalog_key is not null and (user_id is not null or is_custom or exercise_type <> 'weight_reps'))
 then raise exception 'Catalog keys changed ownership or recording mode'; end if;
 if not exists(select 1 from public.exercises where catalog_key='strength.barbell-bench-press.v1' and name='Barbell Bench Press' and equipment='barbell')
   or not exists(select 1 from public.exercises where catalog_key='strength.dumbbell-bench-press.v1' and name='Dumbbell Bench Press' and equipment='dumbbell')
 then raise exception 'Equipment variants share the wrong identity'; end if;
 update public.exercises set catalog_key='strength.overwritten.v1' where catalog_key='strength.barbell-bench-press.v1';
 get diagnostics changed = row_count;
 if changed <> 0 then raise exception 'Account may rewrite a preset identity'; end if;
 begin
   insert into public.exercises(user_id,name,muscle_group_primary,equipment,exercise_type,is_custom,catalog_key)
   values(auth.uid(),'Spoofed preset','chest','barbell','weight_reps',true,'strength.spoofed.v1');
   raise exception 'Custom exercise claimed a built-in key';
 exception when check_violation then null;
 end;
 insert into public.exercises(user_id,name,muscle_group_primary,equipment,exercise_type,is_custom)
 values(auth.uid(),'Existing Web custom exercise','chest','barbell','weight_reps',true) returning id into custom_id;
 if not exists(select 1 from public.exercises where id=custom_id and catalog_key is null) then raise exception 'Existing custom creation changed'; end if;
 perform set_config('request.jwt.claims','{"sub":"64130000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 if exists(select 1 from public.exercises where id=custom_id) then raise exception 'Catalog change exposed another account exercise'; end if;
end $$;
rollback;
