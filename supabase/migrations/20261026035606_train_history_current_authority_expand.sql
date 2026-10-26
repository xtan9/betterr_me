-- A: compatible infrastructure. C activates one current completed authority only after B.
create table fitness_private.history_rollout(singleton boolean primary key default true check(singleton),ready boolean not null default false);
insert into fitness_private.history_rollout values(true,false);
create table fitness_private.history_current(
 workout_id uuid primary key, owner_id uuid not null references public.profiles(id) on delete cascade,
 revision bigint not null check(revision>0), state text not null check(state in('alive','deleted')),
 projection jsonb not null, definitions jsonb not null, first_seen timestamptz not null default clock_timestamp()
);
create table fitness_private.history_revisions(
 workout_id uuid not null,owner_id uuid not null references public.profiles(id) on delete cascade,
 revision bigint not null, state text not null,projection jsonb not null,definitions jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(),primary key(workout_id,revision)
);
create table fitness_private.history_outcomes(
 owner_id uuid not null references public.profiles(id) on delete cascade,operation_id uuid not null,
 request jsonb not null,outcome jsonb not null,primary key(owner_id,operation_id)
);
alter table fitness_private.history_rollout enable row level security;
alter table fitness_private.history_current enable row level security;
alter table fitness_private.history_revisions enable row level security;
alter table fitness_private.history_outcomes enable row level security;
revoke all on fitness_private.history_rollout,fitness_private.history_current,fitness_private.history_revisions,fitness_private.history_outcomes from public,anon,authenticated,service_role;

create function fitness_private.history_header(w public.workouts) returns jsonb language sql immutable set search_path=pg_catalog as $$
 select (to_jsonb(w)-'updated_at')||jsonb_build_object('duration_seconds',w.duration_seconds::text)
$$;
create function fitness_private.history_set(s public.workout_sets) returns jsonb language sql immutable set search_path=pg_catalog as $$
 select (to_jsonb(s)-'updated_at')||jsonb_build_object('weight_kg',s.weight_kg::text,'reps',s.reps::text,'duration_seconds',s.duration_seconds::text,'distance_meters',s.distance_meters::text,'rpe',s.rpe::text)
$$;
create function fitness_private.history_entry(e public.workout_exercises) returns jsonb language sql immutable set search_path=pg_catalog as $$
 select to_jsonb(e)||jsonb_build_object('sort_order',e.sort_order::text,'rest_timer_seconds',e.rest_timer_seconds::text)
