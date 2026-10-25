-- Phase A: old cookie CRUD remains usable until the new server is deployed.
-- The separate contract migration is the only operation that enables creation
-- and v3 recording and removes ordinary direct writes.
alter table public.exercises
  add column version bigint not null default 1 check (version>0),
  add column archived_at timestamptz,
  add column measurement_convention text;

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

 perform pg_advisory_xact_lock(hashtextextended(owner::text||':train:exercise:'||command_id::text,0));
 select * into previous from public.train_exercise_command_outcomes o where o.owner_id=owner and o.operation_id=command_id;
 if found then
   if previous.request is distinct from p_request then return jsonb_build_object('status','operation_conflict'); end if;
   return case when previous.receipt is not null then jsonb_build_object('status','accepted','receipt',previous.receipt)
     else jsonb_build_object('status',previous.rejection->>'code','rejection',previous.rejection) end;
 end if;
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
