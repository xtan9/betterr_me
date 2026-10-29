-- Recover clock-time intervals without assigning a timezone or fabricating instants.
-- The original rows, first import receipts and revision-1 captures stay immutable.
create or replace function fitness_private.hevy_elapsed_seconds(p_start text,p_end text)
returns bigint language plpgsql immutable strict set search_path=pg_catalog as $$
declare started timestamp without time zone; ended timestamp without time zone;
begin
 started:=fitness_private.hevy_day(p_start)::timestamp + split_part(p_start,', ',2)::time;
 ended:=fitness_private.hevy_day(p_end)::timestamp + split_part(p_end,', ',2)::time;
 if ended<started then return null; end if;
 return extract(epoch from ended-started)::bigint;
exception when invalid_parameter_value or invalid_datetime_format or datetime_field_overflow then
 return null;
end $$;
revoke all on function fitness_private.hevy_elapsed_seconds(text,text) from public,anon,authenticated,service_role;

-- A maintenance-only revision must not make a previously untouched import
-- ineligible for Undo. Any subsequent user correction advances past this marker.
alter table fitness_private.hevy_import_workouts add column if not exists duration_backfill_revision bigint;

create or replace function fitness_private.import_hevy_workouts(p_action text,p_fingerprint text,p_workouts jsonb,p_batch_id uuid) returns jsonb
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
   elsif found and (current_record.revision=1 or current_record.revision=prior.duration_backfill_revision) then
    result:=fitness_private.execute_history_command(jsonb_build_object('protocolVersion',1,'ownerId',owner,'operationId',md5(p_batch_id::text||':undo:'||prior.workout_id::text)::uuid,
      'command',jsonb_build_object('kind','delete-workout','workoutId',prior.workout_id,'expectedRevision',current_record.revision::text)));
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
   values(workout,owner,first_row->>0,'completed',null,null,fitness_private.hevy_elapsed_seconds(first_row->>1,first_row->>2),nullif(first_row->>3,''),null);
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

-- Use the same revisioned command as a reviewed correction: this refreshes cached
-- clients and preserves prior captures. Recheck eligibility under parent-first locks.
do $$
declare item record; current_record fitness_private.history_current; result jsonb; seconds bigint;
 claims text:=current_setting('request.jwt.claims',true); subject text:=current_setting('request.jwt.claim.sub',true);
begin
 for item in select h.workout_id,h.owner_id,h.source_rows from fitness_private.hevy_import_workouts h
   join fitness_private.history_current c on c.workout_id=h.workout_id and c.owner_id=h.owner_id
   where c.state='alive' and c.revision=1 order by h.workout_id loop
  perform 1 from public.workouts where id=item.workout_id and user_id=item.owner_id for update;
  if not found then continue; end if;
  select * into current_record from fitness_private.history_current where workout_id=item.workout_id and owner_id=item.owner_id for update;
  if not found then continue; end if;
  if current_record.state<>'alive' or current_record.revision<>1
    or current_record.projection->'workout'->>'duration_seconds' is not null
    or current_record.projection->'workout'->>'native_completion' is not null
    or current_record.projection->'workout'->>'recorded_completion' is not null then continue; end if;
  seconds:=fitness_private.hevy_elapsed_seconds(item.source_rows->0->>1,item.source_rows->0->>2);
  if seconds is null then continue; end if;
  perform set_config('request.jwt.claim.sub',item.owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',item.owner_id,'role','authenticated')::text,true);
  result:=fitness_private.execute_history_command(jsonb_build_object('protocolVersion',1,'ownerId',item.owner_id,
    'operationId',md5('hevy-duration-backfill-v1:'||item.workout_id::text)::uuid,
    'command',jsonb_build_object('kind','correct-workout','workoutId',item.workout_id,'expectedRevision','1',
      'patch',jsonb_build_object('time',jsonb_build_object('kind','date-only','duration',jsonb_build_object('kind','set','seconds',seconds))))));
  if result->'receipt'->>'revision' is distinct from '2' then raise exception 'Hevy duration recovery was not acknowledged'; end if;
  update fitness_private.hevy_import_workouts set duration_backfill_revision=2 where workout_id=item.workout_id and owner_id=item.owner_id;
  perform fitness_private.assert_history_projection(item.workout_id);
 end loop;
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(subject,''),true);
end $$;
