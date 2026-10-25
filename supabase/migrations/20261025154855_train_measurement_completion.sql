-- One accepted authority per workout. v1 stays in its compatibility slot.
alter table public.workouts add column recorded_completion jsonb;
alter table public.workouts add constraint workouts_recorded_authority_check check (
  (native_completion is null or recorded_completion is null)
  and (native_completion is null and recorded_completion is null or status='completed')
  and (native_completion is null or (jsonb_typeof(native_completion)='object' and native_completion->'version' is not distinct from '1'::jsonb))
  and (recorded_completion is null or (jsonb_typeof(recorded_completion)='object' and recorded_completion->'version' is not distinct from '2'::jsonb))
);
comment on column public.workouts.recorded_completion is
  'Immutable versioned completion authority for v2 and later supported writers. Exclusive with native_completion; NULL in both columns means legacy.';

-- Reuse six audited preset identities; the four different recording meanings
-- receive their own generated identities. Neither names nor existing rows move.
do $$
declare item record; matches integer; definition public.exercises;
begin
 for item in select * from (values
   ('strength.push-up.v1','Push-up','bodyweight','bodyweight_reps',false,'chest',array['triceps','shoulders','core']),
   ('strength.pull-up.v1','Pull-up','bodyweight','bodyweight_reps',false,'back',array['biceps','forearms']),
   ('strength.dip.v1','Dip','bodyweight','bodyweight_reps',false,'chest',array['triceps','shoulders']),
   ('strength.bodyweight-squat.v1','Bodyweight Squat','bodyweight','bodyweight_reps',false,'quadriceps',array['glutes']),
   ('strength.plank.v1','Plank','bodyweight','duration',false,'core',array[]::text[]),
   ('strength.jump-rope.v1','Jump Rope','other','duration',false,'cardio',array['calves']),
   ('strength.weighted-pull-up.v1','Weighted Pull-up','bodyweight','weighted_bodyweight',true,'back',array['biceps','forearms']),
   ('strength.weighted-dip.v1','Weighted Dip','bodyweight','weighted_bodyweight',true,'chest',array['triceps','shoulders']),
   ('strength.machine-assisted-pull-up.v1','Machine-assisted Pull-up','machine','assisted_bodyweight',true,'back',array['biceps','forearms']),
   ('strength.machine-assisted-dip.v1','Machine-assisted Dip','machine','assisted_bodyweight',true,'chest',array['triceps','shoulders'])
 ) as catalog(key,name,equipment,mode,create_missing,primary_muscle,secondary_muscles) loop
   select count(*) into matches from public.exercises where user_id is null and not is_custom
     and name=item.name and equipment=item.equipment and exercise_type=item.mode;
   if matches=0 and item.create_missing then
     insert into public.exercises(name,equipment,exercise_type,muscle_group_primary,muscle_groups_secondary,catalog_key)
       values(item.name,item.equipment,item.mode,item.primary_muscle,item.secondary_muscles,item.key);
   else
     if matches<>1 then raise exception 'Expected one public definition for %, found %',item.key,matches; end if;
     select * into strict definition from public.exercises where user_id is null and not is_custom
       and name=item.name and equipment=item.equipment and exercise_type=item.mode;
     if definition.catalog_key is not null and definition.catalog_key<>item.key then raise exception 'Catalog identity conflict for %',item.key; end if;
     update public.exercises set catalog_key=item.key where id=definition.id and catalog_key is null;
   end if;
 end loop;
end $$;

create function fitness_private.valid_recorded_completion(doc jsonb) returns boolean
language plpgsql stable set search_path=pg_catalog,public as $$
declare entry jsonb; definition jsonb; item jsonb; performed jsonb; identifiers uuid[]:='{}'; identity uuid; started timestamptz; ended timestamptz;
  instant_pattern constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$';
