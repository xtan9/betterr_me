-- Imported history uses the existing revisioned authority. Provenance is private
-- and survives reviewed deletion, so retry never resurrects an imported workout.
create table fitness_private.hevy_import_batches(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 batch_id uuid not null unique, document_hash text not null, receipt jsonb, undo_receipt jsonb,
 primary key(owner_id,fingerprint)
);
create table fitness_private.hevy_import_workouts(
 workout_id uuid primary key, owner_id uuid not null references public.profiles(id) on delete cascade,
 batch_id uuid not null references fitness_private.hevy_import_batches(batch_id) on delete cascade,
 source_identity jsonb not null, source_rows jsonb not null, workout_day date not null,
 entry_meta jsonb not null default '{}', unique(owner_id,source_identity)
);
create index hevy_import_start_lookup on fitness_private.hevy_import_workouts(owner_id,(source_identity->>1));
create index hevy_import_ending_lookup on fitness_private.hevy_import_workouts(owner_id,(source_identity->>0),(source_identity->>2));
create index hevy_import_batch_lookup on fitness_private.hevy_import_workouts(batch_id,owner_id);
alter table fitness_private.hevy_import_batches enable row level security;
alter table fitness_private.hevy_import_workouts enable row level security;
revoke all on fitness_private.hevy_import_batches,fitness_private.hevy_import_workouts from public,anon,authenticated,service_role;

create function fitness_private.is_hevy_workout(p_id uuid,p_owner uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from fitness_private.hevy_import_workouts where workout_id=p_id and owner_id=p_owner
   and (p_owner=auth.uid() or nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role'))
$$;
revoke all on function fitness_private.is_hevy_workout(uuid,uuid) from public,anon,authenticated,service_role;
-- CHECK expressions require function permission even for ordinary started rows.
-- This read-only predicate reveals membership only to its owner or service JWT.
grant execute on function fitness_private.is_hevy_workout(uuid,uuid) to authenticated,service_role;
alter table public.workouts drop constraint workouts_known_start_check;
alter table public.workouts add constraint workouts_known_start_check check(started_at is not null or
 (status='completed' and (recorded_completion->'version'='5'::jsonb and recorded_completion->'time'->>'kind'='date-only'
 or fitness_private.is_hevy_workout(id,user_id))) is true);

-- Preserve decimal RPE and exact mile conversion without changing old values.
alter table public.workout_sets alter column rpe type numeric using rpe::numeric;
alter table public.workout_sets alter column distance_meters type numeric using distance_meters::numeric;

-- Keep ordinary writes identical to their former column types, including
-- decimal scale and range. Only protected imported parents retain extra precision.
create function fitness_private.guard_legacy_set_precision() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.workout_exercises e join fitness_private.hevy_import_workouts h on h.workout_id=e.workout_id
   where e.id=new.workout_exercise_id) then
  new.distance_meters:=new.distance_meters::numeric(10,2);
  new.rpe:=new.rpe::smallint;
 end if;
 return new;
end $$;
revoke all on function fitness_private.guard_legacy_set_precision() from public,anon,authenticated,service_role;
-- This runs before guard_native_set / guard_performed_measurements, so their
-- checks see the same ordinary values they saw before this migration.
create trigger guard_legacy_set_precision before insert or update on public.workout_sets
 for each row execute function fitness_private.guard_legacy_set_precision();

create function fitness_private.hevy_number(value text,whole boolean default false,maximum numeric default 9007199254740991) returns numeric
language plpgsql immutable set search_path=pg_catalog as $$
declare result numeric;
begin
 if value='' then return null; end if;
 if length(value)>128 or value !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$' then raise invalid_parameter_value using message='Invalid Hevy measurement'; end if;
 result:=value::numeric;
 if result>maximum or whole and trunc(result)<>result then raise invalid_parameter_value using message='Invalid Hevy measurement'; end if;
 return result;
end $$;
create function fitness_private.hevy_day(value text) returns date language plpgsql immutable set search_path=pg_catalog as $$
declare parts text[];
begin
 parts:=regexp_match(value,'^([0-9]{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([0-9]{4}), ([01][0-9]|2[0-3]):([0-5][0-9])(:[0-5][0-9])?$');
 if parts is null then raise invalid_parameter_value using message='Invalid Hevy civil time'; end if;
 return make_date(parts[3]::integer,array_position(array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],parts[2]),parts[1]::integer);
