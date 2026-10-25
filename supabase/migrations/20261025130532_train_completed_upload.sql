-- Native sessions remain local until complete; preserve the Web active index.
alter table public.workout_sets alter column weight_kg type numeric, alter column reps type bigint;
alter table public.routine_exercises alter column target_weight_kg type numeric, alter column target_reps type bigint;
alter table public.workouts alter column duration_seconds type bigint, add column native_completion jsonb;
comment on column public.workouts.native_completion is
  'Immutable accepted native v1 completion. NULL for legacy records; planId is opaque provenance, not an owned plan association.';

-- Retain the deployed trusted-server authority explicitly; local/new projects
-- must not depend on ambient Data API default grants.
grant select,insert,update,delete on public.exercises,public.routines,public.routine_exercises,
  public.workouts,public.workout_exercises,public.workout_sets to service_role;
grant select on public.profiles,public.exercise_media to service_role;

create schema if not exists fitness_private;
revoke all on schema fitness_private from public;
grant usage on schema fitness_private to authenticated, service_role;

-- No workout FK: an accepted create must never resurrect an authorized deletion.
create table public.train_completion_receipts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  completion jsonb not null,
  receipt jsonb not null,
  primary key(owner_id,operation_id)
);
alter table public.train_completion_receipts enable row level security;
revoke all on public.train_completion_receipts from public,anon,authenticated;
grant select on public.train_completion_receipts to authenticated;
create policy train_receipt_owner on public.train_completion_receipts for select to authenticated
  using ((select auth.uid())=owner_id);

create function fitness_private.exact_keys(value jsonb, keys text[]) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select case when jsonb_typeof(value)='object' then
   (select array_agg(k order by k) from jsonb_object_keys(value) k) =
   (select array_agg(k order by k) from unnest(keys) k) else false end