begin
 if doc->'version'='1'::jsonb then return fitness_private.valid_native_completion(doc); end if;
 if not fitness_private.exact_keys(doc,array['version','id','ownerId','sourceId','startedAt','completedAt','durationSeconds','timezone','workoutDay','planId','exercises'])
   or doc->'version' is distinct from '2'::jsonb
   or not coalesce(fitness_private.valid_uuid(doc->'id') and fitness_private.valid_uuid(doc->'ownerId') and fitness_private.valid_uuid(doc->'sourceId'),false)
   or not fitness_private.valid_measure(doc->'durationSeconds',true,0)
   or jsonb_typeof(doc->'startedAt') is distinct from 'string' or jsonb_typeof(doc->'completedAt') is distinct from 'string'
   or jsonb_typeof(doc->'timezone') is distinct from 'string' or jsonb_typeof(doc->'workoutDay') is distinct from 'string'
   or jsonb_typeof(doc->'planId') not in ('null','string')
   or jsonb_typeof(doc->'exercises') is distinct from 'array' then return false; end if;
 if jsonb_array_length(doc->'exercises')=0 then return false; end if;
 -- PostgreSQL's permissive parser also accepts relative dates, leap seconds,
 -- rolling 24:00 and POSIX zones. Those must not enter a native Date/Intl reader.
 -- Retain the original strings, including IANA links and explicit UTC offsets.
 if doc->>'startedAt' !~ instant_pattern or doc->>'completedAt' !~ instant_pattern
   or doc->>'workoutDay' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or not exists(select 1 from pg_timezone_names where lower(name)=lower(doc->>'timezone')
     and name !~ '^(posix|right)/' and name not in ('Factory','localtime','posixrules')) then return false; end if;
 started:=(doc->>'startedAt')::timestamptz; ended:=(doc->>'completedAt')::timestamptz;
 if not isfinite(started) or not isfinite(ended) or to_char(started at time zone (doc->>'timezone'),'FMYYYY-MM-DD') is distinct from doc->>'workoutDay' then return false; end if;
 for entry in select value from jsonb_array_elements(doc->'exercises') loop
   if not fitness_private.exact_keys(entry,array['id','definition','sets']) or not coalesce(fitness_private.valid_uuid(entry->'id'),false)
     or jsonb_typeof(entry->'sets') is distinct from 'array' then return false; end if;
   identity:=(entry->>'id')::uuid;
   if identity=any(identifiers) or jsonb_array_length(entry->'sets')=0 then return false; end if;
   identifiers:=array_append(identifiers,identity); definition:=entry->'definition';
   if not fitness_private.exact_keys(definition,array['catalogKey','name','equipment','mode','convention'])
     or jsonb_typeof(definition->'catalogKey') is distinct from 'string' or definition->>'catalogKey' !~ '^strength\.[a-z0-9-]+\.v[1-9][0-9]*$'
     or not fitness_private.exact_keys(definition->'name',array['en','zh'])
     or jsonb_typeof(definition->'name'->'en') is distinct from 'string' or length(definition->'name'->>'en')=0
     or jsonb_typeof(definition->'name'->'zh') is distinct from 'string' or length(definition->'name'->>'zh')=0
 then return false; end if;
   if not coalesce(case definition->>'mode'
     when 'weight_reps' then definition->>'equipment' in ('barbell','dumbbell','machine','cable')
       and definition->>'convention'=case definition->>'equipment' when 'barbell' then 'barbell-total' when 'dumbbell' then 'per-dumbbell' else 'selected-load' end
     when 'bodyweight_reps' then definition->>'equipment'='bodyweight' and definition->>'convention'='bodyweight-repetitions'
     when 'weighted_bodyweight' then definition->>'equipment'='bodyweight' and definition->>'convention'='added-load'
     when 'assisted_bodyweight' then definition->>'equipment'='machine' and definition->>'convention'='assistance'
     when 'duration' then definition->>'equipment' in ('bodyweight','other') and definition->>'convention'='seconds'
     else false end,false) then return false; end if;
   for item in select value from jsonb_array_elements(entry->'sets') loop
     if not fitness_private.exact_keys(item,array['id','performed']) or not coalesce(fitness_private.valid_uuid(item->'id'),false) then return false; end if;
     identity:=(item->>'id')::uuid;
     if identity=any(identifiers) then return false; end if;
     identifiers:=array_append(identifiers,identity); performed:=item->'performed';
     if performed->>'mode' is distinct from definition->>'mode'
       or coalesce(performed->>'kind','') not in ('working','warmup') then return false; end if;
     if not coalesce(case performed->>'mode'
       when 'weight_reps' then fitness_private.exact_keys(performed,array['mode','weightKg','reps','kind'])
         and fitness_private.valid_measure(performed->'weightKg',false,0) and fitness_private.valid_measure(performed->'reps',true,1)
       when 'bodyweight_reps' then fitness_private.exact_keys(performed,array['mode','reps','kind']) and fitness_private.valid_measure(performed->'reps',true,1)
       when 'weighted_bodyweight' then fitness_private.exact_keys(performed,array['mode','addedWeightKg','reps','kind'])
         and fitness_private.valid_measure(performed->'addedWeightKg',false,0) and fitness_private.valid_measure(performed->'reps',true,1)
       when 'assisted_bodyweight' then fitness_private.exact_keys(performed,array['mode','assistanceKg','reps','kind'])
         and fitness_private.valid_measure(performed->'assistanceKg',false,0) and fitness_private.valid_measure(performed->'reps',true,1)
       when 'duration' then fitness_private.exact_keys(performed,array['mode','durationSeconds','kind'])
         and fitness_private.valid_measure(performed->'durationSeconds',true,1) and (performed->>'durationSeconds')::numeric<=86400
       else false end,false) then return false; end if;
   end loop;
 end loop;
 return true;
