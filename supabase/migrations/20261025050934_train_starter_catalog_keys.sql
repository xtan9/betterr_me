-- Portable native catalog identity without replacing any existing exercise UUID.
-- Only the audited seed rows receive keys. Ambiguity must be resolved explicitly.
alter table public.exercises add column catalog_key text;
alter table public.exercises add constraint exercises_catalog_key_builtin_check
  check (catalog_key is null or (user_id is null and not is_custom and catalog_key ~ '^strength\.[a-z0-9-]+\.v[1-9][0-9]*$'));
alter table public.exercises add constraint exercises_catalog_key_unique unique (catalog_key);

do $$
declare entry record; matches integer;
begin
 for entry in select * from (values
   ('strength.barbell-bench-press.v1','Barbell Bench Press','barbell'),
   ('strength.dumbbell-bench-press.v1','Dumbbell Bench Press','dumbbell'),
   ('strength.barbell-squat.v1','Barbell Squat','barbell'),
   ('strength.deadlift.v1','Deadlift','barbell'),
   ('strength.barbell-row.v1','Barbell Row','barbell'),
   ('strength.dumbbell-row.v1','Dumbbell Row','dumbbell'),
   ('strength.overhead-press.v1','Overhead Press','barbell'),
   ('strength.dumbbell-shoulder-press.v1','Dumbbell Shoulder Press','dumbbell'),
   ('strength.machine-chest-press.v1','Machine Chest Press','machine'),
   ('strength.leg-press.v1','Leg Press','machine'),
   ('strength.lat-pulldown.v1','Lat Pulldown','cable'),
   ('strength.seated-cable-row.v1','Seated Cable Row','cable')
 ) as catalog(key,name,equipment) loop
   select count(*) into matches from public.exercises e where e.user_id is null and not e.is_custom
     and e.name=entry.name and e.equipment=entry.equipment and e.exercise_type='weight_reps';
   if matches <> 1 then raise exception 'Expected exactly one preset for catalog key %, found %',entry.key,matches; end if;
   update public.exercises e set catalog_key=entry.key where e.user_id is null and not e.is_custom
     and e.name=entry.name and e.equipment=entry.equipment and e.exercise_type='weight_reps';
 end loop;
end $$;

comment on column public.exercises.catalog_key is
  'Immutable portable key for a versioned built-in exercise meaning. Existing UUIDs and historical measurements are preserved; custom exercises have no catalog key.';