end $$;
revoke all on function fitness_private.hevy_number(text,boolean,numeric),fitness_private.hevy_day(text) from public,anon,authenticated,service_role;

-- This omits provenance entirely for existing rows; their frozen JSON is unchanged.
create or replace function fitness_private.history_header(w public.workouts) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select (to_jsonb(w)-'updated_at')||jsonb_build_object('duration_seconds',w.duration_seconds::text)||coalesce((
 select jsonb_build_object('hevy_import',jsonb_build_object('provider','hevy','version',1,'batchId',h.batch_id,
 'workoutDay',coalesce((select c.projection->'workout'->'hevy_import'->>'workoutDay' from fitness_private.history_current c where c.workout_id=w.id and c.owner_id=w.user_id),h.workout_day::text),'startTime',h.source_rows->0->>1,'endTime',h.source_rows->0->>2,
 'sourceRows',h.source_rows,'entryMeta',h.entry_meta)) from fitness_private.hevy_import_workouts h
 where h.workout_id=w.id and h.owner_id=w.user_id),'{}'::jsonb)
$$;

create function fitness_private.import_hevy_workouts(p_action text,p_fingerprint text,p_workouts jsonb,p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
<<hevy_import>>
declare owner uuid:=auth.uid(); batch fitness_private.hevy_import_batches; prior fitness_private.hevy_import_workouts;
 rows jsonb; item jsonb; first_row jsonb; identity jsonb; workout uuid; exercise uuid; entry uuid; batch_id uuid;
 document_hash text; entry_index integer; item_index integer; set_index integer; previous_index integer; previous_name text; previous_notes text; previous_superset text;
 weight numeric; repetitions numeric; distance numeric; seconds numeric; exertion numeric; mode text; target_day date;
 new_count integer:=0; duplicate_count integer:=0; changed_count integer:=0; set_count integer:=0; removed integer:=0;
 ids jsonb:='[]'; accepted_sources jsonb:='[]'; accepted_rows jsonb; meta jsonb; result jsonb; current_record fitness_private.history_current;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if not (select ready from fitness_private.history_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 if p_action is null or p_action not in('preview','commit','undo') then return jsonb_build_object('status','invalid_request'); end if;
 -- Serializes only this account's imports; recording never uses this advisory lock.
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':hevy-import',0));
 if p_action='undo' then
  select * into batch from fitness_private.hevy_import_batches where owner_id=owner and hevy_import_batches.batch_id=p_batch_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if batch.undo_receipt is not null then return batch.undo_receipt; end if;
  for prior in select * from fitness_private.hevy_import_workouts where owner_id=owner and hevy_import_workouts.batch_id=p_batch_id order by workout_id loop
   perform 1 from public.workouts where id=prior.workout_id and user_id=owner for update;
   select * into current_record from fitness_private.history_current where workout_id=prior.workout_id and owner_id=owner for update;
   if found and current_record.state='deleted' then removed:=removed+1;
   elsif found and current_record.revision=1 then
    result:=fitness_private.execute_history_command(jsonb_build_object('protocolVersion',1,'ownerId',owner,'operationId',md5(p_batch_id::text||':undo:'||prior.workout_id::text)::uuid,
      'command',jsonb_build_object('kind','delete-workout','workoutId',prior.workout_id,'expectedRevision','1')));
    if not result?'receipt' then raise check_violation using message='Hevy undo was not acknowledged'; end if;
    removed:=removed+1;
   else changed_count:=changed_count+1; end if;
  end loop;
  result:=jsonb_build_object('protocolVersion',1,'ownerId',owner,'batchId',p_batch_id,'removedWorkouts',removed,'changedWorkouts',changed_count);
  update fitness_private.hevy_import_batches set undo_receipt=result where owner_id=owner and hevy_import_batches.batch_id=p_batch_id;
  return result;
 end if;
 if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_workouts) is distinct from 'array'
   or jsonb_array_length(p_workouts) not between 1 and 2000 or octet_length(p_workouts::text)>15000000 then return jsonb_build_object('status','invalid_request'); end if;
 select * into batch from fitness_private.hevy_import_batches where owner_id=owner and fingerprint=p_fingerprint;
 document_hash:=encode(sha256(convert_to(p_workouts::text,'UTF8')),'hex');
 if found and batch.document_hash<>document_hash then return jsonb_build_object('status','operation_conflict'); end if;
 if p_action='commit' and found and batch.receipt is not null then return batch.receipt; end if;
 batch_id:=md5(owner::text||':hevy-batch:'||p_fingerprint)::uuid;
 if p_action='commit' then insert into fitness_private.hevy_import_batches(owner_id,fingerprint,batch_id,document_hash) values(owner,p_fingerprint,batch_id,document_hash); end if;
 for rows in select value from jsonb_array_elements(p_workouts) loop
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)=0 then raise invalid_parameter_value using message='Invalid Hevy workout'; end if;
  first_row:=rows->0; identity:=jsonb_build_array(first_row->0,first_row->1,first_row->2);
  target_day:=fitness_private.hevy_day(first_row->>1); perform fitness_private.hevy_day(first_row->>2);
  for item in select value from jsonb_array_elements(rows) loop
   if jsonb_typeof(item) is distinct from 'array' or jsonb_array_length(item)<>14 or exists(select 1 from jsonb_array_elements(item) cell where jsonb_typeof(cell)<>'string')
    or nullif(btrim(item->>0),'') is null or nullif(btrim(item->>4),'') is null
    or jsonb_build_array(item->0,item->1,item->2)<>identity or item->3<>first_row->3
    or item->>8 not in('normal','warmup','failure','dropset') or item->>7='' then raise invalid_parameter_value using message='Invalid Hevy row'; end if;
   perform fitness_private.hevy_number(item->>7,true,2147483646);
   perform fitness_private.hevy_number(item->>9); perform fitness_private.hevy_number(item->>10,true);
   perform fitness_private.hevy_number(item->>11); perform fitness_private.hevy_number(item->>12,true);
   exertion:=fitness_private.hevy_number(item->>13,false,10);
   if exertion<1 then raise invalid_parameter_value using message='Invalid Hevy effort'; end if;
  end loop;
  set_count:=set_count+jsonb_array_length(rows);
  if set_count>25000 then raise invalid_parameter_value using message='Hevy import too large'; end if;
  select * into prior from fitness_private.hevy_import_workouts where owner_id=owner and source_identity=identity;
  if found then
   if prior.source_rows=rows then duplicate_count:=duplicate_count+1; else changed_count:=changed_count+1; end if;
   continue;
  end if;
  select candidate->'rows' into accepted_rows from jsonb_array_elements(accepted_sources) candidate where candidate->'identity'=identity;
  if found then
   if accepted_rows=rows then duplicate_count:=duplicate_count+1; else changed_count:=changed_count+1; end if;
   continue;
  end if;
  -- A rename or corrected ending retains its start; a corrected start may
  -- retain title+ending. These are possible changes, never automatic inserts.
  if exists(select 1 from fitness_private.hevy_import_workouts h where h.owner_id=owner and
    (h.source_identity->>1=identity->>1 or h.source_identity->>0=identity->>0 and h.source_identity->>2=identity->>2))
    or exists(select 1 from jsonb_array_elements(accepted_sources) candidate where
      candidate->'identity'->>1=identity->>1 or candidate->'identity'->>0=identity->>0 and candidate->'identity'->>2=identity->>2) then
   changed_count:=changed_count+1; continue;
  end if;
  new_count:=new_count+1;
  -- Preview and commit must classify later rows against the same accepted
  -- candidates, including earlier workouts in this file.
  accepted_sources:=accepted_sources||jsonb_build_array(jsonb_build_object('identity',identity,'rows',rows));
  if p_action='preview' then continue; end if;
  workout:=md5(owner::text||':hevy-workout:'||identity::text)::uuid;
  insert into fitness_private.hevy_import_workouts(workout_id,owner_id,batch_id,source_identity,source_rows,workout_day) values(workout,owner,batch_id,identity,rows,target_day);
  insert into public.workouts(id,user_id,title,status,started_at,completed_at,duration_seconds,notes,routine_id)
   values(workout,owner,first_row->>0,'completed',null,null,null,nullif(first_row->>3,''),null);
  ids:=ids||jsonb_build_array(workout); entry_index:=0; item_index:=0; previous_name:=null; previous_index:=null; meta:='{}';
  for item in select value from jsonb_array_elements(rows) loop
   set_index:=(item->>7)::integer; item_index:=item_index+1;
   weight:=fitness_private.hevy_number(item->>9)*0.45359237; repetitions:=fitness_private.hevy_number(item->>10,true);
   distance:=fitness_private.hevy_number(item->>11)*1609.344; seconds:=fitness_private.hevy_number(item->>12,true); exertion:=fitness_private.hevy_number(item->>13,false,10);
   if previous_name is distinct from item->>4 or previous_notes is distinct from item->>6 or previous_superset is distinct from item->>5 or set_index<=previous_index then
    entry_index:=entry_index+1; entry:=md5(workout::text||':entry:'||entry_index::text)::uuid;
    exercise:=md5(owner::text||':hevy-exercise:'||(item->>4))::uuid;
    -- This is a storage shape, with no assumed comparison convention. Imports
    -- never rename/merge the user's existing exercise identities.
    mode:=case when weight is not null then 'weight_reps' when repetitions is not null and repetitions>0 then 'bodyweight_reps' else 'duration' end;
    insert into public.exercises(id,user_id,name,muscle_group_primary,equipment,exercise_type,is_custom,measurement_convention,archived_at)
      values(exercise,owner,item->>4,'other','other',mode,true,null,clock_timestamp()) on conflict(id) do nothing;
    if not exists(select 1 from public.exercises where id=exercise and user_id=owner and name=item->>4 and is_custom and measurement_convention is null)
      then raise check_violation using message='Imported exercise identity conflict'; end if;
    insert into public.workout_exercises(id,workout_id,exercise_id,sort_order,notes,rest_timer_seconds) values(entry,workout,exercise,entry_index-1,nullif(item->>6,''),null);
    meta:=meta||jsonb_build_object(entry::text,jsonb_build_object('supersetId',item->>5));
   end if;
   insert into public.workout_sets(id,workout_exercise_id,set_number,set_type,weight_kg,reps,duration_seconds,distance_meters,rpe,is_completed)
     values(md5(workout::text||':set:'||item_index::text)::uuid,entry,set_index+1,case item->>8 when 'dropset' then 'drop' else item->>8 end,weight,repetitions::bigint,seconds::bigint,distance,exertion,true);
   previous_name:=item->>4; previous_notes:=item->>6; previous_superset:=item->>5; previous_index:=set_index;
  end loop;
  update fitness_private.hevy_import_workouts set entry_meta=meta where workout_id=workout;
  perform fitness_private.capture_history(workout); perform fitness_private.assert_history_projection(workout);
 end loop;
 if p_action='preview' then return jsonb_build_object('protocolVersion',1,'ownerId',owner,'fingerprint',p_fingerprint,'workouts',jsonb_array_length(p_workouts),'sets',set_count,
   'newWorkouts',new_count,'duplicateWorkouts',duplicate_count,'changedWorkouts',changed_count,
   'previousImport',case when batch.receipt is null then null else jsonb_build_object('receipt',batch.receipt,'undo',batch.undo_receipt) end); end if;
 result:=jsonb_build_object('protocolVersion',1,'ownerId',owner,'fingerprint',p_fingerprint,'batchId',batch_id,'importedWorkouts',new_count,
   'importedSets',(select coalesce(sum(jsonb_array_length(source_rows)),0) from fitness_private.hevy_import_workouts where hevy_import_workouts.batch_id=hevy_import.batch_id),
   'duplicateWorkouts',duplicate_count,'changedWorkouts',changed_count,'workoutIds',ids);
 update fitness_private.hevy_import_batches set receipt=result where owner_id=owner and fingerprint=p_fingerprint;
 return result;