exception when invalid_text_representation or invalid_parameter_value or datetime_field_overflow then return false;
end $$;
revoke all on function fitness_private.valid_recorded_completion(jsonb) from public,anon,authenticated;

create or replace function fitness_private.upload_completed_workout(p_operation_id uuid,p_completion jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); previous public.train_completion_receipts; entry jsonb; item jsonb; definition public.exercises;
  entry_index integer:=0; set_index integer; accepted jsonb;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if p_completion->>'ownerId' is distinct from owner::text then return jsonb_build_object('status','owner_mismatch'); end if;
 if p_operation_id is null or p_completion->>'id' is distinct from p_operation_id::text then return jsonb_build_object('status','invalid_completion'); end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':train:create-completed:'||p_operation_id::text,0));
 select * into previous from public.train_completion_receipts where owner_id=owner and operation_id=p_operation_id;
 if found then
   if previous.completion is distinct from p_completion then return jsonb_build_object('status','operation_conflict'); end if;
   return jsonb_build_object('status','accepted','receipt',previous.receipt);
 end if;
 if not fitness_private.valid_recorded_completion(p_completion) then return jsonb_build_object('status','invalid_completion'); end if;
 if exists(select 1 from public.workouts where id=p_operation_id) then return jsonb_build_object('status','identity_conflict'); end if;
 for entry in select value from jsonb_array_elements(p_completion->'exercises') loop
   perform 1 from public.exercises where catalog_key=entry->'definition'->>'catalogKey' and user_id is null and not is_custom
     and equipment=entry->'definition'->>'equipment' and exercise_type=entry->'definition'->>'mode' for share;
   if not found then return jsonb_build_object('status','reference_unavailable'); end if;
 end loop;
 insert into public.workouts(id,user_id,title,status,started_at,completed_at,duration_seconds,notes,routine_id,native_completion,recorded_completion)
 values(p_operation_id,owner,'Workout','completed',(p_completion->>'startedAt')::timestamptz,(p_completion->>'completedAt')::timestamptz,
   (p_completion->>'durationSeconds')::bigint,null,null,
   case when p_completion->'version'='1'::jsonb then p_completion end,
   case when p_completion->'version'='2'::jsonb then p_completion end);
 for entry in select value from jsonb_array_elements(p_completion->'exercises') loop
   select * into strict definition from public.exercises where catalog_key=entry->'definition'->>'catalogKey' and user_id is null and not is_custom;
   insert into public.workout_exercises(id,workout_id,exercise_id,sort_order,notes,rest_timer_seconds)
   values((entry->>'id')::uuid,p_operation_id,definition.id,entry_index,null,null);
   entry_index:=entry_index+1; set_index:=0;
   for item in select value from jsonb_array_elements(entry->'sets') loop
     set_index:=set_index+1;
     insert into public.workout_sets(id,workout_exercise_id,set_number,set_type,weight_kg,reps,duration_seconds,distance_meters,is_completed,rpe)
     values((item->>'id')::uuid,(entry->>'id')::uuid,set_index,case item->'performed'->>'kind' when 'working' then 'normal' else 'warmup' end,
       coalesce(item->'performed'->>'weightKg',item->'performed'->>'addedWeightKg',item->'performed'->>'assistanceKg')::numeric,
       (item->'performed'->>'reps')::bigint,(item->'performed'->>'durationSeconds')::integer,null,true,null);
   end loop;
 end loop;
 accepted:=jsonb_build_object('operation','create-completed','operationId',p_operation_id,'ownerId',owner,'workoutId',p_operation_id,
   'sourceId',p_completion->>'sourceId','acceptedAt',clock_timestamp());
 insert into public.train_completion_receipts values(owner,p_operation_id,p_completion,accepted);
 return jsonb_build_object('status','accepted','receipt',accepted);
