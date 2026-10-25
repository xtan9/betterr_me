-- Phase A: old cookie CRUD remains usable until the new server is deployed.
-- The separate contract migration is the only operation that enables creation
-- and v3 recording and removes ordinary direct writes.
alter table public.exercises
  add column version bigint not null default 1 check (version>0),
  add column archived_at timestamptz,
  add column measurement_convention text;

-- Keep standalone deletion of a referenced definition prohibited at commit,
-- while allowing all nested profile-owned cascades to complete.
-- RESTRICT checked before the sibling workout/routine cascades and blocked
-- account erasure whenever a custom definition had a recorded reference.
alter table public.workout_exercises drop constraint workout_exercises_exercise_id_fkey;
alter table public.workout_exercises add constraint workout_exercises_exercise_id_fkey
  foreign key(exercise_id) references public.exercises(id) on delete no action deferrable initially deferred;
alter table public.routine_exercises drop constraint routine_exercises_exercise_id_fkey;
alter table public.routine_exercises add constraint routine_exercises_exercise_id_fkey
  foreign key(exercise_id) references public.exercises(id) on delete no action deferrable initially deferred;

create table fitness_private.custom_exercise_rollout (
  singleton boolean primary key default true check (singleton),
  ready boolean not null default false
);
alter table fitness_private.custom_exercise_rollout enable row level security;
revoke all on fitness_private.custom_exercise_rollout from public,anon,authenticated,service_role;
insert into fitness_private.custom_exercise_rollout(singleton,ready) values(true,false);

create function fitness_private.version_custom_exercise() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Known definitions are unavailable throughout expansion. Old rows and old
 -- writers retain their explicit unknown convention; there is no backfill.
 if new.measurement_convention is not null then
   raise check_violation using message='Custom exercise recording is not ready';
 end if;
 if tg_op='INSERT' then new.version:=1;
 else new.version:=old.version+1; end if;
 return new;
end $$;
revoke all on function fitness_private.version_custom_exercise() from public,anon,authenticated,service_role;
create trigger version_custom_exercise before insert or update on public.exercises
for each row execute function fitness_private.version_custom_exercise();

create function fitness_private.custom_exercise_capabilities() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare enabled boolean;
begin
 if auth.uid() is null then raise insufficient_privilege using message='Authentication required'; end if;
 select ready into strict enabled from fitness_private.custom_exercise_rollout where singleton;
 return jsonb_build_object('protocolVersion',1,'customExercises',jsonb_build_object('contractVersion',1,'ready',enabled),
   'completionVersions',case when enabled then '[1,2,3]'::jsonb else '[1,2]'::jsonb end);
end $$;
revoke all on function fitness_private.custom_exercise_capabilities() from public,anon,service_role;
grant execute on function fitness_private.custom_exercise_capabilities() to authenticated;
create function public.train_custom_exercise_capabilities() returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select fitness_private.custom_exercise_capabilities()$$;
revoke all on function public.train_custom_exercise_capabilities() from public,anon,service_role;
grant execute on function public.train_custom_exercise_capabilities() to authenticated;

-- Outcomes outlive definitions; only account erasure cascades their evidence.
create table public.train_exercise_command_outcomes (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  receipt jsonb,
  rejection jsonb,
  primary key(owner_id,operation_id),
  check ((receipt is null) <> (rejection is null))
);
alter table public.train_exercise_command_outcomes enable row level security;
revoke all on public.train_exercise_command_outcomes from public,anon,authenticated,service_role;
grant select on public.train_exercise_command_outcomes to authenticated;
create policy train_exercise_outcome_owner on public.train_exercise_command_outcomes
for select to authenticated using ((select auth.uid())=owner_id);

create function fitness_private.custom_exercise_dto(e public.exercises) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',e.id,'ownerId',e.user_id,'name',e.name,'equipment',e.equipment,'mode',e.exercise_type,
   'convention',e.measurement_convention,'primaryMuscle',e.muscle_group_primary,'secondaryMuscles',e.muscle_groups_secondary,
   'archivedAt',e.archived_at,'version',e.version::text,'createdAt',e.created_at,'updatedAt',e.updated_at)
$$;
revoke all on function fitness_private.custom_exercise_dto(public.exercises) from public,anon,authenticated,service_role;

create function fitness_private.custom_exercise_convention(equipment text, mode text) returns text
language sql immutable set search_path=pg_catalog as $$
 select case mode
 when 'weight_reps' then case equipment when 'barbell' then 'barbell-total' when 'dumbbell' then 'per-dumbbell' else 'selected-load' end
 when 'bodyweight_reps' then 'bodyweight-repetitions' when 'weighted_bodyweight' then 'added-load'
 when 'assisted_bodyweight' then 'assistance' when 'duration' then 'seconds' end