exception when invalid_parameter_value or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range or check_violation then
 return jsonb_build_object('status','invalid_request');
end $$;
create function public.import_hevy_workouts(p_action text,p_fingerprint text default null,p_workouts jsonb default null,p_batch_id uuid default null) returns jsonb
language sql security definer set search_path=pg_catalog as $$ select fitness_private.import_hevy_workouts(p_action,p_fingerprint,p_workouts,p_batch_id) $$;
revoke all on function fitness_private.import_hevy_workouts(text,text,jsonb,uuid),public.import_hevy_workouts(text,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.import_hevy_workouts(text,text,jsonb,uuid) to authenticated;

-- Preserve the existing revision guards, including all pre-import snapshots.
create or replace function fitness_private.check_history_write(p_table text,p_operation text,p_old jsonb,p_new jsonb) returns void
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
   expected:=h.projection->'workout'; candidate:=fitness_private.history_header(jsonb_populate_record(null::public.workouts,p_new));
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
create or replace function fitness_private.history_record(p_id uuid,p_owner uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare h fitness_private.history_current; w jsonb; doc jsonb; day text; ordering timestamptz; value jsonb;
begin
 select * into h from fitness_private.history_current where workout_id=p_id and owner_id=p_owner;
 if not found then return null; end if;
 w:=h.projection->'workout'; doc:=coalesce(nullif(w->'native_completion','null'),nullif(w->'recorded_completion','null'));
 day:=case when fitness_private.valid_recorded_completion(doc) then fitness_private.history_day(doc) else w->'hevy_import'->>'workoutDay' end;
 ordering:=case when w->>'started_at' is not null and isfinite((w->>'started_at')::timestamptz) and extract(year from (w->>'started_at')::timestamptz) between 1 and 9999 then (w->>'started_at')::timestamptz else h.first_seen end;
 if doc is not null then value:=jsonb_build_object('kind',case when fitness_private.valid_recorded_completion(doc) then 'recorded' else 'unsupported' end,'document',doc);
 else value:=jsonb_build_object('kind','legacy','record',h.projection||jsonb_build_object('exercises',(
  select coalesce(jsonb_agg(e||jsonb_build_object('exercise',h.definitions->(e->>'id')) order by ordinal),'[]') from jsonb_array_elements(h.projection->'exercises') with ordinality as entries(e,ordinal)))); end if;
 return jsonb_build_object('id',h.workout_id,'ownerId',h.owner_id,'revision',h.revision::text,'state',h.state,'workoutDay',day,
 'order',jsonb_build_object('day',coalesce(day,to_char(ordering at time zone 'UTC','FMYYYY-MM-DD')),'instant',ordering,'id',h.workout_id),
 'current',case when h.state='deleted' then null else value end);
end $$;
create or replace function fitness_private.guard_performed_measurements() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare mode text; valid boolean;
begin
 if (select ready from fitness_private.history_rollout where singleton) and exists(select 1 from fitness_private.history_current h join public.workout_exercises e on e.workout_id=h.workout_id where e.id=new.workout_exercise_id) then return new; end if;
 if exists(select 1 from fitness_private.hevy_import_workouts h join public.workout_exercises e on e.workout_id=h.workout_id where e.id=new.workout_exercise_id) then return new; end if;
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

create function fitness_private.correct_history_projection_before_hevy(projection jsonb,definitions jsonb,patch jsonb) returns jsonb
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

create or replace function fitness_private.correct_history_projection(projection jsonb,definitions jsonb,patch jsonb) returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare result jsonb:=projection; header jsonb:=projection->'workout'; timing jsonb:=patch->'time'; duration jsonb; day text;
begin
 if header->'hevy_import'->>'provider' is distinct from 'hevy' or timing->>'kind' is distinct from 'date-only' then
  return fitness_private.correct_history_projection_before_hevy(projection,definitions,patch);
 end if;
 if jsonb_typeof(patch) is distinct from 'object' or patch-array['sets','time']<>'{}'::jsonb
   or jsonb_typeof(timing) is distinct from 'object' or timing-array['kind','workoutDay','duration']<>'{}'::jsonb then
  raise invalid_parameter_value using message='Invalid imported timing correction';
 end if;
 if patch?'sets' then result:=fitness_private.correct_history_projection_before_hevy(projection,definitions,patch-'time'); header:=result->'workout'; end if;
 if timing?'workoutDay' then
  day:=timing->>'workoutDay';
  if jsonb_typeof(timing->'workoutDay') is distinct from 'string' or day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(day::date,'YYYY-MM-DD')<>day then
   raise invalid_parameter_value using message='Invalid imported workout day'; end if;
  header:=jsonb_set(header,'{hevy_import,workoutDay}',to_jsonb(day));
 end if;
 if timing?'duration' then
  duration:=timing->'duration';
  if jsonb_typeof(duration) is distinct from 'object' or duration->>'kind' not in('keep','unknown','set') then raise invalid_parameter_value using message='Invalid imported duration'; end if;
  if duration->>'kind'='set' then
   if duration-array['kind','seconds']<>'{}'::jsonb or jsonb_typeof(duration->'seconds') is distinct from 'number'
     or fitness_private.hevy_number(duration->>'seconds',true) is null then raise invalid_parameter_value using message='Invalid imported duration'; end if;
   header:=jsonb_set(header,'{duration_seconds}',to_jsonb((duration->>'seconds')::numeric::bigint::text));
  else
   if duration-array['kind']<>'{}'::jsonb then raise invalid_parameter_value using message='Invalid imported duration'; end if;
   if duration->>'kind'='unknown' then header:=jsonb_set(header,'{duration_seconds}','null'); end if;
  end if;
 end if;
 result:=jsonb_set(result,'{workout}',header);
 if result=projection then raise invalid_parameter_value using message='Correction changes no facts'; end if;
 return result;
end $$;
revoke all on function fitness_private.correct_history_projection_before_hevy(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Only protected source receipts may create archived, unknown-meaning definitions.
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
       or (tg_op='INSERT' and new.measurement_convention is distinct from fitness_private.custom_exercise_convention(new.equipment,new.exercise_type)
        and not (new.measurement_convention is null and new.archived_at is not null
          and new.id=md5(new.user_id::text||':hevy-exercise:'||new.name)::uuid
          and exists(select 1 from fitness_private.hevy_import_workouts h cross join lateral jsonb_array_elements(h.source_rows) r
            where h.owner_id=new.user_id and r->>4=new.name))) then
       raise check_violation using message='Custom exercise recording convention is invalid';
     end if;
   elsif new.measurement_convention is not null then
     raise check_violation using message='Preset recording convention is captured separately';
   end if;
 end if;
 if tg_op='INSERT' then new.version:=1; else new.version:=old.version+1; end if;
 return new;
end $$;