$$;
create function fitness_private.valid_uuid(value jsonb) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select jsonb_typeof(value)='string' and value#>>'{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;
create function fitness_private.valid_measure(value jsonb, integral boolean, minimum numeric) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select case when jsonb_typeof(value)='number' then
   (value#>>'{}')::numeric >= minimum and
   (value#>>'{}')::numeric <= case when integral then 9007199254740991::numeric else 1.7976931348623157e308::numeric end and
   (not integral or trunc((value#>>'{}')::numeric)=(value#>>'{}')::numeric)
 else false end
$$;
create function fitness_private.valid_native_completion(doc jsonb) returns boolean
language plpgsql stable set search_path=pg_catalog,public as $$
declare entry jsonb; definition jsonb; item jsonb; performed jsonb; identifiers uuid[]:='{}'; identity uuid; started timestamptz; ended timestamptz;
  instant_pattern constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$';
begin
 if not fitness_private.exact_keys(doc,array['version','id','ownerId','sourceId','startedAt','completedAt','durationSeconds','timezone','workoutDay','planId','exercises'])
   or doc->'version' is distinct from '1'::jsonb
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
     or definition->>'mode' is distinct from 'weight_reps'
     or coalesce(definition->>'equipment','') not in ('barbell','dumbbell','machine','cable')
     or definition->>'convention' is distinct from (case definition->>'equipment' when 'barbell' then 'barbell-total' when 'dumbbell' then 'per-dumbbell' else 'selected-load' end) then return false; end if;
   for item in select value from jsonb_array_elements(entry->'sets') loop
     if not fitness_private.exact_keys(item,array['id','performed']) or not coalesce(fitness_private.valid_uuid(item->'id'),false) then return false; end if;
     identity:=(item->>'id')::uuid;
     if identity=any(identifiers) then return false; end if;
     identifiers:=array_append(identifiers,identity); performed:=item->'performed';
     if not fitness_private.exact_keys(performed,array['weightKg','reps','kind'])
       or not fitness_private.valid_measure(performed->'weightKg',false,0) or not fitness_private.valid_measure(performed->'reps',true,1)
       or coalesce(performed->>'kind','') not in ('working','warmup') then return false; end if;
   end loop;
 end loop;
 return true;
exception when invalid_text_representation or invalid_parameter_value or datetime_field_overflow then return false;
end $$;
revoke all on all functions in schema fitness_private from public,anon,authenticated;

create function fitness_private.upload_completed_workout(p_operation_id uuid,p_completion jsonb) returns jsonb
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
 if not fitness_private.valid_native_completion(p_completion) then return jsonb_build_object('status','invalid_completion'); end if;
 if exists(select 1 from public.workouts where id=p_operation_id) then return jsonb_build_object('status','identity_conflict'); end if;
 for entry in select value from jsonb_array_elements(p_completion->'exercises') loop
   perform 1 from public.exercises where catalog_key=entry->'definition'->>'catalogKey' and user_id is null and not is_custom
     and equipment=entry->'definition'->>'equipment' and exercise_type='weight_reps' for share;
   if not found then return jsonb_build_object('status','reference_unavailable'); end if;
 end loop;
 insert into public.workouts(id,user_id,title,status,started_at,completed_at,duration_seconds,notes,routine_id,native_completion)
 values(p_operation_id,owner,'Workout','completed',(p_completion->>'startedAt')::timestamptz,(p_completion->>'completedAt')::timestamptz,
   (p_completion->>'durationSeconds')::bigint,null,null,p_completion);
 for entry in select value from jsonb_array_elements(p_completion->'exercises') loop
   select * into strict definition from public.exercises where catalog_key=entry->'definition'->>'catalogKey' and user_id is null and not is_custom;
   insert into public.workout_exercises(id,workout_id,exercise_id,sort_order,notes,rest_timer_seconds)
   values((entry->>'id')::uuid,p_operation_id,definition.id,entry_index,null,null);
   entry_index:=entry_index+1; set_index:=0;
   for item in select value from jsonb_array_elements(entry->'sets') loop
     set_index:=set_index+1;
     insert into public.workout_sets(id,workout_exercise_id,set_number,set_type,weight_kg,reps,duration_seconds,distance_meters,is_completed,rpe)
     values((item->>'id')::uuid,(entry->>'id')::uuid,set_index,case item->'performed'->>'kind' when 'working' then 'normal' else 'warmup' end,
       (item->'performed'->>'weightKg')::numeric,(item->'performed'->>'reps')::bigint,null,null,true,null);
   end loop;
 end loop;
 accepted:=jsonb_build_object('operation','create-completed','operationId',p_operation_id,'ownerId',owner,'workoutId',p_operation_id,
   'sourceId',p_completion->>'sourceId','acceptedAt',clock_timestamp());
 insert into public.train_completion_receipts values(owner,p_operation_id,p_completion,accepted);
 return jsonb_build_object('status','accepted','receipt',accepted);
exception when unique_violation then return jsonb_build_object('status','identity_conflict');
end $$;
revoke all on function fitness_private.upload_completed_workout(uuid,jsonb) from public,anon;
grant execute on function fitness_private.upload_completed_workout(uuid,jsonb) to authenticated;
create function public.upload_completed_workout(p_operation_id uuid,p_completion jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select fitness_private.upload_completed_workout(p_operation_id,p_completion)$$;
revoke all on function public.upload_completed_workout(uuid,jsonb) from public,anon;
grant execute on function public.upload_completed_workout(uuid,jsonb) to authenticated;

-- Table grants remain compatible. Native documents/projections cannot be edited
-- through those grants, including moving a legacy child into a native parent.
create function fitness_private.guard_native_workout() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ids uuid[];
begin
 if tg_table_name='workouts' then
   if tg_op='INSERT' then
     if new.native_completion is not null and exists(select 1 from public.train_completion_receipts where owner_id=new.user_id and operation_id=new.id) then
       raise check_violation using message='Accepted native identity cannot be recreated';
     end if;
   elsif (old.native_completion is not null and (to_jsonb(old)-'updated_at') is distinct from (to_jsonb(new)-'updated_at'))
     or (old.native_completion is null and new.native_completion is not null) then
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
     where w.id=any(ids) and w.native_completion is not null) then
     raise check_violation using message='Native performed projection is immutable';
   end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function fitness_private.guard_native_workout() from public,anon,authenticated;
create trigger guard_native_workout before insert or update on public.workouts for each row execute function fitness_private.guard_native_workout();
create trigger guard_native_exercise before insert or update or delete on public.workout_exercises for each row execute function fitness_private.guard_native_workout();
create trigger guard_native_set before insert or update or delete on public.workout_sets for each row execute function fitness_private.guard_native_workout();

create function fitness_private.verify_completed_workout() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved public.workouts; expected jsonb; actual jsonb;
begin
 if tg_op='UPDATE' and old.status='completed' then return new; end if;
 select * into saved from public.workouts where id=new.id;
 if not found or saved.status<>'completed' then return new; end if;
 if not exists(select 1 from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id where e.workout_id=saved.id and s.is_completed) then
   raise check_violation using message='A new completion requires a performed set';
 end if;
 if saved.native_completion is null then return new; end if;
 if not fitness_private.valid_native_completion(saved.native_completion)
   or saved.native_completion->>'id' is distinct from saved.id::text or saved.native_completion->>'ownerId' is distinct from saved.user_id::text
   or saved.started_at is distinct from (saved.native_completion->>'startedAt')::timestamptz
   or saved.completed_at is distinct from (saved.native_completion->>'completedAt')::timestamptz
   or saved.duration_seconds is distinct from (saved.native_completion->>'durationSeconds')::bigint
   or saved.title<>'Workout' or saved.notes is not null or saved.routine_id is not null
   or not exists(select 1 from public.train_completion_receipts where owner_id=saved.user_id and operation_id=saved.id and completion=saved.native_completion) then
   raise check_violation using message='Native completion has no matching accepted receipt';
 end if;
 select jsonb_agg(jsonb_build_object('id',entry->>'id','catalogKey',entry->'definition'->>'catalogKey','sortOrder',position-1,'notes',null,'rest',null,'sets',(
   select jsonb_agg(jsonb_build_object('id',item->>'id','number',number,'kind',case item->'performed'->>'kind' when 'working' then 'normal' else 'warmup' end,
     'weight',item->'performed'->'weightKg','reps',item->'performed'->'reps','duration',null,'distance',null,'rpe',null,'completed',true) order by number)
   from jsonb_array_elements(entry->'sets') with ordinality as sets(item,number))) order by position)
 into expected from jsonb_array_elements(saved.native_completion->'exercises') with ordinality as entries(entry,position);
 select jsonb_agg(jsonb_build_object('id',e.id,'catalogKey',d.catalog_key,'sortOrder',e.sort_order,'notes',e.notes,'rest',e.rest_timer_seconds,'sets',(
   select jsonb_agg(jsonb_build_object('id',s.id,'number',s.set_number,'kind',s.set_type,'weight',s.weight_kg,'reps',s.reps,
     'duration',s.duration_seconds,'distance',s.distance_meters,'rpe',s.rpe,'completed',s.is_completed) order by s.set_number)
   from public.workout_sets s where s.workout_exercise_id=e.id)) order by e.sort_order)
 into actual from public.workout_exercises e join public.exercises d on d.id=e.exercise_id where e.workout_id=saved.id and d.user_id is null and not d.is_custom;
 if actual is distinct from expected then raise check_violation using message='Native projection differs from accepted completion'; end if;
 return new;
end $$;
revoke all on function fitness_private.verify_completed_workout() from public,anon,authenticated;
create constraint trigger verify_completed_workout after insert or update on public.workouts
deferrable initially deferred for each row when (new.status='completed') execute function fitness_private.verify_completed_workout();

-- Future inputs are checked before bigint casts; old rows are not revalidated.
create function fitness_private.require_measurements(value jsonb, weight_key text, reps_key text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if (value ? weight_key and value->weight_key<>'null'::jsonb and not fitness_private.valid_measure(value->weight_key,false,0))
   or (value ? reps_key and value->reps_key<>'null'::jsonb and not fitness_private.valid_measure(value->reps_key,true,0)) then
   raise invalid_parameter_value using message='Invalid workout measurement';
 end if;
end $$;
revoke all on function fitness_private.require_measurements(jsonb,text,text) from public,anon;
grant execute on function fitness_private.require_measurements(jsonb,text,text) to authenticated,service_role;

create function fitness_private.guard_measurements() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare before_value jsonb:='{}'; value jsonb:=to_jsonb(new); weight_key text; reps_key text;
begin
 if tg_op='UPDATE' then before_value:=to_jsonb(old); end if;
 weight_key:=case when tg_table_name='routine_exercises' then 'target_weight_kg' else 'weight_kg' end;
 reps_key:=case when tg_table_name='routine_exercises' then 'target_reps' else 'reps' end;
 if tg_op='UPDATE' and before_value->weight_key is not distinct from value->weight_key then value:=value-weight_key; end if;
 if tg_op='UPDATE' and before_value->reps_key is not distinct from value->reps_key then value:=value-reps_key; end if;
 perform fitness_private.require_measurements(value,weight_key,reps_key);
 return new;
end $$;
revoke all on function fitness_private.guard_measurements() from public,anon,authenticated;
create trigger guard_workout_measurements before insert or update on public.workout_sets for each row execute function fitness_private.guard_measurements();
create trigger guard_routine_measurements before insert or update on public.routine_exercises for each row execute function fitness_private.guard_measurements();

do $patch$
declare definition text; signature regprocedure; before_cast text;
begin
 for signature,before_cast in select * from (values
   ('public.add_active_workout_set(uuid,uuid,uuid,jsonb)'::regprocedure,'p_set'),
   ('public.update_active_workout_set(uuid,uuid,uuid,uuid,jsonb)'::regprocedure,'p_changes')
 ) as changes(signature,parameter) loop
   select pg_get_functiondef(signature) into definition;
   if position('('||before_cast||'->>''reps'')::INTEGER' in definition)=0 then raise exception 'Unexpected active set function shape'; end if;
   definition:=replace(definition,'('||before_cast||'->>''reps'')::INTEGER','('||before_cast||'->>''reps'')::BIGINT');
   definition:=replace(definition,E'BEGIN\n',E'BEGIN\n  PERFORM fitness_private.require_measurements('||before_cast||',''weight_kg'',''reps'');'||E'\n');
   execute definition;
 end loop;
 select pg_get_functiondef('public.start_workout_from_routine(uuid,jsonb,jsonb)'::regprocedure) into definition;
 if position('(requested_set->>''reps'')::INTEGER' in definition)=0 then raise exception 'Unexpected routine start function shape'; end if;
 definition:=replace(definition,'(requested_set->>''reps'')::INTEGER','(requested_set->>''reps'')::BIGINT');
 definition:=replace(definition,'    INSERT INTO public.workout_sets (','    PERFORM fitness_private.require_measurements(requested_set,''weight_kg'',''reps'');'||E'\n    INSERT INTO public.workout_sets (');
 execute definition;
 select pg_get_functiondef('public.save_workout_as_routine(uuid,jsonb,jsonb)'::regprocedure) into definition;
 if position('(requested_exercise->>''target_reps'')::INTEGER' in definition)=0 then raise exception 'Unexpected save routine function shape'; end if;
 definition:=replace(definition,'(requested_exercise->>''target_reps'')::INTEGER','(requested_exercise->>''target_reps'')::BIGINT');
 definition:=replace(definition,'    INSERT INTO public.routine_exercises (','    PERFORM fitness_private.require_measurements(requested_exercise,''target_weight_kg'',''target_reps'');'||E'\n    INSERT INTO public.routine_exercises (');
 execute definition;
 select pg_get_functiondef('public.complete_workout_atomically(uuid,uuid,timestamptz,jsonb)'::regprocedure) into definition;
 if position(')::INTEGER' in definition)=0 then raise exception 'Unexpected completion duration cast'; end if;
 definition:=replace(definition,')::INTEGER',')::BIGINT');
 definition:=replace(definition,'  UPDATE public.workouts',E'  IF NOT EXISTS (SELECT 1 FROM public.workout_exercises e JOIN public.workout_sets s ON s.workout_exercise_id=e.id WHERE e.workout_id=current_workout.id AND s.is_completed) THEN\n    RETURN jsonb_build_object(''type'',''invalid'',''field'',''sets'',''message'',''Complete at least one set before finishing'');\n  END IF;\n  UPDATE public.workouts');
 execute definition;
end $patch$;

grant execute on function public.start_workout_from_routine(uuid,jsonb,jsonb),
  public.complete_workout_atomically(uuid,uuid,timestamptz,jsonb) to service_role;

-- Only the existing trusted MCP server can bridge its verified principal into
-- these two user-checked commands. No arbitrary function or SQL execution.
create function public.mcp_workout_command(p_user_id uuid,p_operation text,p_request jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare old_claims text:=current_setting('request.jwt.claims',true); old_subject text:=current_setting('request.jwt.claim.sub',true);
  result jsonb; entry jsonb; reference uuid; routine uuid;
begin
 if current_user<>'service_role' then raise insufficient_privilege using message='Trusted workout adapter required'; end if;
 if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then return jsonb_build_object('type','not-found'); end if;
 if p_request->>'p_user_id' is distinct from p_user_id::text then raise insufficient_privilege using message='Workout principal mismatch'; end if;
 if p_operation='start_workout_from_routine' then
   routine:=(p_request->'p_workout'->>'routine_id')::uuid;
   perform 1 from public.routines where id=routine and user_id=p_user_id for share;
   if not found then raise insufficient_privilege using message='Routine unavailable'; end if;
   for entry in select value from jsonb_array_elements(p_request->'p_exercises') loop
     reference:=(entry->'exercise'->>'exercise_id')::uuid;
     perform 1 from public.exercises where id=reference and (user_id is null or user_id=p_user_id) for share;
     if not found then raise insufficient_privilege using message='Exercise unavailable'; end if;
   end loop;
 elsif p_operation='complete_workout_atomically' then
   if not exists(select 1 from public.workouts where id=(p_request->>'p_workout_id')::uuid and user_id=p_user_id) then return jsonb_build_object('type','not-found'); end if;
   if exists(select 1 from public.workout_exercises e join public.exercises d on d.id=e.exercise_id
     where e.workout_id=(p_request->>'p_workout_id')::uuid and d.user_id is not null and d.user_id<>p_user_id) then
     raise insufficient_privilege using message='Exercise unavailable';
   end if;
 else raise invalid_parameter_value using message='Unsupported trusted workout operation'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_user_id::text,true);
 if p_operation='start_workout_from_routine' then
   result:=public.start_workout_from_routine(p_user_id,p_request->'p_workout',p_request->'p_exercises');
 else
   result:=public.complete_workout_atomically(p_user_id,(p_request->>'p_workout_id')::uuid,(p_request->>'p_completed_at')::timestamptz,p_request->'p_changes');
 end if;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(old_subject,''),true);
 return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(old_subject,''),true);
 raise;
end $$;
revoke all on function public.mcp_workout_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mcp_workout_command(uuid,text,jsonb) to service_role;