exception when unique_violation then return jsonb_build_object('status','identity_conflict');
end $$;
create or replace function fitness_private.guard_native_workout() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ids uuid[];
begin
 if tg_table_name='workouts' then
   if tg_op='INSERT' then
     if exists(select 1 from public.train_completion_receipts where owner_id=new.user_id and operation_id=new.id) then
       raise check_violation using message='Accepted native identity cannot be recreated';
     end if;
   elsif ((old.native_completion is not null or old.recorded_completion is not null) and (to_jsonb(old)-'updated_at') is distinct from (to_jsonb(new)-'updated_at'))
     or ((old.native_completion is null and old.recorded_completion is null) and (new.native_completion is not null or new.recorded_completion is not null)) then
     raise check_violation using message='Native completion is immutable';
   end if;
 else
   if tg_table_name='workout_exercises' then
     if tg_op<>'INSERT' then ids:=array_append(ids,old.workout_id); end if;
     if tg_op<>'DELETE' then ids:=array_append(ids,new.workout_id); end if;
   else
     if tg_op<>'INSERT' then ids:=array_append(ids,(select workout_id from public.workout_exercises where id=old.workout_exercise_id)); end if;
     if tg_op<>'DELETE' then ids:=array_append(ids,(select workout_id from public.workout_exercises where id=new.workout_exercise_id)); end if;
   end if;
   if exists(select 1 from public.workouts w join public.train_completion_receipts r on r.owner_id=w.user_id and r.operation_id=w.id
     where w.id=any(ids) and (w.native_completion is not null or w.recorded_completion is not null)) then
     raise check_violation using message='Native performed projection is immutable';
   end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create or replace function fitness_private.verify_completed_workout() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved public.workouts; expected jsonb; actual jsonb; document jsonb;