$$;
revoke all on function fitness_private.custom_exercise_convention(text,text) from public,anon,authenticated,service_role;

create function fitness_private.valid_exercise_metadata(value jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare muscles constant text[]:=array['chest','back','shoulders','biceps','triceps','forearms','core','quadriceps','hamstrings','glutes','calves','traps','lats','full_body','cardio','other'];
begin
 if value ? 'name' and (jsonb_typeof(value->'name') is distinct from 'string'
   or length(value->>'name') not between 1 and 100 or value->>'name' ~ '^[[:space:]]|[[:space:]]$') then return false; end if;
 if value ? 'primaryMuscle' and not coalesce(value->>'primaryMuscle'=any(muscles),false) then return false; end if;
 if value ? 'secondaryMuscles' then
   if jsonb_typeof(value->'secondaryMuscles') is distinct from 'array' then return false; end if;
   if exists(select 1 from jsonb_array_elements(value->'secondaryMuscles') m where jsonb_typeof(m) is distinct from 'string'
     or not coalesce(m#>>'{}'=any(muscles),false)) then return false; end if;
 end if;
 return true;
end $$;
revoke all on function fitness_private.valid_exercise_metadata(jsonb) from public,anon,authenticated,service_role;

create function fitness_private.execute_exercise_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); command_id uuid; exercise_id uuid; kind text; command jsonb; patch jsonb;
 previous public.train_exercise_command_outcomes; saved public.exercises; result jsonb; rejection jsonb; receipt jsonb;
 code text; enabled boolean; expected bigint;
 canonical_uuid constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if not coalesce(fitness_private.exact_keys(p_request,array['protocolVersion','operationId','command']),false)
   or jsonb_typeof(p_request->'operationId') is distinct from 'string' or p_request->>'operationId' !~ canonical_uuid
   or jsonb_typeof(p_request->'command') is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if p_request->'protocolVersion' is distinct from '1'::jsonb then return jsonb_build_object('status','unsupported_version'); end if;
 command:=p_request->'command'; kind:=command->>'kind'; command_id:=(p_request->>'operationId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':train:exercise:'||command_id::text,0));
 select * into previous from public.train_exercise_command_outcomes o where o.owner_id=owner and o.operation_id=command_id;
 if found then
   if previous.request is distinct from p_request then return jsonb_build_object('status','operation_conflict'); end if;
   return case when previous.receipt is not null then jsonb_build_object('status','accepted','receipt',previous.receipt)
     else jsonb_build_object('status',previous.rejection->>'code','rejection',previous.rejection) end;
 end if;
 if kind='create' then
   if not coalesce(fitness_private.exact_keys(command,array['kind','definition']),false)
     or not coalesce(fitness_private.exact_keys(command->'definition',array['name','equipment','mode','convention','primaryMuscle','secondaryMuscles']),false)
     then return jsonb_build_object('status','invalid_request'); end if;
   exercise_id:=command_id;
 elsif kind in ('update-metadata','archive','restore') then
   if not coalesce(fitness_private.exact_keys(command,case when kind='update-metadata' then array['kind','exerciseId','expectedVersion','patch'] else array['kind','exerciseId','expectedVersion'] end),false)
     or jsonb_typeof(command->'exerciseId') is distinct from 'string' or command->>'exerciseId' !~ canonical_uuid
     or jsonb_typeof(command->'expectedVersion') is distinct from 'string' or command->>'expectedVersion' !~ '^[1-9][0-9]{0,18}$'
     then return jsonb_build_object('status','invalid_request'); end if;
   if (command->>'expectedVersion')::numeric>9223372036854775807 then return jsonb_build_object('status','invalid_request'); end if;
   exercise_id:=(command->>'exerciseId')::uuid; expected:=(command->>'expectedVersion')::bigint;
   if kind='update-metadata' then
     patch:=command->'patch';
     if jsonb_typeof(patch) is distinct from 'object' or patch='{}'::jsonb then return jsonb_build_object('status','invalid_request'); end if;
     if exists(select 1 from jsonb_object_keys(patch) k where k not in ('name','primaryMuscle','secondaryMuscles')) then
       return jsonb_build_object('status','invalid_request'); end if;
   end if;
 else return jsonb_build_object('status','invalid_request'); end if;

 select ready into strict enabled from fitness_private.custom_exercise_rollout where singleton;
 if kind='create' then
   if not enabled then return jsonb_build_object('status','not_ready'); end if;
   patch:=command->'definition';
   if not fitness_private.valid_exercise_metadata(patch)
     or not coalesce(patch->>'equipment'=any(array['barbell','dumbbell','machine','bodyweight','kettlebell','cable','band','other','none']),false)
     or not coalesce(patch->>'mode'=any(array['weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration','duration_weight','distance_duration','weight_distance']),false)
     or patch->'convention' is distinct from coalesce(to_jsonb(fitness_private.custom_exercise_convention(patch->>'equipment',patch->>'mode')),'null'::jsonb)
     then code:='invalid_definition';
   else
     begin
       insert into public.exercises(id,user_id,name,muscle_group_primary,muscle_groups_secondary,equipment,exercise_type,is_custom,measurement_convention)
       values(exercise_id,owner,patch->>'name',patch->>'primaryMuscle',array(select jsonb_array_elements_text(patch->'secondaryMuscles')),
         patch->>'equipment',patch->>'mode',true,patch->>'convention') returning * into saved;
     exception when unique_violation then code:='identity_conflict'; end;
   end if;
 else
   select * into saved from public.exercises e where e.id=exercise_id and e.user_id=owner and e.is_custom and e.catalog_key is null for update;
   if not found then code:='not_found';
   elsif saved.version<>expected then code:='version_conflict';
   elsif kind='update-metadata' and not fitness_private.valid_exercise_metadata(patch) then code:='invalid_definition';
   else
     update public.exercises e set
       name=case when patch ? 'name' then patch->>'name' else e.name end,
       muscle_group_primary=case when patch ? 'primaryMuscle' then patch->>'primaryMuscle' else e.muscle_group_primary end,
       muscle_groups_secondary=case when patch ? 'secondaryMuscles' then array(select jsonb_array_elements_text(patch->'secondaryMuscles')) else e.muscle_groups_secondary end,
       archived_at=case kind when 'archive' then coalesce(e.archived_at,clock_timestamp()) when 'restore' then null else e.archived_at end
     where e.id=exercise_id returning * into saved;
   end if;
 end if;
 if code is not null then
   rejection:=jsonb_build_object('operationId',command_id,'operation',kind,'ownerId',owner,'exerciseId',exercise_id,'rejectedAt',clock_timestamp(),'code',code);
   if code='version_conflict' then rejection:=rejection||jsonb_build_object('current',fitness_private.custom_exercise_dto(saved)); end if;
   insert into public.train_exercise_command_outcomes values(owner,command_id,p_request,null,rejection);
   return jsonb_build_object('status',code,'rejection',rejection);
 end if;
 receipt:=jsonb_build_object('operationId',command_id,'operation',kind,'ownerId',owner,'exerciseId',exercise_id,'acceptedAt',clock_timestamp(),
   'definition',fitness_private.custom_exercise_dto(saved));
 insert into public.train_exercise_command_outcomes values(owner,command_id,p_request,receipt,null);
 return jsonb_build_object('status','accepted','receipt',receipt);
end $$;
revoke all on function fitness_private.execute_exercise_command(jsonb) from public,anon,service_role;
grant execute on function fitness_private.execute_exercise_command(jsonb) to authenticated;
create function public.execute_train_exercise_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select fitness_private.execute_exercise_command(p_request)$$;
revoke all on function public.execute_train_exercise_command(jsonb) from public,anon,service_role;
grant execute on function public.execute_train_exercise_command(jsonb) to authenticated;

create index train_custom_exercise_owner_id_idx on public.exercises(user_id,id) where is_custom and catalog_key is null;
create function fitness_private.read_custom_exercises(p_id uuid,p_after uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); enabled boolean; saved public.exercises; definitions jsonb; next_cursor uuid;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 select ready into strict enabled from fitness_private.custom_exercise_rollout where singleton;
 if not enabled then return jsonb_build_object('status','not_ready'); end if;
 if p_id is not null then
   select * into saved from public.exercises e where e.id=p_id and e.user_id=owner and e.is_custom and e.catalog_key is null;
   if not found then return jsonb_build_object('status','not_found'); end if;
   return jsonb_build_object('status','available','definition',fitness_private.custom_exercise_dto(saved));
 end if;
 with page as (
   select e,row_number() over(order by e.id) position from public.exercises e
   where e.user_id=owner and e.is_custom and e.catalog_key is null and (p_after is null or e.id>p_after)
   order by e.id limit 101
 ) select coalesce(jsonb_agg(fitness_private.custom_exercise_dto(e) order by (e).id) filter(where position<=100),'[]'::jsonb),
   case when count(*)>100 then (array_agg((e).id order by (e).id))[100] end into definitions,next_cursor from page;
 return jsonb_build_object('status','available','definitions',definitions,'nextCursor',next_cursor);
end $$;
revoke all on function fitness_private.read_custom_exercises(uuid,uuid) from public,anon,service_role;
grant execute on function fitness_private.read_custom_exercises(uuid,uuid) to authenticated;
create function public.read_train_custom_exercises(p_id uuid default null,p_after uuid default null) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select fitness_private.read_custom_exercises(p_id,p_after)$$;
revoke all on function public.read_train_custom_exercises(uuid,uuid) from public,anon,service_role;
grant execute on function public.read_train_custom_exercises(uuid,uuid) to authenticated;

-- Prepare v3 readers/projectors in B, while A keeps all v3 writes closed.
alter table public.workouts drop constraint workouts_recorded_authority_check;
alter table public.workouts add constraint workouts_recorded_authority_check check (
  (native_completion is null or recorded_completion is null)
  and (native_completion is null and recorded_completion is null or status='completed')
  and (native_completion is null or (jsonb_typeof(native_completion)='object' and native_completion->'version' is not distinct from '1'::jsonb))
  and (recorded_completion is null or (jsonb_typeof(recorded_completion)='object' and recorded_completion->'version' in ('2'::jsonb,'3'::jsonb)))
);

-- Resolve identity/visibility/immutable meaning, never the captured name or
-- maintenance version. An archived reference remains valid for queued work.
create function fitness_private.completed_exercise_reference(definition jsonb, owner uuid) returns uuid
language plpgsql set search_path=pg_catalog,public as $$
declare result uuid;
begin
 if definition ? 'reference' then
   select id into result from public.exercises
   where id=(definition->'reference'->>'exerciseId')::uuid and user_id=owner and is_custom and catalog_key is null
     and definition->'reference'->>'ownerId'=owner::text and definition->'reference'->>'kind'='custom'
     and equipment=definition->>'equipment' and exercise_type=definition->>'mode'
     and measurement_convention is not distinct from definition->>'convention' for share;
 else
   select id into result from public.exercises
   where catalog_key=definition->>'catalogKey' and user_id is null and not is_custom
     and equipment=definition->>'equipment' and exercise_type=definition->>'mode' for share;
 end if;
 return result;
end $$;
revoke all on function fitness_private.completed_exercise_reference(jsonb,uuid) from public,anon,authenticated,service_role;

create or replace function fitness_private.valid_recorded_completion(doc jsonb) returns boolean
language plpgsql stable set search_path=pg_catalog,public as $$
declare entry jsonb; definition jsonb; item jsonb; performed jsonb; identifiers uuid[]:='{}'; identity uuid; started timestamptz; ended timestamptz;
  instant_pattern constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$';
begin
 if doc->'version'='1'::jsonb then return fitness_private.valid_native_completion(doc); end if;
 if doc->'version'='3'::jsonb and not (select ready from fitness_private.custom_exercise_rollout where singleton) then return false; end if;
 if not fitness_private.exact_keys(doc,array['version','id','ownerId','sourceId','startedAt','completedAt','durationSeconds','timezone','workoutDay','planId','exercises'])
   or doc->'version' not in ('2'::jsonb,'3'::jsonb)
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
   if doc->'version'='3'::jsonb and definition ? 'reference' then
     if not fitness_private.exact_keys(definition,array['reference','name','equipment','mode','convention'])
       or not fitness_private.exact_keys(definition->'reference',array['kind','exerciseId','ownerId'])
       or definition->'reference'->>'kind' is distinct from 'custom'
       or not coalesce(fitness_private.valid_uuid(definition->'reference'->'exerciseId') and fitness_private.valid_uuid(definition->'reference'->'ownerId'),false)
       or definition->'reference'->>'ownerId' is distinct from doc->>'ownerId'
       or jsonb_typeof(definition->'name') is distinct from 'string'
       or not coalesce(definition->>'equipment' in ('barbell','dumbbell','machine','bodyweight','kettlebell','band','cable','other','none'),false)
       or not coalesce(definition->>'mode' in ('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration'),false)
       or not coalesce(definition->'convention'='null'::jsonb or (jsonb_typeof(definition->'convention')='string'
         and definition->>'convention'=fitness_private.custom_exercise_convention(definition->>'equipment',definition->>'mode')),false)
       then return false; end if;
   else
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
   end if;
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
declare owner uuid:=auth.uid(); previous public.train_completion_receipts; entry jsonb; item jsonb;
  entry_index integer:=0; set_index integer; accepted jsonb; reference_id uuid;
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
   reference_id:=fitness_private.completed_exercise_reference(entry->'definition',owner);
   if reference_id is null then return jsonb_build_object('status','reference_unavailable'); end if;
 end loop;
 insert into public.workouts(id,user_id,title,status,started_at,completed_at,duration_seconds,notes,routine_id,native_completion,recorded_completion)
 values(p_operation_id,owner,'Workout','completed',(p_completion->>'startedAt')::timestamptz,(p_completion->>'completedAt')::timestamptz,
   (p_completion->>'durationSeconds')::bigint,null,null,
   case when p_completion->'version'='1'::jsonb then p_completion end,
   case when p_completion->'version' in ('2'::jsonb,'3'::jsonb) then p_completion end);
 for entry in select value from jsonb_array_elements(p_completion->'exercises') loop
   reference_id:=fitness_private.completed_exercise_reference(entry->'definition',owner);
   insert into public.workout_exercises(id,workout_id,exercise_id,sort_order,notes,rest_timer_seconds)
   values((entry->>'id')::uuid,p_operation_id,reference_id,entry_index,null,null);
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
 select jsonb_agg(jsonb_build_object('id',entry->>'id','exerciseId',fitness_private.completed_exercise_reference(entry->'definition',saved.user_id),'sortOrder',position-1,'notes',null,'rest',null,'sets',(
   select jsonb_agg(jsonb_build_object('id',item->>'id','number',number,'kind',case item->'performed'->>'kind' when 'working' then 'normal' else 'warmup' end,
     'weight',coalesce(item->'performed'->'weightKg',item->'performed'->'addedWeightKg',item->'performed'->'assistanceKg'),'reps',item->'performed'->'reps','duration',item->'performed'->'durationSeconds','distance',null,'rpe',null,'completed',true) order by number)
   from jsonb_array_elements(entry->'sets') with ordinality as sets(item,number))) order by position)
 into expected from jsonb_array_elements(document->'exercises') with ordinality as entries(entry,position);
 select jsonb_agg(jsonb_build_object('id',e.id,'exerciseId',e.exercise_id,'sortOrder',e.sort_order,'notes',e.notes,'rest',e.rest_timer_seconds,'sets',(
   select jsonb_agg(jsonb_build_object('id',s.id,'number',s.set_number,'kind',s.set_type,'weight',s.weight_kg,'reps',s.reps,
     'duration',s.duration_seconds,'distance',s.distance_meters,'rpe',s.rpe,'completed',s.is_completed) order by s.set_number)
   from public.workout_sets s where s.workout_exercise_id=e.id)) order by e.sort_order)
 into actual from public.workout_exercises e join public.exercises d on d.id=e.exercise_id where e.workout_id=saved.id and (d.user_id is null and not d.is_custom or d.user_id=saved.user_id and d.is_custom and d.catalog_key is null);
 if actual is distinct from expected then raise check_violation using message='Native projection differs from accepted completion'; end if;
 return new;
end $$;


-- One content revision authority before and after contraction. Phase C changes
-- the private gate and ordinary grants atomically; it does not replace writers.
create or replace function fitness_private.version_custom_exercise() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare enabled boolean;
begin
 select ready into strict enabled from fitness_private.custom_exercise_rollout where singleton;
 if not enabled then
   if new.measurement_convention is not null then raise check_violation using message='Custom exercise recording is not ready'; end if;
 else
   if tg_op='UPDATE' and (old.is_custom or old.user_id is not null or new.is_custom or new.user_id is not null)
     and row(old.id,old.user_id,old.is_custom,old.catalog_key,old.equipment,old.exercise_type,old.measurement_convention)
       is distinct from row(new.id,new.user_id,new.is_custom,new.catalog_key,new.equipment,new.exercise_type,new.measurement_convention) then
     raise check_violation using message='Custom exercise identity and recording meaning are immutable';
   end if;
   if new.is_custom and new.user_id is not null then
     if new.catalog_key is not null or (new.measurement_convention is not null and
       new.measurement_convention is distinct from fitness_private.custom_exercise_convention(new.equipment,new.exercise_type))
       or (tg_op='INSERT' and new.measurement_convention is distinct from fitness_private.custom_exercise_convention(new.equipment,new.exercise_type)) then
       raise check_violation using message='Custom exercise recording convention is invalid';
     end if;
   elsif new.measurement_convention is not null then
     raise check_violation using message='Preset recording convention is captured separately';
   end if;
 end if;
 if tg_op='INSERT' then new.version:=1; else new.version:=old.version+1; end if;
 return new;
end $$;