$$;
create function fitness_private.history_projection(p_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('workout',fitness_private.history_header(w),'exercises',coalesce((
 select jsonb_agg(fitness_private.history_entry(e)||jsonb_build_object('sets',coalesce((select jsonb_agg(fitness_private.history_set(s) order by s.set_number,s.id)
 from public.workout_sets s where s.workout_exercise_id=e.id),'[]'::jsonb)) order by e.sort_order,e.id)
 from public.workout_exercises e where e.workout_id=w.id),'[]'::jsonb)) from public.workouts w where w.id=p_id
$$;
create function fitness_private.capture_history(p_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare w public.workouts; value jsonb; defs jsonb;
begin
 select * into w from public.workouts where id=p_id and status='completed' for update;
 if not found or exists(select 1 from fitness_private.history_current where workout_id=p_id) then return; end if;
 value:=fitness_private.history_projection(p_id);
 select coalesce(jsonb_object_agg(e.id::text,case when d.user_id is null and not d.is_custom or d.user_id=w.user_id and d.is_custom then to_jsonb(d)||case when (select ready from fitness_private.history_rollout where singleton) and d.exercise_type in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration') then jsonb_build_object('history_recorded_definition',case when d.catalog_key is not null then jsonb_build_object('catalogKey',d.catalog_key,'name',jsonb_build_object('en',d.name,'zh',d.name),'equipment',d.equipment,'mode',d.exercise_type,'convention',fitness_private.custom_exercise_convention(d.equipment,d.exercise_type)) when d.is_custom then jsonb_build_object('reference',jsonb_build_object('kind','custom','exerciseId',d.id,'ownerId',d.user_id),'name',d.name,'equipment',d.equipment,'mode',d.exercise_type,'convention',d.measurement_convention) else null end) else '{}'::jsonb end else null end),'{}') into defs from public.workout_exercises e join public.exercises d on d.id=e.exercise_id where e.workout_id=p_id;
 insert into fitness_private.history_current(workout_id,owner_id,revision,state,projection,definitions) values(p_id,w.user_id,1,'alive',value,defs);
 insert into fitness_private.history_revisions(workout_id,owner_id,revision,state,projection,definitions) values(p_id,w.user_id,1,'alive',value,defs);
end $$;
create function fitness_private.history_day(doc jsonb) returns text language sql immutable set search_path=pg_catalog as $$
 select case when doc->'version'='5'::jsonb then doc->'time'->>'workoutDay' else doc->>'workoutDay' end
$$;
create function fitness_private.history_record(p_id uuid,p_owner uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare h fitness_private.history_current; w jsonb; doc jsonb; day text; ordering timestamptz; value jsonb;
begin
 select * into h from fitness_private.history_current where workout_id=p_id and owner_id=p_owner;
 if not found then return null; end if;
 w:=h.projection->'workout'; doc:=coalesce(nullif(w->'native_completion','null'),nullif(w->'recorded_completion','null'));
 day:=case when fitness_private.valid_recorded_completion(doc) then fitness_private.history_day(doc) end;
 ordering:=case when w->>'started_at' is not null and isfinite((w->>'started_at')::timestamptz) and extract(year from (w->>'started_at')::timestamptz) between 1 and 9999 then (w->>'started_at')::timestamptz else h.first_seen end;
 if doc is not null then value:=jsonb_build_object('kind',case when fitness_private.valid_recorded_completion(doc) then 'recorded' else 'unsupported' end,'document',doc);
 else value:=jsonb_build_object('kind','legacy','record',h.projection||jsonb_build_object('exercises',(
  select coalesce(jsonb_agg(e||jsonb_build_object('exercise',h.definitions->(e->>'id')) order by ordinal),'[]') from jsonb_array_elements(h.projection->'exercises') with ordinality as entries(e,ordinal)))); end if;
 return jsonb_build_object('id',h.workout_id,'ownerId',h.owner_id,'revision',h.revision::text,'state',h.state,'workoutDay',day,
 'order',jsonb_build_object('day',coalesce(day,to_char(ordering at time zone 'UTC','FMYYYY-MM-DD')),'instant',ordering,'id',h.workout_id),
 'current',case when h.state='deleted' then null else value end);
end $$;

alter function fitness_private.valid_recorded_completion(jsonb) rename to valid_recorded_completion_before_history;
create function fitness_private.valid_recorded_completion(doc jsonb) returns boolean language plpgsql stable set search_path=pg_catalog,public as $$
declare entry jsonb; item jsonb; performed jsonb; ids text[]:='{}'; timing jsonb:=doc->'time'; started timestamptz; ended timestamptz; day date;
 pattern constant text:='^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$';
begin
 if doc->'version' is distinct from '5'::jsonb then return fitness_private.valid_recorded_completion_before_history(doc); end if;
 if not coalesce(fitness_private.exact_keys(doc,array['version','id','ownerId','sourceId','origin','time','planId','exercises']||case when doc?'templateOrigin' then array['templateOrigin'] else '{}'::text[] end),false)
 or not fitness_private.template_uuid(doc->'id') or not fitness_private.template_uuid(doc->'ownerId') or not fitness_private.template_uuid(doc->'sourceId')
 or jsonb_typeof(doc->'exercises') is distinct from 'array' or jsonb_array_length(doc->'exercises')=0 then return false; end if;
 if timing->>'kind'='date-only' then
  if doc->>'origin' is distinct from 'retrospective' or doc->'planId' is distinct from 'null'::jsonb or doc?'templateOrigin'
   or not coalesce(fitness_private.exact_keys(timing,array['kind','workoutDay','durationSeconds']),false) then return false; end if;
 elsif timing->>'kind'='known-instants' then
  if doc->>'origin' is distinct from 'live' or jsonb_typeof(doc->'planId') not in('null','string')
   or not coalesce(fitness_private.exact_keys(timing,array['kind','startedAt','completedAt','timezone','workoutDay','durationSeconds']),false)
   or jsonb_typeof(timing->'startedAt') is distinct from 'string' or jsonb_typeof(timing->'timezone') is distinct from 'string' or timing->>'startedAt' !~ pattern or not exists(select 1 from pg_timezone_names where lower(name)=lower(timing->>'timezone') and name !~ '^(posix|right)/' and name not in('Factory','localtime','posixrules')) then return false; end if;
  started:=(timing->>'startedAt')::timestamptz;
  if not isfinite(started) or extract(year from started at time zone 'UTC') not between 1 and 9999 or to_char(started at time zone (timing->>'timezone'),'FMYYYY-MM-DD') is distinct from timing->>'workoutDay' then return false; end if;
  if timing->'completedAt'<>'null'::jsonb then
   if jsonb_typeof(timing->'completedAt') is distinct from 'string' or timing->>'completedAt' !~ pattern then return false; end if; ended:=(timing->>'completedAt')::timestamptz;
   if ended<started or not isfinite(ended) or extract(year from ended at time zone 'UTC') not between 1 and 9999 then return false; end if;
  end if;
 else return false; end if;
 if jsonb_typeof(timing->'workoutDay') is distinct from 'string' or timing->>'workoutDay' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
 day:=(timing->>'workoutDay')::date; if to_char(day,'FMYYYY-MM-DD')<>timing->>'workoutDay' then return false; end if;
 if timing->'durationSeconds' is distinct from 'null'::jsonb and not fitness_private.valid_measure(timing->'durationSeconds',true,0) then return false; end if;
 if doc?'templateOrigin' and (not fitness_private.valid_template_origin(doc->'templateOrigin',doc->>'ownerId') or not fitness_private.valid_template_completed_bindings(doc)) then return false; end if;
 for entry in select value from jsonb_array_elements(doc->'exercises') loop
  if not coalesce(fitness_private.exact_keys(entry,array['id','definition','sets']),false) or not fitness_private.template_uuid(entry->'id') or entry->>'id'=any(ids)
   or not fitness_private.valid_recorded_definition(entry->'definition',doc->>'ownerId',4) or jsonb_typeof(entry->'sets') is distinct from 'array' or jsonb_array_length(entry->'sets')=0 then return false; end if;
  ids:=array_append(ids,entry->>'id');
  for item in select value from jsonb_array_elements(entry->'sets') loop
   if not coalesce(fitness_private.exact_keys(item,array['id','performed']),false) or not fitness_private.template_uuid(item->'id') or item->>'id'=any(ids) then return false; end if;
   ids:=array_append(ids,item->>'id'); performed:=item->'performed';
   if performed->>'mode' is distinct from entry->'definition'->>'mode' or coalesce(performed->>'kind','') not in('working','warmup') then return false; end if;
   if not coalesce(case performed->>'mode'
    when 'weight_reps' then fitness_private.exact_keys(performed,array['mode','weightKg','reps','kind']) and fitness_private.valid_measure(performed->'weightKg',false,0) and fitness_private.valid_measure(performed->'reps',true,1)
    when 'weighted_bodyweight' then fitness_private.exact_keys(performed,array['mode','addedWeightKg','reps','kind']) and fitness_private.valid_measure(performed->'addedWeightKg',false,0) and fitness_private.valid_measure(performed->'reps',true,1)
    when 'assisted_bodyweight' then fitness_private.exact_keys(performed,array['mode','assistanceKg','reps','kind']) and fitness_private.valid_measure(performed->'assistanceKg',false,0) and fitness_private.valid_measure(performed->'reps',true,1)
    when 'bodyweight_reps' then fitness_private.exact_keys(performed,array['mode','reps','kind']) and fitness_private.valid_measure(performed->'reps',true,1)
    when 'duration' then fitness_private.exact_keys(performed,array['mode','durationSeconds','kind']) and fitness_private.valid_measure(performed->'durationSeconds',true,1) and (performed->>'durationSeconds')::numeric<=86400
    else false end,false) then return false; end if;
  end loop;
 end loop;
 return true;
exception when invalid_text_representation or invalid_parameter_value or datetime_field_overflow or numeric_value_out_of_range then return false;
end $$;

create or replace function fitness_private.upload_completed_workout(p_operation_id uuid,p_completion jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); previous public.train_completion_receipts; entry jsonb; item jsonb;
  entry_index integer:=0; set_index integer; accepted jsonb; reference_id uuid; template_id uuid; origin_entry jsonb; capture jsonb;
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
 if p_completion->'version'='5'::jsonb and not (select ready from fitness_private.history_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 if p_completion->'version'='5'::jsonb and p_completion->>'origin' is distinct from 'retrospective' then return jsonb_build_object('status','invalid_completion'); end if;
 if not fitness_private.valid_recorded_completion(p_completion) then return jsonb_build_object('status','invalid_completion'); end if;
 if exists(select 1 from public.workouts where id=p_operation_id) or exists(select 1 from fitness_private.history_current where workout_id=p_operation_id) then return jsonb_build_object('status','identity_conflict'); end if;
 if p_completion->'version'='4'::jsonb then
  template_id:=(p_completion->'templateOrigin'->'content'->>'id')::uuid;
  perform 1 from public.routines where id=template_id and user_id=owner for share;
  if not found then return jsonb_build_object('status','reference_unavailable'); end if;
  for origin_entry in select value from jsonb_array_elements(p_completion->'templateOrigin'->'content'->'entries') loop
   select value->'definition' into capture from jsonb_array_elements(p_completion->'templateOrigin'->'definitions') where value->>'entryId'=origin_entry->>'id';
   reference_id:=fitness_private.completed_exercise_reference(capture,owner);
   if reference_id is null or reference_id::text<>origin_entry->>'exerciseId' then return jsonb_build_object('status','reference_unavailable'); end if;
  end loop;
 end if;
 for entry in select value from jsonb_array_elements(p_completion->'exercises') loop
   reference_id:=fitness_private.completed_exercise_reference(entry->'definition',owner);
   if reference_id is null then return jsonb_build_object('status','reference_unavailable'); end if;
 end loop;
 insert into public.workouts(id,user_id,title,status,started_at,completed_at,duration_seconds,notes,routine_id,native_completion,recorded_completion)
 values(p_operation_id,owner,'Workout','completed',(case when p_completion->'version'='5'::jsonb then p_completion->'time'->>'startedAt' else p_completion->>'startedAt' end)::timestamptz,(case when p_completion->'version'='5'::jsonb then p_completion->'time'->>'completedAt' else p_completion->>'completedAt' end)::timestamptz,
   (case when p_completion->'version'='5'::jsonb then p_completion->'time'->>'durationSeconds' else p_completion->>'durationSeconds' end)::bigint,null,template_id,
   case when p_completion->'version'='1'::jsonb then p_completion end,
   case when p_completion->'version' in ('2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb) then p_completion end);
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
 if (select ready from fitness_private.history_rollout where singleton) then perform fitness_private.capture_history(p_operation_id); end if;
 return jsonb_build_object('status','accepted','receipt',accepted);
exception when unique_violation then return jsonb_build_object('status','identity_conflict');
end $$;

alter table public.workouts drop constraint workouts_recorded_authority_check;
alter table public.workouts add constraint workouts_recorded_authority_check check (
 (native_completion is null or recorded_completion is null) and (native_completion is null and recorded_completion is null or status='completed')
 and (native_completion is null or jsonb_typeof(native_completion)='object' and native_completion->'version' is not distinct from '1'::jsonb)
 and (recorded_completion is null or jsonb_typeof(recorded_completion)='object' and recorded_completion->'version' in('2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb))
);
create function fitness_private.assert_history_projection(p_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare h fitness_private.history_current; actual jsonb;
begin
 select * into h from fitness_private.history_current where workout_id=p_id;
 if not found then return; end if;
 actual:=fitness_private.history_projection(p_id);
 if h.state='deleted' and actual is not null or h.state='alive' and actual is distinct from h.projection then
  raise check_violation using message='Completed history requires a revisioned command';
 end if;
end $$;
create function fitness_private.check_history_write(p_table text,p_operation text,p_old jsonb,p_new jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ids uuid[]:='{}'; identity uuid; h fitness_private.history_current; expected jsonb; candidate jsonb; parent uuid; owner uuid;
begin
 if p_table='workouts' then
  if p_operation='INSERT' or p_operation='UPDATE' and p_new->>'id' is distinct from p_old->>'id' then
   if exists(select 1 from fitness_private.history_current where workout_id=(p_new->>'id')::uuid)
     or exists(select 1 from public.train_completion_receipts where operation_id=(p_new->>'id')::uuid) then
    raise check_violation using message='History identity cannot be recreated';
   end if;
   if p_operation='INSERT' then return; end if;
  end if;
  ids:=array[(p_old->>'id')::uuid];
 else
  if p_table='workout_exercises' then
   if p_operation<>'INSERT' then ids:=array_append(ids,(p_old->>'workout_id')::uuid); end if;
   if p_operation<>'DELETE' then ids:=array_append(ids,(p_new->>'workout_id')::uuid); end if;
  else
   if p_operation<>'INSERT' then select workout_id into parent from public.workout_exercises where id=(p_old->>'workout_exercise_id')::uuid; ids:=array_append(ids,parent); end if;
   if p_operation<>'DELETE' then select workout_id into parent from public.workout_exercises where id=(p_new->>'workout_exercise_id')::uuid; ids:=array_append(ids,parent); end if;
  end if;
 end if;
 for identity in select distinct unnest(ids) loop
  if identity is null then continue; end if;
  -- Same parent-first order as the active invoker functions and correction RPC.
  perform 1 from public.workouts where id=identity for update;
  select * into h from fitness_private.history_current where workout_id=identity for update;
  if not found then continue; end if;
  owner:=h.owner_id;
  -- Only an actual FK cascade after the profile row is gone erases account data.
  if p_operation='DELETE' and pg_trigger_depth()>1 and not exists(select 1 from public.profiles where id=owner) then continue; end if;
  if h.state='deleted' then
   if p_operation='DELETE' then continue; end if;
   raise check_violation using message='Deleted history cannot be changed';
  end if;
  if p_operation='DELETE' then raise check_violation using message='Completed deletion requires its reviewed revision'; end if;
  if p_table='workouts' then
   expected:=h.projection->'workout'; candidate:=(p_new-'updated_at')||jsonb_build_object('duration_seconds',p_new->>'duration_seconds');
  elsif p_table='workout_exercises' then
   select value-'sets' into expected from jsonb_array_elements(h.projection->'exercises') where value->>'id'=p_new->>'id';
   candidate:=p_new||jsonb_build_object('sort_order',p_new->>'sort_order','rest_timer_seconds',p_new->>'rest_timer_seconds');
  else
   select item into expected from jsonb_array_elements(h.projection->'exercises') entry cross join lateral jsonb_array_elements(entry->'sets') item where item->>'id'=p_new->>'id';
   candidate:=(p_new-'updated_at')||jsonb_build_object('weight_kg',p_new->>'weight_kg','reps',p_new->>'reps','duration_seconds',p_new->>'duration_seconds','distance_meters',p_new->>'distance_meters','rpe',p_new->>'rpe');
  end if;
  if expected is null or candidate is distinct from expected then raise check_violation using message='Completed history requires a revisioned command'; end if;
 end loop;
end $$;
create or replace function fitness_private.guard_native_workout() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ids uuid[];
begin
 if (select ready from fitness_private.history_rollout where singleton) then
  perform fitness_private.check_history_write(tg_table_name,tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
  return case when tg_op='DELETE' then old else new end;
 end if;
 if tg_table_name='workouts' then
   if tg_op='DELETE' then return old; end if;
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
create trigger guard_history_delete before delete on public.workouts for each row execute function fitness_private.guard_native_workout();
create or replace function fitness_private.verify_completed_workout() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved public.workouts; expected jsonb; actual jsonb; document jsonb;
begin
 if (select ready from fitness_private.history_rollout where singleton) and exists(select 1 from fitness_private.history_current where workout_id=new.id) then
  perform fitness_private.assert_history_projection(new.id); return new;
 end if;
 if tg_op='UPDATE' and old.status='completed' then return new; end if;
 select * into saved from public.workouts where id=new.id;
 if not found or saved.status<>'completed' then return new; end if;
 if not exists(select 1 from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id where e.workout_id=saved.id and s.is_completed) then
   raise check_violation using message='A new completion requires a performed set';
 end if;
 document:=coalesce(saved.native_completion,saved.recorded_completion);
 if document is null then
  if (select ready from fitness_private.history_rollout where singleton) then perform fitness_private.capture_history(saved.id); end if;
  return new; end if;
 if not fitness_private.valid_recorded_completion(document)
   or document->>'id' is distinct from saved.id::text or document->>'ownerId' is distinct from saved.user_id::text
   or saved.started_at is distinct from (case when document->'version'='5'::jsonb then document->'time'->>'startedAt' else document->>'startedAt' end)::timestamptz
   or saved.completed_at is distinct from (case when document->'version'='5'::jsonb then document->'time'->>'completedAt' else document->>'completedAt' end)::timestamptz
   or saved.duration_seconds is distinct from (case when document->'version'='5'::jsonb then document->'time'->>'durationSeconds' else document->>'durationSeconds' end)::bigint
   or saved.title<>'Workout' or saved.notes is not null or saved.routine_id is distinct from (case when document->'version'='4'::jsonb then (document->'templateOrigin'->'content'->>'id')::uuid else null end)
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
 if (select ready from fitness_private.history_rollout where singleton) then perform fitness_private.capture_history(saved.id); end if;
 return new;
end $$;
create or replace function fitness_private.guard_performed_measurements() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare mode text; valid boolean;
begin
 if (select ready from fitness_private.history_rollout where singleton) and exists(select 1 from fitness_private.history_current h join public.workout_exercises e on e.workout_id=h.workout_id where e.id=new.workout_exercise_id) then return new; end if;
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

create function public.train_history_capabilities() returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('protocolVersion',1,'historyReady',coalesce(auth.uid() is not null and (select ready from fitness_private.history_rollout where singleton),false))
$$;
create function public.read_train_history_record(p_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('status','unauthenticated'); end if;
 if not (select ready from fitness_private.history_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 result:=fitness_private.history_record(p_id,auth.uid());
 if result is null then return jsonb_build_object('status','not_found'); end if;
 return jsonb_build_object('protocolVersion',1,'record',result);
end $$;
create function fitness_private.activate_history_contract() returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare item record;
begin
 if (select ready from fitness_private.history_rollout where singleton) then return; end if;
 lock table public.workouts,public.workout_exercises,public.workout_sets in share row exclusive mode;
 for item in select id from public.workouts where status='completed' order by id loop perform fitness_private.capture_history(item.id); end loop;
 alter table public.workouts alter column started_at drop not null;
 alter table public.workouts add constraint workouts_known_start_check check(started_at is not null or (status='completed' and recorded_completion->'version'='5'::jsonb and recorded_completion->'time'->>'kind'='date-only') is true);
 create policy history_legacy_representable on public.workouts as restrictive for select to authenticated using(started_at is not null);
 revoke truncate,references,trigger on public.workouts,public.workout_exercises,public.workout_sets from anon,authenticated;
 revoke truncate,trigger on public.workouts,public.workout_exercises,public.workout_sets from service_role;
 update fitness_private.history_rollout set ready=true where singleton;
end $$;
-- Internal functions/tables never grant caller-controlled projection authority.
revoke all on function fitness_private.history_header(public.workouts) from public,anon,authenticated,service_role;
revoke all on function fitness_private.history_set(public.workout_sets) from public,anon,authenticated,service_role;
revoke all on function fitness_private.history_entry(public.workout_exercises) from public,anon,authenticated,service_role;
revoke all on function fitness_private.history_projection(uuid) from public,anon,authenticated,service_role;
revoke all on function fitness_private.capture_history(uuid) from public,anon,authenticated,service_role;
revoke all on function fitness_private.history_day(jsonb) from public,anon,authenticated,service_role;
revoke all on function fitness_private.history_record(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function fitness_private.assert_history_projection(uuid) from public,anon,authenticated,service_role;
revoke all on function fitness_private.check_history_write(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function fitness_private.valid_recorded_completion(jsonb) from public,anon,authenticated,service_role;
revoke all on function fitness_private.activate_history_contract() from public,anon,authenticated,service_role;
revoke all on function public.train_history_capabilities(),public.read_train_history_record(uuid) from public,anon,service_role;
grant execute on function public.train_history_capabilities(),public.read_train_history_record(uuid) to authenticated;

create function fitness_private.history_instant(value jsonb) returns boolean language plpgsql stable set search_path=pg_catalog as $$
declare stamp timestamptz; day date;
begin
 if jsonb_typeof(value) is distinct from 'string' or value#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' then return false; end if;
 day:=left(value#>>'{}',10)::date; stamp:=(value#>>'{}')::timestamptz;
 return to_char(day,'FMYYYY-MM-DD')=left(value#>>'{}',10) and extract(year from day)>0 and isfinite(stamp) and extract(year from stamp at time zone 'UTC') between 1 and 9999;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;

-- Pure patch construction: no writes, inferred facts, identifier substitution or catalog rebuild.
create function fitness_private.correct_history_projection(projection jsonb,definitions jsonb,patch jsonb) returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare result jsonb:=projection; header jsonb:=projection->'workout'; document jsonb:=coalesce(nullif(header->'native_completion','null'),nullif(header->'recorded_completion','null'));
 change jsonb; changes jsonb; entry jsonb; item jsonb; mode text; field text; column_name text; performed_field text; ei integer; si integer; di integer; ds integer;
 timing jsonb; old_timing jsonb; duration jsonb; started timestamptz; ended timestamptz; seconds numeric; zone text; day text; seen text[]:='{}'; version integer;
begin
 if jsonb_typeof(patch)<>'object' or patch='{}' or (patch-array['sets','time'])<>'{}' then raise invalid_parameter_value using message='Invalid correction'; end if;
 if patch?'sets' then
  if jsonb_typeof(patch->'sets')<>'array' or jsonb_array_length(patch->'sets')=0 then raise invalid_parameter_value using message='Invalid correction'; end if;
  for change in select value from jsonb_array_elements(patch->'sets') loop
   if not coalesce(fitness_private.exact_keys(change,array['entryId','setId','changes']),false) or not fitness_private.template_uuid(change->'entryId') or not fitness_private.template_uuid(change->'setId') or change->>'setId'=any(seen) then raise invalid_parameter_value using message='Invalid correction'; end if;
   seen:=array_append(seen,change->>'setId'); changes:=change->'changes';
   if jsonb_typeof(changes)<>'object' or changes='{}' or (changes-array['weightKg','reps','durationSeconds','kind'])<>'{}' then raise invalid_parameter_value using message='Invalid correction'; end if;
   select value,ordinal::integer-1 into entry,ei from jsonb_array_elements(result->'exercises') with ordinality as e(value,ordinal) where value->>'id'=change->>'entryId';
   select value,ordinal::integer-1 into item,si from jsonb_array_elements(entry->'sets') with ordinality as s(value,ordinal) where value->>'id'=change->>'setId';
   if item is null or item->'is_completed' is distinct from 'true'::jsonb then raise invalid_parameter_value using message='Invalid correction'; end if;
   if document is not null then
    select ordinal::integer-1 into di from jsonb_array_elements(document->'exercises') with ordinality as e(value,ordinal) where value->>'id'=change->>'entryId';
    select ordinal::integer-1 into ds from jsonb_array_elements(document->'exercises'->di->'sets') with ordinality as s(value,ordinal) where value->>'id'=change->>'setId';
    mode:=document->'exercises'->di->'definition'->>'mode';
    if di is null or ds is null then raise invalid_parameter_value using message='Invalid correction'; end if;
   else mode:=definitions->(change->>'entryId')->>'exercise_type'; end if;
   if mode not in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration') or mode is null then raise invalid_parameter_value using message='Unsupported measurement correction'; end if;
   for field in select jsonb_object_keys(changes) loop
    if field='kind' then
     if jsonb_typeof(changes->field)<>'string' or changes->>field not in('working','warmup') then raise invalid_parameter_value using message='Invalid correction'; end if;
     item:=jsonb_set(item,'{set_type}',to_jsonb(case changes->>field when 'working' then 'normal' else 'warmup' end)); performed_field:='kind';
    else
     if field='weightKg' and mode not in('weight_reps','weighted_bodyweight','assisted_bodyweight') or field='reps' and mode='duration' or field='durationSeconds' and mode<>'duration' then raise invalid_parameter_value using message='Invalid correction'; end if;
     if not fitness_private.valid_measure(changes->field,field<>'weightKg',case field when 'weightKg' then 0 else 1 end) or field='durationSeconds' and (changes->>field)::numeric>86400 then raise invalid_parameter_value using message='Invalid correction'; end if;
     column_name:=case field when 'weightKg' then 'weight_kg' when 'reps' then 'reps' else 'duration_seconds' end;
     performed_field:=case when field='weightKg' and mode='weighted_bodyweight' then 'addedWeightKg' when field='weightKg' and mode='assisted_bodyweight' then 'assistanceKg' else field end;
     item:=jsonb_set(item,array[column_name],to_jsonb((changes->>field)::numeric::text));
    end if;
    if document is not null then document:=jsonb_set(document,array['exercises',di::text,'sets',ds::text,'performed',performed_field],changes->field); end if;
   end loop;
   result:=jsonb_set(result,array['exercises',ei::text,'sets',si::text],item);
  end loop;
 end if;
 if patch?'time' then
  timing:=patch->'time'; version:=(document->>'version')::integer;
  old_timing:=case when version=5 then document->'time' else document end;
  if timing->>'kind'='date-only' then
   if version is distinct from 5 or old_timing->>'kind' is distinct from 'date-only' or (timing-array['kind','workoutDay','duration'])<>'{}' then raise invalid_parameter_value using message='Invalid time correction'; end if;
   if timing?'workoutDay' then
    day:=timing->>'workoutDay';
    if jsonb_typeof(timing->'workoutDay')<>'string' or day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(day::date,'FMYYYY-MM-DD')<>day or extract(year from day::date)<1 then raise invalid_parameter_value using message='Invalid time correction'; end if;
    old_timing:=jsonb_set(old_timing,'{workoutDay}',timing->'workoutDay');
   end if;
  elsif timing->>'kind'='known-instants' then
   if header->>'started_at' is null or (timing-array['kind','startedAt','completedAt','duration'])<>'{}' or not timing?'duration' then raise invalid_parameter_value using message='Invalid time correction'; end if;
   if timing?'startedAt' then
    if not fitness_private.history_instant(timing->'startedAt') then raise invalid_parameter_value using message='Invalid time correction'; end if;
    header:=jsonb_set(header,'{started_at}',to_jsonb((timing->>'startedAt')::timestamptz));
    if document is not null then
     old_timing:=jsonb_set(old_timing,'{startedAt}',timing->'startedAt'); zone:=old_timing->>'timezone';
     old_timing:=jsonb_set(old_timing,'{workoutDay}',to_jsonb(to_char((timing->>'startedAt')::timestamptz at time zone zone,'FMYYYY-MM-DD')));
    end if;
   end if;
   if timing?'completedAt' then
    if timing->'completedAt'<>'null'::jsonb and not fitness_private.history_instant(timing->'completedAt') then raise invalid_parameter_value using message='Invalid time correction'; end if;
    header:=jsonb_set(header,'{completed_at}',coalesce(to_jsonb((timing->>'completedAt')::timestamptz),'null'));
    if document is not null then old_timing:=jsonb_set(old_timing,'{completedAt}',timing->'completedAt'); end if;
   end if;
   started:=(header->>'started_at')::timestamptz; ended:=(header->>'completed_at')::timestamptz;
   if (timing?'startedAt' or timing?'completedAt') and ended is not null and (not isfinite(started) or not isfinite(ended) or ended<started) then raise invalid_parameter_value using message='Invalid time correction'; end if;
  else raise invalid_parameter_value using message='Invalid time correction'; end if;
  if timing?'duration' then
   duration:=timing->'duration';
   if duration->>'kind'='keep' and fitness_private.exact_keys(duration,array['kind']) then null;
   elsif duration->>'kind'='unknown' and fitness_private.exact_keys(duration,array['kind']) then
    header:=jsonb_set(header,'{duration_seconds}','null'); if document is not null then old_timing:=jsonb_set(old_timing,'{durationSeconds}','null'); end if;
   elsif duration->>'kind'='set' and fitness_private.exact_keys(duration,array['kind','seconds']) and fitness_private.valid_measure(duration->'seconds',true,0) then
    header:=jsonb_set(header,'{duration_seconds}',to_jsonb((duration->>'seconds')::numeric::text)); if document is not null then old_timing:=jsonb_set(old_timing,'{durationSeconds}',duration->'seconds'); end if;
   elsif timing->>'kind'='known-instants' and duration->>'kind'='elapsed' and fitness_private.exact_keys(duration,array['kind','expectedSeconds']) and fitness_private.valid_measure(duration->'expectedSeconds',true,0) then
    if started is null or ended is null or not isfinite(started) or not isfinite(ended) then raise invalid_parameter_value using message='Invalid elapsed correction'; end if;
    seconds:=floor(extract(epoch from ended-started));
    if seconds<>(duration->>'expectedSeconds')::numeric then raise invalid_parameter_value using message='Elapsed correction changed'; end if;
    header:=jsonb_set(header,'{duration_seconds}',to_jsonb(seconds::text)); if document is not null then old_timing:=jsonb_set(old_timing,'{durationSeconds}',to_jsonb(seconds)); end if;
   else raise invalid_parameter_value using message='Invalid duration correction'; end if;
  end if;
  if document is not null then
   if version=5 then document:=jsonb_set(document,'{time}',old_timing);
   elsif old_timing->'completedAt'='null'::jsonb or old_timing->'durationSeconds'='null'::jsonb then
    document:=(document-array['startedAt','completedAt','durationSeconds','timezone','workoutDay'])||jsonb_build_object('version',5,'origin','live','time',jsonb_build_object('kind','known-instants','startedAt',old_timing->'startedAt','completedAt',old_timing->'completedAt','durationSeconds',old_timing->'durationSeconds','timezone',old_timing->'timezone','workoutDay',old_timing->'workoutDay'));
    if version=1 then
     for di in 0..jsonb_array_length(document->'exercises')-1 loop
      for ds in 0..jsonb_array_length(document->'exercises'->di->'sets')-1 loop
       document:=jsonb_set(document,array['exercises',di::text,'sets',ds::text,'performed'],document->'exercises'->di->'sets'->ds->'performed'||jsonb_build_object('mode','weight_reps'));
      end loop;
     end loop;
    end if;
   else
    document:=document||jsonb_build_object('startedAt',old_timing->'startedAt','completedAt',old_timing->'completedAt','durationSeconds',old_timing->'durationSeconds','workoutDay',old_timing->'workoutDay');
   end if;
  end if;
 end if;
 if document is not null then
  if not fitness_private.valid_recorded_completion(document) then raise invalid_parameter_value using message='Invalid recorded correction'; end if;
  header:=header||jsonb_build_object('native_completion',case when document->'version'='1'::jsonb then document end,'recorded_completion',case when document->'version'<>'1'::jsonb then document end);
 end if;
 result:=jsonb_set(result,'{workout}',header);
 if result=projection then raise invalid_parameter_value using message='Correction changes no facts'; end if;
 return result;
end $$;

create function fitness_private.execute_history_command(request jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); operation uuid; target uuid; command jsonb:=request->'command'; h fitness_private.history_current; prior fitness_private.history_outcomes;
 result jsonb; code text; new_projection jsonb; item jsonb; header jsonb; next_revision bigint;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if request->>'ownerId' is distinct from owner::text then return jsonb_build_object('status','owner_mismatch'); end if;
 if not coalesce(fitness_private.exact_keys(request,array['protocolVersion','ownerId','operationId','command']),false) or request->'protocolVersion' is distinct from '1'::jsonb
 or not fitness_private.template_uuid(request->'operationId') or not fitness_private.template_uuid(command->'workoutId')
 or command->>'kind' not in('correct-workout','delete-workout') or command->>'kind' is null
 or not coalesce(fitness_private.exact_keys(command,array['kind','workoutId','expectedRevision']||case when command->>'kind'='correct-workout' then array['patch'] else '{}'::text[] end),false)
 or jsonb_typeof(command->'expectedRevision') is distinct from 'string' or command->>'expectedRevision' !~ '^[1-9][0-9]{0,18}$' or (command->>'expectedRevision')::numeric>9223372036854775807 then return jsonb_build_object('status','invalid_request'); end if;
 operation:=(request->>'operationId')::uuid; target:=(command->>'workoutId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':train:history:'||operation,0));
 select * into prior from fitness_private.history_outcomes where owner_id=owner and operation_id=operation;
 if found then
  if prior.request is distinct from request then return jsonb_build_object('status','operation_conflict'); end if;
  return prior.outcome;
 end if;
 if not (select ready from fitness_private.history_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 perform 1 from public.workouts where id=target and user_id=owner for update;
 select * into h from fitness_private.history_current where workout_id=target and owner_id=owner for update;
 if not found then code:='not_found';
 elsif h.revision::text<>command->>'expectedRevision' then code:='version_conflict';
 elsif h.state='deleted' then code:='deleted';
 elsif h.revision=9223372036854775807 then code:='invalid_correction';
 else
  begin
   new_projection:=case command->>'kind' when 'correct-workout' then fitness_private.correct_history_projection(h.projection,h.definitions,command->'patch') else h.projection end;
  exception when invalid_parameter_value or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then code:='invalid_correction'; end;
 end if;
 if code is not null then
  result:=jsonb_build_object('protocolVersion',1,'error',jsonb_build_object('code',code),'rejection',jsonb_build_object('operation',command->>'kind','operationId',operation,'ownerId',owner,'workoutId',target,'rejectedAt',clock_timestamp(),'code',code)||case when code in('version_conflict','deleted') then jsonb_build_object('current',fitness_private.history_record(target,owner)) else '{}'::jsonb end);
 else
  next_revision:=h.revision+1;
  update fitness_private.history_current set revision=next_revision,projection=new_projection,state=case command->>'kind' when 'delete-workout' then 'deleted' else 'alive' end where workout_id=target;
  insert into fitness_private.history_revisions(workout_id,owner_id,revision,state,projection,definitions) select workout_id,owner_id,history_current.revision,state,projection,definitions from fitness_private.history_current where workout_id=target;
  if command->>'kind'='delete-workout' then delete from public.workouts where id=target and user_id=owner;
  else
   header:=new_projection->'workout';
   for item in select s from jsonb_array_elements(new_projection->'exercises') e cross join lateral jsonb_array_elements(e->'sets') s loop
    if item is distinct from (select s from jsonb_array_elements(h.projection->'exercises') e cross join lateral jsonb_array_elements(e->'sets') s where s->>'id'=item->>'id') then
     update public.workout_sets set weight_kg=(item->>'weight_kg')::numeric,reps=(item->>'reps')::bigint,duration_seconds=(item->>'duration_seconds')::bigint,set_type=item->>'set_type' where id=(item->>'id')::uuid;
    end if;
   end loop;
   update public.workouts set started_at=(header->>'started_at')::timestamptz,completed_at=(header->>'completed_at')::timestamptz,duration_seconds=(header->>'duration_seconds')::bigint,native_completion=nullif(header->'native_completion','null'),recorded_completion=nullif(header->'recorded_completion','null') where id=target;
  end if;
  perform fitness_private.assert_history_projection(target);
  result:=jsonb_build_object('protocolVersion',1,'receipt',jsonb_build_object('operation',command->>'kind','operationId',operation,'ownerId',owner,'workoutId',target,'revision',next_revision::text,'acceptedAt',clock_timestamp(),'current',fitness_private.history_record(target,owner)));
 end if;
 insert into fitness_private.history_outcomes(owner_id,operation_id,request,outcome) values(owner,operation,request,result);
 return result;
end $$;
create function public.execute_train_history_command(p_request jsonb) returns jsonb language sql security definer set search_path=pg_catalog as $$ select fitness_private.execute_history_command(p_request) $$;
revoke all on function fitness_private.history_instant(jsonb),fitness_private.correct_history_projection(jsonb,jsonb,jsonb),fitness_private.execute_history_command(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.execute_train_history_command(jsonb) from public,anon,service_role;
grant execute on function public.execute_train_history_command(jsonb) to authenticated;

create function public.list_train_history(p_before jsonb default null) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); records jsonb; cursor jsonb; before_day text; before_instant timestamptz; before_id uuid;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if not (select ready from fitness_private.history_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 if p_before is not null and p_before<>'null'::jsonb then
  if not coalesce(fitness_private.exact_keys(p_before,array['day','instant','id']),false) or not fitness_private.template_uuid(p_before->'id') or not fitness_private.history_instant(p_before->'instant')
  or jsonb_typeof(p_before->'day') is distinct from 'string' or p_before->>'day' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char((p_before->>'day')::date,'FMYYYY-MM-DD')<>p_before->>'day' then return jsonb_build_object('status','invalid_request'); end if;
  before_day:=p_before->>'day'; before_instant:=(p_before->>'instant')::timestamptz; before_id:=(p_before->>'id')::uuid;
 end if;
 with candidates as materialized(select fitness_private.history_record(workout_id,owner) as value from fitness_private.history_current where owner_id=owner and state='alive'),
 page as materialized(select value from candidates where before_id is null or row(value->'order'->>'day',(value->'order'->>'instant')::timestamptz,(value->>'id')::uuid)<row(before_day,before_instant,before_id)
 order by value->'order'->>'day' desc,(value->'order'->>'instant')::timestamptz desc,(value->>'id')::uuid desc limit 21), numbered as(select value,row_number()over(order by value->'order'->>'day' desc,(value->'order'->>'instant')::timestamptz desc,(value->>'id')::uuid desc) as ordinal from page)
 select coalesce(jsonb_agg(value order by ordinal) filter(where ordinal<=20),'[]'),case when count(*)>20 then (jsonb_agg(value order by ordinal)->19)->'order' end into records,cursor from numbered;
 return jsonb_build_object('protocolVersion',1,'ownerId',owner,'records',records,'nextCursor',cursor);
exception when invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('status','invalid_request');
end $$;
create function public.train_history_progress(p_scope jsonb,p_retained_ids jsonb) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); from_day text; through_day text; records jsonb; resolved jsonb; coverage jsonb;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if not (select ready from fitness_private.history_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 if not coalesce(fitness_private.exact_keys(p_scope,array['from','through']),false) or jsonb_typeof(p_retained_ids) is distinct from 'array' then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from jsonb_array_elements(p_retained_ids) where not fitness_private.template_uuid(value)) or jsonb_array_length(p_retained_ids)<>(select count(distinct value) from jsonb_array_elements(p_retained_ids)) then return jsonb_build_object('status','invalid_request'); end if;
 if p_scope->'from'='null'::jsonb and p_scope->'through'='null'::jsonb then null;
 else
  from_day:=p_scope->>'from'; through_day:=p_scope->>'through';
  if jsonb_typeof(p_scope->'from') is distinct from 'string' or jsonb_typeof(p_scope->'through') is distinct from 'string' or from_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or through_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or to_char(from_day::date,'FMYYYY-MM-DD')<>from_day or to_char(through_day::date,'FMYYYY-MM-DD')<>through_day or from_day>through_day then return jsonb_build_object('status','invalid_request'); end if;
 end if;
 with current_records as materialized(select fitness_private.history_record(workout_id,owner) as value,projection->'workout'->>'duration_seconds' as duration_text from fitness_private.history_current where owner_id=owner and state='alive'),
 all_records as materialized(select value,case when value->'current'->>'kind' in('recorded','legacy') and duration_text ~ '^[0-9]+$' then duration_text::numeric end as duration from current_records),
 cohort as materialized(select * from all_records where from_day is null or value->>'workoutDay' between from_day and through_day)
 select (select coalesce(jsonb_agg(value order by value->'order'->>'day' desc,(value->'order'->>'instant')::timestamptz desc,value->>'id' desc),'[]') from cohort),
 jsonb_build_object('complete',true,'workoutCount',count(*),'knownDurationCount',count(duration),'unknownDurationCount',count(*)-count(duration),'knownDurationSeconds',coalesce(sum(duration),0)::text,'undatedWorkoutCount',(select count(*) from all_records where value->>'workoutDay' is null)) into records,coverage from cohort;
 select coalesce(jsonb_agg(jsonb_build_object('id',value#>>'{}','record',fitness_private.history_record((value#>>'{}')::uuid,owner)) order by ordinal),'[]') into resolved from jsonb_array_elements(p_retained_ids) with ordinality as requested(value,ordinal);
 return jsonb_build_object('protocolVersion',1,'ownerId',owner,'scope',p_scope,'records',records,'resolved',resolved,'coverage',coverage);
exception when invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('status','invalid_request');
end $$;
revoke all on function public.list_train_history(jsonb),public.train_history_progress(jsonb,jsonb) from public,anon,service_role;
grant execute on function public.list_train_history(jsonb),public.train_history_progress(jsonb,jsonb) to authenticated;
-- The continuing cookie/MCP adapters read the same current projection. No
-- reference reconstruction after a definition rename and no public-null-start leak.
create function public.read_train_history_compat(p_id uuid default null,p_limit integer default 20,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); rows jsonb;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if not (select ready from fitness_private.history_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 if p_limit is not null and p_limit<1 or p_offset<0 then return jsonb_build_object('status','invalid_request'); end if;
 with selected as materialized(select h.*,fitness_private.history_record(workout_id,owner) as current_record from fitness_private.history_current h where owner_id=owner and state='alive' and (p_id is null or workout_id=p_id)),
 page as(select * from selected order by current_record->'order'->>'day' desc,(current_record->'order'->>'instant')::timestamptz desc,workout_id desc limit p_limit offset p_offset)
 select coalesce(jsonb_agg(projection->'workout'||jsonb_build_object('historyRevision',revision::text,'currentHistory',current_record,'workoutDay',current_record->'workoutDay','workout_exercises',(
  select coalesce(jsonb_agg(e||jsonb_build_object('exercise',definitions->(e->>'id')) order by ordinal),'[]') from jsonb_array_elements(projection->'exercises') with ordinality as entries(e,ordinal)),
  'train_workout_plan_links',(select jsonb_build_object('owner_id',l.owner_id,'workout_id',l.workout_id,'captured_occurrence_id',l.captured_occurrence_id,'linked_at',l.linked_at) from public.train_workout_plan_links l where l.workout_id=page.workout_id and l.owner_id=owner)) order by current_record->'order'->>'day' desc,(current_record->'order'->>'instant')::timestamptz desc,workout_id desc),'[]') into rows from page;
 return jsonb_build_object('status','available','workouts',rows);
end $$;
revoke all on function public.read_train_history_compat(uuid,integer,integer) from public,anon,service_role;
grant execute on function public.read_train_history_compat(uuid,integer,integer) to authenticated;

-- Fixed trusted-principal operations only; the authenticated checks remain in
-- every underlying entrypoint and all request claims are restored on failure.
create function public.mcp_train_history(p_owner uuid,p_operation text,p_request jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare old_claims text:=current_setting('request.jwt.claims',true);old_subject text:=current_setting('request.jwt.claim.sub',true);result jsonb;
begin
 if current_user<>'service_role' or p_owner is null then raise insufficient_privilege using message='Trusted history adapter required'; end if;
 if p_operation not in('compat','list','detail','progress','command') then raise invalid_parameter_value using message='Unsupported history operation'; end if;
 if p_operation='command' and p_request->>'ownerId' is distinct from p_owner::text then raise insufficient_privilege using message='History owner mismatch'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_owner,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',p_owner::text,true);
 case p_operation
 when 'compat' then result:=public.read_train_history_compat((p_request->>'id')::uuid,(p_request->>'limit')::integer,coalesce((p_request->>'offset')::integer,0));
 when 'list' then result:=public.list_train_history(p_request->'before');
 when 'detail' then result:=public.read_train_history_record((p_request->>'id')::uuid);
 when 'progress' then result:=public.train_history_progress(p_request->'scope',p_request->'retainedIds');
 when 'command' then result:=public.execute_train_history_command(p_request);
 end case;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_subject,''),true);return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_subject,''),true);raise;
end $$;
revoke all on function public.mcp_train_history(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mcp_train_history(uuid,text,jsonb) to service_role;
grant execute on function public.read_train_history_compat(uuid,integer,integer),public.list_train_history(jsonb),public.read_train_history_record(uuid),public.train_history_progress(jsonb,jsonb),public.execute_train_history_command(jsonb) to service_role;