begin
 if tg_op='UPDATE' and old.status='completed' then return new; end if;
 select * into saved from public.workouts where id=new.id;
 if not found or saved.status<>'completed' then return new; end if;
 if not exists(select 1 from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id where e.workout_id=saved.id and s.is_completed) then
   raise check_violation using message='A new completion requires a performed set';
 end if;
 document:=coalesce(saved.native_completion,saved.recorded_completion);
 if document is null then return new; end if;
 if not fitness_private.valid_recorded_completion(document)
   or document->>'id' is distinct from saved.id::text or document->>'ownerId' is distinct from saved.user_id::text
   or saved.started_at is distinct from (document->>'startedAt')::timestamptz
   or saved.completed_at is distinct from (document->>'completedAt')::timestamptz
   or saved.duration_seconds is distinct from (document->>'durationSeconds')::bigint
   or saved.title<>'Workout' or saved.notes is not null or saved.routine_id is not null
   or not exists(select 1 from public.train_completion_receipts where owner_id=saved.user_id and operation_id=saved.id and completion=document) then
   raise check_violation using message='Native completion has no matching accepted receipt';
 end if;
 select jsonb_agg(jsonb_build_object('id',entry->>'id','catalogKey',entry->'definition'->>'catalogKey','sortOrder',position-1,'notes',null,'rest',null,'sets',(
   select jsonb_agg(jsonb_build_object('id',item->>'id','number',number,'kind',case item->'performed'->>'kind' when 'working' then 'normal' else 'warmup' end,
     'weight',coalesce(item->'performed'->'weightKg',item->'performed'->'addedWeightKg',item->'performed'->'assistanceKg'),'reps',item->'performed'->'reps','duration',item->'performed'->'durationSeconds','distance',null,'rpe',null,'completed',true) order by number)
   from jsonb_array_elements(entry->'sets') with ordinality as sets(item,number))) order by position)
 into expected from jsonb_array_elements(document->'exercises') with ordinality as entries(entry,position);
 select jsonb_agg(jsonb_build_object('id',e.id,'catalogKey',d.catalog_key,'sortOrder',e.sort_order,'notes',e.notes,'rest',e.rest_timer_seconds,'sets',(
   select jsonb_agg(jsonb_build_object('id',s.id,'number',s.set_number,'kind',s.set_type,'weight',s.weight_kg,'reps',s.reps,
     'duration',s.duration_seconds,'distance',s.distance_meters,'rpe',s.rpe,'completed',s.is_completed) order by s.set_number)
   from public.workout_sets s where s.workout_exercise_id=e.id)) order by e.sort_order)
 into actual from public.workout_exercises e join public.exercises d on d.id=e.exercise_id where e.workout_id=saved.id and d.user_id is null and not d.is_custom;
 if actual is distinct from expected then raise check_violation using message='Native projection differs from accepted completion'; end if;
 return new;
end $$;

-- Validate newly performed/edited facts, without reinterpreting historical rows.
create function fitness_private.guard_performed_measurements() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare mode text; valid boolean;
begin
 if not new.is_completed then return new; end if;
 if tg_op='UPDATE' and old.is_completed and
   row(old.workout_exercise_id,old.weight_kg,old.reps,old.duration_seconds) is not distinct from
   row(new.workout_exercise_id,new.weight_kg,new.reps,new.duration_seconds) then return new; end if;
 select d.exercise_type into mode from public.workout_exercises e join public.exercises d on d.id=e.exercise_id where e.id=new.workout_exercise_id;
 valid:=case mode
   when 'weight_reps' then new.weight_kg>=0 and new.weight_kg<=1.7976931348623157e308 and new.reps between 1 and 9007199254740991
   when 'weighted_bodyweight' then new.weight_kg>=0 and new.weight_kg<=1.7976931348623157e308 and new.reps between 1 and 9007199254740991
   when 'assisted_bodyweight' then new.weight_kg>=0 and new.weight_kg<=1.7976931348623157e308 and new.reps between 1 and 9007199254740991
   when 'bodyweight_reps' then new.reps between 1 and 9007199254740991
   when 'duration' then new.duration_seconds between 1 and 86400
   else true end;
 if valid is not true then
   raise check_violation using constraint='workout_performed_measurements',message='Complete valid measurements before performing this set';
 end if;
 return new;
end $$;
revoke all on function fitness_private.guard_performed_measurements() from public,anon,authenticated;
create trigger guard_performed_measurements before insert or update on public.workout_sets
 for each row execute function fitness_private.guard_performed_measurements();

