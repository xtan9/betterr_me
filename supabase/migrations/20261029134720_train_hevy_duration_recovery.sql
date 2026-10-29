-- Separate from schema expansion so its table lock is released before
-- acquiring workout row locks in the established parent-first order.
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