-- Keep the existing ownership/active-workout locks and expose a typed validation result.
CREATE OR REPLACE FUNCTION public.add_active_workout_set(p_user_id uuid, p_workout_id uuid, p_workout_exercise_id uuid, p_set jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  violation_constraint text;
  current_workout public.workouts;
  current_exercise public.workout_exercises;
  created_set public.workout_sets;
  next_set_number INTEGER;
BEGIN
  PERFORM fitness_private.require_measurements(p_set,'weight_kg','reps');
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot edit a workout for another user';
  END IF;

  SELECT *
  INTO current_workout
  FROM public.workouts
  WHERE id = p_workout_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF current_workout.status <> 'in_progress' THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'current_status', current_workout.status
    );
  END IF;

  SELECT *
  INTO current_exercise
  FROM public.workout_exercises
  WHERE id = p_workout_exercise_id
    AND workout_id = current_workout.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT COALESCE(MAX(set_number), 0) + 1
  INTO next_set_number
  FROM public.workout_sets
  WHERE workout_exercise_id = current_exercise.id;

  INSERT INTO public.workout_sets (
    workout_exercise_id,
    set_number,
    set_type,
    weight_kg,
    reps,
    duration_seconds,
    distance_meters,
    is_completed,
    rpe
  )
  VALUES (
    current_exercise.id,
    next_set_number,
    COALESCE(p_set->>'set_type', 'normal'),
    (p_set->>'weight_kg')::NUMERIC,
    (p_set->>'reps')::BIGINT,
    (p_set->>'duration_seconds')::INTEGER,
    (p_set->>'distance_meters')::NUMERIC,
    COALESCE((p_set->>'is_completed')::BOOLEAN, false),
    (p_set->>'rpe')::SMALLINT
  )
  RETURNING * INTO created_set;

  RETURN jsonb_build_object(
    'type', 'added',
    'set', to_jsonb(created_set)
  );
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS violation_constraint = CONSTRAINT_NAME;
  IF violation_constraint <> 'workout_performed_measurements' THEN RAISE; END IF;
  RETURN jsonb_build_object('type','invalid','field','measurements','message','Enter complete, valid measurements before completing this set');
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_active_workout_set(p_user_id uuid, p_workout_id uuid, p_workout_exercise_id uuid, p_set_id uuid, p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  violation_constraint text;
  current_workout public.workouts;
  current_exercise public.workout_exercises;
  current_set public.workout_sets;
  updated_set public.workout_sets;
BEGIN
  PERFORM fitness_private.require_measurements(p_changes,'weight_kg','reps');
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot edit a workout for another user';
  END IF;

  SELECT *
  INTO current_workout
  FROM public.workouts
  WHERE id = p_workout_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF current_workout.status <> 'in_progress' THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'current_status', current_workout.status
    );
  END IF;

  SELECT *
  INTO current_exercise
  FROM public.workout_exercises
  WHERE id = p_workout_exercise_id
    AND workout_id = current_workout.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT *
  INTO current_set
  FROM public.workout_sets
  WHERE id = p_set_id
    AND workout_exercise_id = current_exercise.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  UPDATE public.workout_sets
  SET set_type = CASE
        WHEN p_changes ? 'set_type' THEN p_changes->>'set_type'
        ELSE set_type
      END,
      weight_kg = CASE
        WHEN p_changes ? 'weight_kg' THEN (p_changes->>'weight_kg')::NUMERIC
        ELSE weight_kg
      END,
      reps = CASE
        WHEN p_changes ? 'reps' THEN (p_changes->>'reps')::BIGINT
        ELSE reps
      END,
      duration_seconds = CASE
        WHEN p_changes ? 'duration_seconds'
          THEN (p_changes->>'duration_seconds')::INTEGER
        ELSE duration_seconds
      END,
      distance_meters = CASE
        WHEN p_changes ? 'distance_meters'
          THEN (p_changes->>'distance_meters')::NUMERIC
        ELSE distance_meters
      END,
      is_completed = CASE
        WHEN p_changes ? 'is_completed'
          THEN (p_changes->>'is_completed')::BOOLEAN
        ELSE is_completed
      END,
      rpe = CASE
        WHEN p_changes ? 'rpe' THEN (p_changes->>'rpe')::SMALLINT
        ELSE rpe
      END
  WHERE id = current_set.id
  RETURNING * INTO updated_set;

  RETURN jsonb_build_object(
    'type', 'updated',
    'set', to_jsonb(updated_set)
  );
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS violation_constraint = CONSTRAINT_NAME;
  IF violation_constraint <> 'workout_performed_measurements' THEN RAISE; END IF;
  RETURN jsonb_build_object('type','invalid','field','measurements','message','Enter complete, valid measurements before completing this set');
END;
$function$;
