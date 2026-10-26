-- A is compatible with the deployed aggregate readers/writers. The private
-- cutover is invoked only by the later reviewed C migration after B is live.
alter table public.routines add column version bigint not null default 1 check(version>0), add column archived_at timestamptz;
create table fitness_private.template_rollout(singleton boolean primary key default true check(singleton),ready boolean not null default false);
insert into fitness_private.template_rollout values(true,false);
alter table fitness_private.template_rollout enable row level security;
revoke all on fitness_private.template_rollout from public,anon,authenticated,service_role;

create table fitness_private.template_entries(
 entry_id uuid primary key references public.routine_exercises(id) on delete cascade,
 position bigint not null,
 targets_resolved boolean not null,
 legacy_source jsonb
);
create table fitness_private.template_targets(
 id uuid primary key,
 entry_id uuid not null references fitness_private.template_entries(entry_id) on delete cascade,
 position bigint not null,
 kind text not null check(kind in('working','warmup')),
 weight_kg numeric, reps bigint, duration_seconds integer, distance_meters numeric
);
create index template_target_entry on fitness_private.template_targets(entry_id,position,id);
alter table fitness_private.template_entries enable row level security;
alter table fitness_private.template_targets enable row level security;
revoke all on fitness_private.template_entries,fitness_private.template_targets from public,anon,authenticated,service_role;

create table public.train_template_command_outcomes(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 operation_id uuid not null,
 request jsonb not null,
 receipt jsonb,rejection jsonb,
 primary key(owner_id,operation_id),check((receipt is null)<>(rejection is null))
);
alter table public.train_template_command_outcomes enable row level security;
revoke all on public.train_template_command_outcomes from public,anon,authenticated,service_role;
grant select on public.train_template_command_outcomes to authenticated;
create policy template_outcome_owner on public.train_template_command_outcomes for select to authenticated using((select auth.uid())=owner_id);

create function fitness_private.version_template() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='INSERT' then new.version:=1;
 else new.version:=old.version+1; end if;
 return new;
end $$;
revoke all on function fitness_private.version_template() from public,anon,authenticated,service_role;
create trigger version_template before insert or update of id,user_id,name,notes,archived_at,version on public.routines for each row execute function fitness_private.version_template();

create function fitness_private.version_template_child() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare parents uuid[]:='{}'; entry_ids uuid[]:='{}'; parent uuid;
begin
 -- Private initial materialization adds representation, not a content edit.
 -- Legacy public writers still advance versions throughout expansion A.
 if tg_table_schema='fitness_private' and not (select ready from fitness_private.template_rollout where singleton) then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_table_name='routine_exercises' then
  if tg_op<>'INSERT' then parents:=array_append(parents,old.routine_id); end if;
  if tg_op<>'DELETE' then parents:=array_append(parents,new.routine_id); end if;
 else
  if tg_op<>'INSERT' then entry_ids:=array_append(entry_ids,old.entry_id); end if;
  if tg_op<>'DELETE' then entry_ids:=array_append(entry_ids,new.entry_id); end if;
  select array_agg(distinct routine_id) into parents from public.routine_exercises where id=any(entry_ids);
 end if;
 for parent in select distinct x from unnest(parents) x order by x loop
  update public.routines set version=version where id=parent;
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function fitness_private.version_template_child() from public,anon,authenticated,service_role;
create trigger version_template_child after insert or update or delete on public.routine_exercises for each row execute function fitness_private.version_template_child();
create trigger version_template_entry after insert or update or delete on fitness_private.template_entries for each row execute function fitness_private.version_template_child();
create trigger version_template_target after insert or update or delete on fitness_private.template_targets for each row execute function fitness_private.version_template_child();

create function fitness_private.template_capabilities() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise insufficient_privilege using message='Authentication required'; end if;
 return jsonb_build_object('protocolVersion',1,'templates',jsonb_build_object('contractVersion',1,'ready',(select ready from fitness_private.template_rollout where singleton)));
end $$;
revoke all on function fitness_private.template_capabilities() from public,anon,service_role;
grant execute on function fitness_private.template_capabilities() to authenticated;
create function public.train_template_capabilities() returns jsonb language sql stable security invoker set search_path=pg_catalog as $$select fitness_private.template_capabilities()$$;
revoke all on function public.train_template_capabilities() from public,anon,service_role;
grant execute on function public.train_template_capabilities() to authenticated;

create function fitness_private.template_dto(p_id uuid) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',r.id,'ownerId',r.user_id,'version',r.version::text,'name',r.name,'notes',r.notes,'archivedAt',r.archived_at,'entries',coalesce((
  select jsonb_agg(jsonb_build_object('id',e.id,'exerciseId',e.exercise_id,'notes',e.notes,'restSeconds',e.rest_timer_seconds,'legacySource',s.legacy_source,
   'targets',case when s.targets_resolved then jsonb_build_object('kind','sets','items',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'kind',t.kind,
    'measurements',jsonb_build_object('weightKg',t.weight_kg::text,'reps',t.reps::text,'durationSeconds',t.duration_seconds::text,'distanceMeters',t.distance_meters::text)) order by t.position,t.id)
    from fitness_private.template_targets t where t.entry_id=e.id),'[]')) else '{"kind":"legacy-unresolved"}'::jsonb end) order by s.position,e.id)
   from public.routine_exercises e join fitness_private.template_entries s on s.entry_id=e.id where e.routine_id=r.id),'[]'))
 from public.routines r where r.id=p_id
$$;
revoke all on function fitness_private.template_dto(uuid) from public,anon,authenticated,service_role;

create function fitness_private.template_definition(p_id uuid,p_owner uuid) returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare e public.exercises;
begin
 select * into e from public.exercises where id=p_id and (user_id is null and not is_custom or user_id=p_owner and is_custom and catalog_key is null);
 if not found then return jsonb_build_object('kind','unavailable','exerciseId',p_id); end if;
 if e.is_custom then return jsonb_build_object('kind','custom','definition',fitness_private.custom_exercise_dto(e)); end if;
 if e.catalog_key is not null then return jsonb_build_object('kind','keyed-preset','exerciseId',e.id,'version',e.version::text,'definition',jsonb_build_object(
  'catalogKey',e.catalog_key,'name',jsonb_build_object('en',e.name,'zh',e.name),'equipment',e.equipment,'mode',e.exercise_type,'convention',fitness_private.custom_exercise_convention(e.equipment,e.exercise_type))); end if;
 return jsonb_build_object('kind','unkeyed-preset','exerciseId',e.id,'version',e.version::text,'name',e.name,'equipment',e.equipment,'mode',e.exercise_type,'convention',null);
end $$;
revoke all on function fitness_private.template_definition(uuid,uuid) from public,anon,authenticated,service_role;

create function fitness_private.template_text_length(value text) returns bigint
language sql immutable set search_path=pg_catalog as $$
 select coalesce(sum(case when ascii(character)>65535 then 2 else 1 end),0) from regexp_split_to_table(value,'') character where character<>''
$$;
revoke all on function fitness_private.template_text_length(text) from public,anon,authenticated,service_role;

create function fitness_private.template_value_reason(value text,field text) returns text
language plpgsql immutable set search_path=pg_catalog as $$
declare number numeric; rendered text;
begin
 if value is null then return null; end if;
 if value !~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$' then return 'target_value_unrepresentable'; end if;
 number:=value::numeric;
 rendered:=(number::double precision)::text;
 if rendered in ('Infinity','-Infinity','NaN') or rendered::numeric<>number
   or (field<>'weightKg' and (trunc(number)<>number or abs(number)>9007199254740991)) then return 'target_value_unrepresentable'; end if;
 if number<0 or field='durationSeconds' and number>86400 then return 'target_value_out_of_range'; end if;
 return null;
exception when numeric_value_out_of_range or invalid_text_representation then return 'target_value_unrepresentable';
end $$;
revoke all on function fitness_private.template_value_reason(text,text) from public,anon,authenticated,service_role;

create function fitness_private.template_startability(content jsonb,definitions jsonb) returns jsonb
language plpgsql stable set search_path=pg_catalog as $$
declare reasons jsonb:='[]'; entry jsonb; definition jsonb; target jsonb; mode text; field text; code text;
 trim_characters constant text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
 if btrim(content->>'name',trim_characters)='' or fitness_private.template_text_length(content->>'name')>100 then reasons:=reasons||jsonb_build_object('code','template_metadata_invalid','field','name'); end if;
 if fitness_private.template_text_length(content->>'notes')>2000 or exists(select 1 from jsonb_array_elements(content->'entries') e where fitness_private.template_text_length(e->>'notes')>2000) then reasons:=reasons||jsonb_build_object('code','template_metadata_invalid','field','notes'); end if;
 for entry in select value from jsonb_array_elements(content->'entries') loop
  select d into definition from jsonb_array_elements(definitions) d where coalesce(d->>'exerciseId',d->'definition'->>'id')=entry->>'exerciseId';
  mode:=case when definition->>'kind' in('custom','keyed-preset') then definition->'definition'->>'mode' else definition->>'mode' end;
  if entry->'targets'->>'kind'='legacy-unresolved' then reasons:=reasons||jsonb_build_object('code','legacy_count_unresolved','entryId',entry->>'id'); end if;
  if definition is null or definition->>'kind'='unavailable' then reasons:=reasons||jsonb_build_object('code','definition_unavailable','entryId',entry->>'id');
  elsif mode not in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration') then reasons:=reasons||jsonb_build_object('code','mode_unsupported','entryId',entry->>'id'); end if;
  if entry->'targets'->>'kind'='sets' then
   if jsonb_array_length(entry->'targets'->'items') not between 1 and 20 then reasons:=reasons||jsonb_build_object('code','target_count_out_of_range','entryId',entry->>'id'); end if;
   if mode in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration') then
    for target in select value from jsonb_array_elements(entry->'targets'->'items') loop
     foreach field in array case mode when 'duration' then array['durationSeconds'] when 'bodyweight_reps' then array['reps'] else array['weightKg','reps'] end loop
      code:=fitness_private.template_value_reason(target->'measurements'->>field,field);
      if code is not null then reasons:=reasons||jsonb_build_object('code',code,'entryId',entry->>'id','targetId',target->>'id','field',field); end if;
     end loop;
    end loop;
   end if;
  end if;
  if entry->'restSeconds'<>'null'::jsonb and ((entry->>'restSeconds')::numeric<0 or (entry->>'restSeconds')::numeric>600 or trunc((entry->>'restSeconds')::numeric)<>(entry->>'restSeconds')::numeric) then reasons:=reasons||jsonb_build_object('code','rest_out_of_range','entryId',entry->>'id'); end if;
 end loop;
 return jsonb_build_object('templateVersion',content->>'version','ready',reasons='[]'::jsonb,'reasons',reasons);
end $$;
revoke all on function fitness_private.template_startability(jsonb,jsonb) from public,anon,authenticated,service_role;

create function fitness_private.template_read(p_id uuid) returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare content jsonb:=fitness_private.template_dto(p_id); definitions jsonb;
begin
 select coalesce(jsonb_agg(fitness_private.template_definition(exercise_id,(content->>'ownerId')::uuid) order by position),'[]') into definitions
 from (select (entry->>'exerciseId')::uuid exercise_id,min(position) position from jsonb_array_elements(content->'entries') with ordinality entries(entry,position) group by entry->>'exerciseId') ordered;
 return jsonb_build_object('protocolVersion',1,'template',content,'definitions',definitions,'startability',fitness_private.template_startability(content,definitions),'usage',jsonb_build_object('lastPerformedAt',(select last_performed_at from public.routines where id=p_id)));
end $$;
revoke all on function fitness_private.template_read(uuid) from public,anon,authenticated,service_role;

create function fitness_private.read_templates(p_id uuid,p_after uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); content jsonb; rows jsonb; next_id uuid;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if not (select ready from fitness_private.template_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 if p_id is not null then
  select fitness_private.template_dto(r.id) into content from public.routines r where r.id=p_id and r.user_id=owner;
  if content is null then return jsonb_build_object('status','not_found'); end if;
  return jsonb_build_object('status','available')||fitness_private.template_read(p_id);
 end if;
 select coalesce(jsonb_agg(fitness_private.template_read(id) order by id),'[]') into rows from (select id from public.routines where user_id=owner and (p_after is null or id>p_after) order by id limit 100) page;
 if jsonb_array_length(rows)=100 and exists(select 1 from public.routines where user_id=owner and id>(rows->99->'template'->>'id')::uuid) then next_id:=(rows->99->'template'->>'id')::uuid; end if;
 return jsonb_build_object('status','available','protocolVersion',1,'templates',rows,'nextCursor',next_id);
end $$;
revoke all on function fitness_private.read_templates(uuid,uuid) from public,anon,service_role;
grant execute on function fitness_private.read_templates(uuid,uuid) to authenticated;
create function public.read_train_templates(p_id uuid default null,p_after uuid default null) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select fitness_private.read_templates(p_id,p_after)$$;
revoke all on function public.read_train_templates(uuid,uuid) from public,anon,service_role;
grant execute on function public.read_train_templates(uuid,uuid) to authenticated;

create function fitness_private.template_uuid(value jsonb) returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(jsonb_typeof(value)='string' and value#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
$$;
revoke all on function fitness_private.template_uuid(jsonb) from public,anon,authenticated,service_role;
create function fitness_private.template_patch_keys(value jsonb,keys text[]) returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(jsonb_typeof(value)='object' and value<>'{}'::jsonb and not exists(select 1 from jsonb_object_keys(value) k where not k=any(keys)),false)
$$;
revoke all on function fitness_private.template_patch_keys(jsonb,text[]) from public,anon,authenticated,service_role;
create function fitness_private.valid_template_measurements(value jsonb,partial boolean,allow_zero boolean default false) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare field text; number numeric;
begin
 if partial then
  if not fitness_private.template_patch_keys(value,array['weightKg','reps','durationSeconds','distanceMeters']) then return false; end if;
 elsif not coalesce(fitness_private.exact_keys(value,array['weightKg','reps','durationSeconds','distanceMeters']),false) then return false; end if;
 for field in select jsonb_object_keys(value) loop
  if value->field='null'::jsonb then continue; end if;
  if jsonb_typeof(value->field) is distinct from 'number' then return false; end if;
  number:=(value->>field)::numeric;
  if number<0 or number::text in('NaN','Infinity','-Infinity') then return false; end if;
  if field='weightKg' and not fitness_private.valid_measure(value->field,false,0) then return false; end if;
  if field='reps' and (trunc(number)<>number or number>9007199254740991 or not allow_zero and number<1) then return false; end if;
  if field='durationSeconds' and (trunc(number)<>number or number>86400 or not allow_zero and number<1) then return false; end if;
  if field='distanceMeters' and number>999999.99 then return false; end if;
 end loop;
 return true;
exception when numeric_value_out_of_range or invalid_text_representation then return false;
end $$;
revoke all on function fitness_private.valid_template_measurements(jsonb,boolean,boolean) from public,anon,authenticated,service_role;
create function fitness_private.valid_template_target_shape(value jsonb) returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(fitness_private.exact_keys(value,array['id','kind','measurements']) and fitness_private.template_uuid(value->'id') and value->>'kind' in('working','warmup') and jsonb_typeof(value->'measurements')='object',false)
$$;
revoke all on function fitness_private.valid_template_target_shape(jsonb) from public,anon,authenticated,service_role;
create function fitness_private.valid_template_entry_shape(value jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
begin
 if not coalesce(fitness_private.exact_keys(value,array['id','exerciseId','notes','restSeconds','targets']),false)
  or not fitness_private.template_uuid(value->'id') or not fitness_private.template_uuid(value->'exerciseId')
  or jsonb_typeof(value->'targets') is distinct from 'array' then return false; end if;
 return not exists(select 1 from jsonb_array_elements(value->'targets') t where not fitness_private.valid_template_target_shape(t));
end $$;
revoke all on function fitness_private.valid_template_entry_shape(jsonb) from public,anon,authenticated,service_role;
create function fitness_private.insert_template_target(p_entry uuid,p_target jsonb,p_position bigint,p_allow_zero boolean default false) returns void
language plpgsql set search_path=pg_catalog as $$
begin
 if not fitness_private.valid_template_target_shape(p_target) or not fitness_private.valid_template_measurements(p_target->'measurements',false,p_allow_zero) then raise invalid_parameter_value using message='Invalid template target'; end if;
 insert into fitness_private.template_targets values((p_target->>'id')::uuid,p_entry,p_position,p_target->>'kind',(p_target->'measurements'->>'weightKg')::numeric,
  (p_target->'measurements'->>'reps')::bigint,(p_target->'measurements'->>'durationSeconds')::integer,(p_target->'measurements'->>'distanceMeters')::numeric);
end $$;
revoke all on function fitness_private.insert_template_target(uuid,jsonb,bigint,boolean) from public,anon,authenticated,service_role;
create function fitness_private.insert_template_entry(p_template uuid,p_owner uuid,p_entry jsonb,p_position bigint,p_allow_zero boolean default false) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare target jsonb; ordinal bigint:=0; rest numeric;
begin
 if not fitness_private.valid_template_entry_shape(p_entry) or jsonb_array_length(p_entry->'targets') not between 1 and 20
  or jsonb_typeof(p_entry->'notes') not in('string','null') or fitness_private.template_text_length(p_entry->>'notes')>2000
  or jsonb_typeof(p_entry->'restSeconds') not in('number','null') then raise invalid_parameter_value using message='Invalid template entry'; end if;
 rest:=(p_entry->>'restSeconds')::numeric;
 if rest<0 or rest>600 or trunc(rest)<>rest then raise invalid_parameter_value using message='Invalid template rest'; end if;
 perform 1 from public.exercises where id=(p_entry->>'exerciseId')::uuid
  and (user_id is null and not is_custom or user_id=p_owner and is_custom and catalog_key is null) and (p_allow_zero or archived_at is null) for share;
 if not found then raise invalid_parameter_value using message='Exercise unavailable'; end if;
 insert into public.routine_exercises(id,routine_id,exercise_id,sort_order,target_sets,target_reps,target_weight_kg,target_duration_seconds,target_distance_meters,notes,rest_timer_seconds)
 values((p_entry->>'id')::uuid,p_template,(p_entry->>'exerciseId')::uuid,p_position,null,null,null,null,null,p_entry->>'notes',rest::integer);
 insert into fitness_private.template_entries values((p_entry->>'id')::uuid,p_position,true,null);
 for target in select value from jsonb_array_elements(p_entry->'targets') loop
  perform fitness_private.insert_template_target((p_entry->>'id')::uuid,target,ordinal,p_allow_zero); ordinal:=ordinal+1;
 end loop;
end $$;
revoke all on function fitness_private.insert_template_entry(uuid,uuid,jsonb,bigint,boolean) from public,anon,authenticated,service_role;
create function fitness_private.valid_template_change_shape(change jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare kind text:=change->>'kind'; keys text[];
begin
 keys:=case kind when 'patch-template' then array['kind','patch'] when 'add-entry' then array['kind','entry'] when 'remove-entry' then array['kind','entryId']
  when 'order-entries' then array['kind','entryIds'] when 'patch-entry' then array['kind','entryId','patch'] when 'add-target' then array['kind','entryId','target']
  when 'remove-target' then array['kind','entryId','targetId'] when 'order-targets' then array['kind','entryId','targetIds']
  when 'patch-target' then array['kind','entryId','targetId','patch'] when 'replace-targets' then array['kind','entryId','targets'] end;
 if keys is null or not coalesce(fitness_private.exact_keys(change,keys),false) then return false; end if;
 if change ? 'entryId' and not fitness_private.template_uuid(change->'entryId') then return false; end if;
 if change ? 'targetId' and not fitness_private.template_uuid(change->'targetId') then return false; end if;
 if kind='patch-template' then return fitness_private.template_patch_keys(change->'patch',array['name','notes']); end if;
 if kind='patch-entry' then return fitness_private.template_patch_keys(change->'patch',array['notes','restSeconds']); end if;
 if kind='patch-target' then return fitness_private.template_patch_keys(change->'patch',array['kind','measurements']); end if;
 if kind='add-entry' then return fitness_private.valid_template_entry_shape(change->'entry'); end if;
 if kind='add-target' then return fitness_private.valid_template_target_shape(change->'target'); end if;
 if kind='replace-targets' then
  if jsonb_typeof(change->'targets') is distinct from 'array' then return false; end if;
  return not exists(select 1 from jsonb_array_elements(change->'targets') t where not fitness_private.valid_template_target_shape(t));
 end if;
 if kind in('order-entries','order-targets') then
  if jsonb_typeof(change->(case kind when 'order-entries' then 'entryIds' else 'targetIds' end)) is distinct from 'array' then return false; end if;
  return not exists(select 1 from jsonb_array_elements(change->(case kind when 'order-entries' then 'entryIds' else 'targetIds' end)) id where not fitness_private.template_uuid(id));
 end if;
 return true;
end $$;
revoke all on function fitness_private.valid_template_change_shape(jsonb) from public,anon,authenticated,service_role;
create function fitness_private.apply_template_change(p_template uuid,p_owner uuid,change jsonb) returns void
language plpgsql set search_path=pg_catalog,public as $$
<<apply_template_change>>
declare kind text:=change->>'kind'; patch jsonb:=change->'patch'; entry_id uuid:=(change->>'entryId')::uuid; target_id uuid:=(change->>'targetId')::uuid; requested uuid[]; existing uuid[]; target jsonb; ordinal bigint:=0; rest numeric;
begin
 if entry_id is not null and not exists(select 1 from public.routine_exercises where id=entry_id and routine_id=p_template) then raise invalid_parameter_value using message='Template entry unavailable'; end if;
 if target_id is not null and not exists(select 1 from fitness_private.template_targets where id=target_id and template_targets.entry_id=apply_template_change.entry_id) then raise invalid_parameter_value using message='Template target unavailable'; end if;
 if kind='patch-template' then
  if patch ? 'name' and not fitness_private.valid_exercise_metadata(jsonb_build_object('name',patch->'name'))
   or patch ? 'notes' and (jsonb_typeof(patch->'notes') not in('null','string') or fitness_private.template_text_length(patch->>'notes')>2000) then raise invalid_parameter_value using message='Invalid template metadata'; end if;
  update public.routines set name=case when patch ? 'name' then patch->>'name' else name end,notes=case when patch ? 'notes' then patch->>'notes' else notes end where id=p_template;
 elsif kind='add-entry' then
  select coalesce(max(s.position),-1)+1 into ordinal from fitness_private.template_entries s join public.routine_exercises e on e.id=s.entry_id where e.routine_id=p_template;
  perform fitness_private.insert_template_entry(p_template,p_owner,change->'entry',ordinal);
 elsif kind='remove-entry' then delete from public.routine_exercises where id=entry_id and routine_id=p_template;
 elsif kind='order-entries' then
  select array_agg(id::uuid order by id::uuid) into requested from jsonb_array_elements_text(change->'entryIds') id;
  select array_agg(id order by id) into existing from public.routine_exercises where routine_id=p_template;
  if requested is distinct from existing then raise invalid_parameter_value using message='Incomplete entry order'; end if;
  update fitness_private.template_entries s set position=ordered.ordinal-1 from jsonb_array_elements_text(change->'entryIds') with ordinality ordered(id,ordinal) where s.entry_id=ordered.id::uuid;
 elsif kind='patch-entry' then
  if patch ? 'notes' and (jsonb_typeof(patch->'notes') not in('null','string') or fitness_private.template_text_length(patch->>'notes')>2000) then raise invalid_parameter_value using message='Invalid entry notes'; end if;
  if patch ? 'restSeconds' then
   if jsonb_typeof(patch->'restSeconds') not in('number','null') then raise invalid_parameter_value using message='Invalid rest'; end if;
   rest:=(patch->>'restSeconds')::numeric;
   if rest<0 or rest>600 or trunc(rest)<>rest then raise invalid_parameter_value using message='Invalid rest'; end if;
  end if;
  update public.routine_exercises set notes=case when patch ? 'notes' then patch->>'notes' else notes end,rest_timer_seconds=case when patch ? 'restSeconds' then rest::integer else rest_timer_seconds end where id=entry_id;
 elsif kind='add-target' then
  select coalesce(max(t.position),-1)+1 into ordinal from fitness_private.template_targets t where t.entry_id=apply_template_change.entry_id;
  perform fitness_private.insert_template_target(entry_id,change->'target',ordinal);
 elsif kind='remove-target' then delete from fitness_private.template_targets where id=target_id;
 elsif kind='order-targets' then
  select array_agg(id::uuid order by id::uuid) into requested from jsonb_array_elements_text(change->'targetIds') id;
  select array_agg(t.id order by t.id) into existing from fitness_private.template_targets t where t.entry_id=apply_template_change.entry_id;
  if requested is distinct from existing then raise invalid_parameter_value using message='Incomplete target order'; end if;
  update fitness_private.template_targets t set position=ordered.ordinal-1 from jsonb_array_elements_text(change->'targetIds') with ordinality ordered(id,ordinal) where t.id=ordered.id::uuid;
 elsif kind='patch-target' then
  if patch ? 'kind' and not coalesce(patch->>'kind' in('working','warmup'),false) or patch ? 'measurements' and not fitness_private.valid_template_measurements(patch->'measurements',true) then raise invalid_parameter_value using message='Invalid target patch'; end if;
  update fitness_private.template_targets t set kind=case when patch ? 'kind' then patch->>'kind' else t.kind end,
   weight_kg=case when patch->'measurements' ? 'weightKg' then (patch->'measurements'->>'weightKg')::numeric else t.weight_kg end,
   reps=case when patch->'measurements' ? 'reps' then (patch->'measurements'->>'reps')::bigint else t.reps end,
   duration_seconds=case when patch->'measurements' ? 'durationSeconds' then (patch->'measurements'->>'durationSeconds')::integer else t.duration_seconds end,
   distance_meters=case when patch->'measurements' ? 'distanceMeters' then (patch->'measurements'->>'distanceMeters')::numeric else t.distance_meters end where t.id=target_id;
 elsif kind='replace-targets' then
  if exists(select 1 from fitness_private.template_entries s where s.entry_id=apply_template_change.entry_id and s.targets_resolved) then raise invalid_parameter_value using message='Resolved targets require narrow edits'; end if;
  delete from fitness_private.template_targets t where t.entry_id=apply_template_change.entry_id;
  for target in select value from jsonb_array_elements(change->'targets') loop
   perform fitness_private.insert_template_target(entry_id,target,ordinal); ordinal:=ordinal+1;
  end loop;
  update fitness_private.template_entries s set targets_resolved=true where s.entry_id=apply_template_change.entry_id;
 end if;
end $$;
revoke all on function fitness_private.apply_template_change(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function fitness_private.save_workout_template(p_template uuid,p_owner uuid,p_workout uuid,p_name text) returns boolean
language plpgsql set search_path=pg_catalog,public as $$
declare source public.workouts; entry record; representative public.workout_sets; targets jsonb; measures jsonb; amount integer; ordinal bigint:=0; completed boolean; mode text; document jsonb; capture jsonb;
begin
 select * into source from public.workouts where id=p_workout and user_id=p_owner for update;
 if not found then return false; end if;
 document:=coalesce(source.native_completion,source.recorded_completion);
 if source.native_completion is not null and source.recorded_completion is not null
  or document is not null and not fitness_private.valid_recorded_completion(document) then raise invalid_parameter_value using message='Source format unavailable'; end if;
 if not fitness_private.valid_exercise_metadata(jsonb_build_object('name',p_name)) then raise invalid_parameter_value using message='Invalid template name'; end if;
 perform 1 from public.workout_exercises where workout_id=p_workout order by id for update;
 perform 1 from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_id=p_workout order by s.id for update of s;
 insert into public.routines(id,user_id,name,notes) values(p_template,p_owner,p_name,null);
 for entry in select e.*,d.exercise_type from public.workout_exercises e join public.exercises d on d.id=e.exercise_id
  where e.workout_id=p_workout order by e.sort_order,e.id loop
  mode:=entry.exercise_type;
  if document is not null then
   select e->'definition' into capture from jsonb_array_elements(document->'exercises') e where e->>'id'=entry.id::text;
   if capture is null or fitness_private.completed_exercise_reference(capture,p_owner) is distinct from entry.exercise_id then raise invalid_parameter_value using message='Captured source meaning unavailable'; end if;
   mode:=capture->>'mode';
  end if;
  if mode not in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration','duration_weight','distance_duration','weight_distance') then raise invalid_parameter_value using message='Source mode unavailable'; end if;
  select exists(select 1 from public.workout_sets where workout_exercise_id=entry.id and set_type='normal' and is_completed) into completed;
  select count(*) into amount from public.workout_sets where workout_exercise_id=entry.id and set_type='normal' and (not completed or is_completed);
  if amount not between 1 and 20 then raise invalid_parameter_value using message='No reusable normal sets'; end if;
  select * into representative from public.workout_sets s where s.workout_exercise_id=entry.id and s.set_type='normal' and (not completed or s.is_completed)
  order by case mode when 'bodyweight_reps' then coalesce(s.reps,0) when 'duration' then coalesce(s.duration_seconds,0)
   when 'duration_weight' then coalesce(s.duration_seconds,0) when 'distance_duration' then coalesce(s.distance_meters,0) else coalesce(s.weight_kg,0) end desc,s.set_number,s.id limit 1;
  measures:=jsonb_build_object('weightKg',case when mode in('weight_reps','weighted_bodyweight','assisted_bodyweight','duration_weight','weight_distance') then representative.weight_kg end,
   'reps',case when mode in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight') then representative.reps end,
   'durationSeconds',case when mode in('duration','duration_weight','distance_duration') then representative.duration_seconds end,
   'distanceMeters',case when mode in('distance_duration','weight_distance') then representative.distance_meters end);
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'kind','working','measurements',measures) order by i) into targets from generate_series(1,amount) i;
  perform fitness_private.insert_template_entry(p_template,p_owner,jsonb_build_object('id',gen_random_uuid(),'exerciseId',entry.exercise_id,'notes',entry.notes,'restSeconds',entry.rest_timer_seconds,'targets',targets),ordinal,true);
  ordinal:=ordinal+1;
 end loop;
 if ordinal=0 then raise invalid_parameter_value using message='No reusable normal sets'; end if;
 return true;
end $$;
revoke all on function fitness_private.save_workout_template(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

create function fitness_private.execute_template_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); command_id uuid; command jsonb; kind text; template_id uuid; expected bigint;
 previous public.train_template_command_outcomes; receipt jsonb; rejection jsonb; saved public.routines; code text;
 entry jsonb; change jsonb; ordinal bigint:=0;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if not coalesce(fitness_private.exact_keys(p_request,array['protocolVersion','operationId','command']),false)
  or not fitness_private.template_uuid(p_request->'operationId') or jsonb_typeof(p_request->'command') is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if p_request->'protocolVersion' is distinct from '1'::jsonb then return jsonb_build_object('status','unsupported_version'); end if;
 command_id:=(p_request->>'operationId')::uuid; command:=p_request->'command'; kind:=command->>'kind';
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':train:template:'||command_id::text,0));
 select * into previous from public.train_template_command_outcomes o where o.owner_id=owner and o.operation_id=command_id;
 if found then
  if previous.request is distinct from p_request then return jsonb_build_object('status','operation_conflict'); end if;
  return case when previous.receipt is not null then jsonb_build_object('status','accepted','receipt',previous.receipt) else jsonb_build_object('status',previous.rejection->>'code','rejection',previous.rejection) end;
 end if;
 if not (select ready from fitness_private.template_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 if kind='create' then
  if not coalesce(fitness_private.exact_keys(command,array['kind','name','notes','entries']),false) or jsonb_typeof(command->'entries') is distinct from 'array' then return jsonb_build_object('status','invalid_request'); end if;
  if exists(select 1 from jsonb_array_elements(command->'entries') e where not fitness_private.valid_template_entry_shape(e)) then return jsonb_build_object('status','invalid_request'); end if;
  template_id:=command_id;
 elsif kind='save-workout-as-template' then
  if not coalesce(fitness_private.exact_keys(command,array['kind','workoutId','name']),false) or not fitness_private.template_uuid(command->'workoutId') then return jsonb_build_object('status','invalid_request'); end if;
  template_id:=command_id;
 elsif kind in('edit','archive','restore') then
  if not coalesce(fitness_private.exact_keys(command,case kind when 'edit' then array['kind','templateId','expectedVersion','changes'] else array['kind','templateId','expectedVersion'] end),false)
   or not fitness_private.template_uuid(command->'templateId') or jsonb_typeof(command->'expectedVersion') is distinct from 'string'
   or command->>'expectedVersion' !~ '^[1-9][0-9]{0,18}$' then return jsonb_build_object('status','invalid_request'); end if;
  if (command->>'expectedVersion')::numeric>9223372036854775807 then return jsonb_build_object('status','invalid_request'); end if;
  expected:=(command->>'expectedVersion')::bigint; template_id:=(command->>'templateId')::uuid;
  if kind='edit' then
   if jsonb_typeof(command->'changes') is distinct from 'array' or command->'changes'='[]'::jsonb then return jsonb_build_object('status','invalid_request'); end if;
   if exists(select 1 from jsonb_array_elements(command->'changes') c where not fitness_private.valid_template_change_shape(c)) then return jsonb_build_object('status','invalid_request'); end if;
  end if;
 else return jsonb_build_object('status','invalid_request'); end if;
 if kind not in('create','save-workout-as-template') then
  select * into saved from public.routines r where r.id=template_id and r.user_id=owner for update;
  if not found then code:='not_found'; elsif saved.version<>expected then code:='version_conflict'; end if;
 end if;
 if code is null then
  begin
   if kind='create' then
    if not fitness_private.valid_exercise_metadata(jsonb_build_object('name',command->'name')) or jsonb_typeof(command->'notes') not in('string','null') or fitness_private.template_text_length(command->>'notes')>2000 then raise invalid_parameter_value using message='Invalid template metadata'; end if;
    insert into public.routines(id,user_id,name,notes) values(template_id,owner,command->>'name',command->>'notes');
    for entry in select value from jsonb_array_elements(command->'entries') loop
     perform fitness_private.insert_template_entry(template_id,owner,entry,ordinal); ordinal:=ordinal+1;
    end loop;
   elsif kind='save-workout-as-template' then
    if not fitness_private.save_workout_template(template_id,owner,(command->>'workoutId')::uuid,command->>'name') then code:='not_found'; end if;
   elsif kind='edit' then
    for change in select value from jsonb_array_elements(command->'changes') loop
     perform fitness_private.apply_template_change(template_id,owner,change);
    end loop;
    if exists(select 1 from public.routine_exercises e join fitness_private.template_entries s on s.entry_id=e.id where e.routine_id=template_id and s.targets_resolved
      and (select count(*) from fitness_private.template_targets t where t.entry_id=e.id) not between 1 and 20) then raise invalid_parameter_value using message='Invalid target count'; end if;
    -- A valid no-op is still a new accepted content command.
    update public.routines set version=version where id=template_id;
   else update public.routines set archived_at=case kind when 'archive' then coalesce(archived_at,clock_timestamp()) else null end where id=template_id;
   end if;
   if code is null and not fitness_private.valid_template_content(fitness_private.template_dto(template_id)) then raise invalid_parameter_value using message='Invalid template identity graph'; end if;
  exception when unique_violation then code:='identity_conflict';
   when invalid_parameter_value or check_violation or numeric_value_out_of_range or invalid_text_representation or foreign_key_violation then code:='invalid_template';
  end;
 end if;
 if code is not null then
  rejection:=jsonb_build_object('operationId',command_id,'operation',kind,'ownerId',owner,'templateId',template_id,'rejectedAt',clock_timestamp(),'code',code);
  if code='version_conflict' then rejection:=rejection||jsonb_build_object('current',fitness_private.template_dto(template_id)); end if;
  insert into public.train_template_command_outcomes values(owner,command_id,p_request,null,rejection);
  return jsonb_build_object('status',code,'rejection',rejection);
 end if;
 receipt:=jsonb_build_object('operationId',command_id,'operation',kind,'ownerId',owner,'templateId',template_id,'acceptedAt',clock_timestamp(),'template',fitness_private.template_dto(template_id));
 insert into public.train_template_command_outcomes values(owner,command_id,p_request,receipt,null);
 return jsonb_build_object('status','accepted','receipt',receipt);
end $$;
revoke all on function fitness_private.execute_template_command(jsonb) from public,anon,service_role;
grant execute on function fitness_private.execute_template_command(jsonb) to authenticated;
create function public.execute_train_template_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select fitness_private.execute_template_command(p_request)$$;
revoke all on function public.execute_train_template_command(jsonb) from public,anon,service_role;
grant execute on function public.execute_train_template_command(jsonb) to authenticated;

-- Not a client API. Deployment C executes this under the migration owner.
create function fitness_private.activate_template_contract() returns void
language plpgsql set search_path=pg_catalog,public as $$
declare entry public.routine_exercises; ordinal bigint;
begin
 lock table public.routines,public.routine_exercises in access exclusive mode;
 if (select ready from fitness_private.template_rollout where singleton) then return; end if;
 for entry in select e.* from public.routine_exercises e order by e.routine_id,e.sort_order,e.id loop
  select count(*) into ordinal from fitness_private.template_entries s join public.routine_exercises e on e.id=s.entry_id where e.routine_id=entry.routine_id;
  insert into fitness_private.template_entries values(entry.id,ordinal,coalesce(entry.target_sets between 1 and 20,false),jsonb_build_object('targetSets',entry.target_sets::text,'sortOrder',entry.sort_order::text,
   'measurements',jsonb_build_object('weightKg',entry.target_weight_kg::text,'reps',entry.target_reps::text,'durationSeconds',entry.target_duration_seconds::text,'distanceMeters',entry.target_distance_meters::text)));
  if entry.target_sets between 1 and 20 then
   insert into fitness_private.template_targets(id,entry_id,position,kind,weight_kg,reps,duration_seconds,distance_meters)
   select gen_random_uuid(),entry.id,i,'working',entry.target_weight_kg,entry.target_reps,entry.target_duration_seconds,entry.target_distance_meters from generate_series(0,entry.target_sets-1) i;
  end if;
 end loop;
 update fitness_private.template_rollout set ready=true where singleton;
 revoke insert,update,delete,truncate,references,trigger on public.routines,public.routine_exercises from public,anon,authenticated,service_role;
 grant update(last_performed_at) on public.routines to authenticated,service_role;
end $$;
revoke all on function fitness_private.activate_template_contract() from public,anon,authenticated,service_role;

create function fitness_private.read_template_definitions(p_after uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); rows jsonb; last_id uuid; next_id uuid;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if not (select ready from fitness_private.template_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('definition',fitness_private.template_definition(id,owner),'archivedAt',archived_at) order by id),'[]'),max(id::text)::uuid into rows,last_id
 from (select id,archived_at from public.exercises where (user_id is null and not is_custom or user_id=owner and is_custom and catalog_key is null)
  and (p_after is null or id>p_after) order by id limit 100) page;
 if jsonb_array_length(rows)=100 and exists(select 1 from public.exercises where id>last_id and (user_id is null and not is_custom or user_id=owner and is_custom and catalog_key is null)) then next_id:=last_id; end if;
 return jsonb_build_object('status','available','protocolVersion',1,'definitions',rows,'nextCursor',next_id);
end $$;
revoke all on function fitness_private.read_template_definitions(uuid) from public,anon,service_role;
grant execute on function fitness_private.read_template_definitions(uuid) to authenticated;
create function public.read_train_template_definitions(p_after uuid default null) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select fitness_private.read_template_definitions(p_after)$$;
revoke all on function public.read_train_template_definitions(uuid) from public,anon,service_role;
grant execute on function public.read_train_template_definitions(uuid) to authenticated;

create function fitness_private.valid_recorded_definition(definition jsonb,owner text,version integer) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare canonical_custom_uuid constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
   if version>=3 and definition ? 'reference' then
     if version=4 and definition->'reference'->>'kind'='preset' then
      if not coalesce(fitness_private.exact_keys(definition,array['reference','name','equipment','mode','convention']),false)
       or not coalesce(fitness_private.exact_keys(definition->'reference',array['kind','exerciseId']),false)
       or not fitness_private.template_uuid(definition->'reference'->'exerciseId') or jsonb_typeof(definition->'name') is distinct from 'string'
       or not coalesce(definition->>'equipment' in('barbell','dumbbell','machine','bodyweight','kettlebell','band','cable','other','none'),false)
       or not coalesce(definition->>'mode' in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration'),false)
       or definition->'convention' is distinct from 'null'::jsonb then return false; end if;
     else
     if not fitness_private.exact_keys(definition,array['reference','name','equipment','mode','convention'])
       or not fitness_private.exact_keys(definition->'reference',array['kind','exerciseId','ownerId'])
       or definition->'reference'->>'kind' is distinct from 'custom'
       or not coalesce(fitness_private.valid_uuid(definition->'reference'->'exerciseId') and fitness_private.valid_uuid(definition->'reference'->'ownerId'),false)
       or not coalesce(definition->'reference'->>'exerciseId' ~ canonical_custom_uuid and definition->'reference'->>'ownerId' ~ canonical_custom_uuid,false)
       or definition->'reference'->>'ownerId' is distinct from owner
       or jsonb_typeof(definition->'name') is distinct from 'string'
       or not coalesce(definition->>'equipment' in ('barbell','dumbbell','machine','bodyweight','kettlebell','band','cable','other','none'),false)
       or not coalesce(definition->>'mode' in ('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight','duration'),false)
       or not coalesce(definition->'convention'='null'::jsonb or (jsonb_typeof(definition->'convention')='string'
         and definition->>'convention'=fitness_private.custom_exercise_convention(definition->>'equipment',definition->>'mode')),false)
       then return false; end if;
     end if;
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
 return true;
end $$;
revoke all on function fitness_private.valid_recorded_definition(jsonb,text,integer) from public,anon,authenticated,service_role;

create function fitness_private.valid_template_raw(value jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
begin
 if not coalesce(fitness_private.exact_keys(value,array['weightKg','reps','durationSeconds','distanceMeters']),false) then return false; end if;
 return not exists(select 1 from jsonb_each(value) field where jsonb_typeof(field.value) not in('null','string'));
end $$;
revoke all on function fitness_private.valid_template_raw(jsonb) from public,anon,authenticated,service_role;
create function fitness_private.valid_template_content(content jsonb) returns boolean
language plpgsql stable set search_path=pg_catalog as $$
declare entry jsonb; target jsonb; legacy jsonb; ids text[]:='{}'; instant text;
begin
 if not coalesce(fitness_private.exact_keys(content,array['id','ownerId','version','name','notes','archivedAt','entries']),false)
  or not fitness_private.template_uuid(content->'id') or not fitness_private.template_uuid(content->'ownerId')
  or jsonb_typeof(content->'version') is distinct from 'string' or content->>'version' !~ '^[1-9][0-9]{0,18}$'
  or jsonb_typeof(content->'name') is distinct from 'string' or jsonb_typeof(content->'notes') not in('null','string')
  or jsonb_typeof(content->'entries') is distinct from 'array' then return false; end if;
 if (content->>'version')::numeric>9223372036854775807 then return false; end if;
 if content->'archivedAt'<>'null'::jsonb then
  if jsonb_typeof(content->'archivedAt') is distinct from 'string' then return false; end if;
  instant:=content->>'archivedAt';
  if instant !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' or not isfinite(instant::timestamptz) then return false; end if;
 end if;
 for entry in select value from jsonb_array_elements(content->'entries') loop
  if not coalesce(fitness_private.exact_keys(entry,array['id','exerciseId','notes','restSeconds','targets','legacySource']),false)
   or not fitness_private.template_uuid(entry->'id') or not fitness_private.template_uuid(entry->'exerciseId')
   or jsonb_typeof(entry->'notes') not in('string','null') or jsonb_typeof(entry->'restSeconds') not in('number','null')
   or entry->>'id'=any(ids) then return false; end if;
  ids:=array_append(ids,entry->>'id'); legacy:=entry->'legacySource';
  if legacy<>'null'::jsonb and (not coalesce(fitness_private.exact_keys(legacy,array['targetSets','measurements','sortOrder']),false)
   or jsonb_typeof(legacy->'targetSets') not in('string','null') or jsonb_typeof(legacy->'sortOrder') is distinct from 'string' or not fitness_private.valid_template_raw(legacy->'measurements')) then return false; end if;
  if entry->'targets'->>'kind'='legacy-unresolved' then
   if not coalesce(fitness_private.exact_keys(entry->'targets',array['kind']),false) then return false; end if;
  elsif entry->'targets'->>'kind'='sets' then
   if not coalesce(fitness_private.exact_keys(entry->'targets',array['kind','items']),false) or jsonb_typeof(entry->'targets'->'items') is distinct from 'array' then return false; end if;
   for target in select value from jsonb_array_elements(entry->'targets'->'items') loop
    if not fitness_private.valid_template_target_shape(target) or not fitness_private.valid_template_raw(target->'measurements') or target->>'id'=any(ids) then return false; end if;
    ids:=array_append(ids,target->>'id');
   end loop;
  else return false; end if;
 end loop;
 return true;
exception when invalid_text_representation or invalid_parameter_value or datetime_field_overflow or numeric_value_out_of_range then return false;
end $$;
revoke all on function fitness_private.valid_template_content(jsonb) from public,anon,authenticated,service_role;

create function fitness_private.valid_template_origin(origin jsonb,owner text) returns boolean
language plpgsql stable set search_path=pg_catalog as $$
declare content jsonb:=origin->'content'; entry jsonb; capture jsonb; binding jsonb; target jsonb; mapped jsonb; definitions jsonb:='[]'; source_ids text[]; workout_ids text[]:='{}'; captured jsonb:='{}'; i integer:=0; j integer;
begin
 if not coalesce(fitness_private.exact_keys(origin,array['content','definitions','bindings']),false) or not fitness_private.valid_template_content(content)
  or content->>'ownerId' is distinct from owner or jsonb_typeof(origin->'definitions') is distinct from 'array' or jsonb_typeof(origin->'bindings') is distinct from 'array' then return false; end if;
 if jsonb_array_length(content->'entries')<>jsonb_array_length(origin->'definitions') or jsonb_array_length(content->'entries')<>jsonb_array_length(origin->'bindings') then return false; end if;
 source_ids:=array[content->>'id'];
 for entry in select value from jsonb_array_elements(content->'entries') loop
  if entry->'targets'->>'kind'<>'sets' then return false; end if;
  source_ids:=source_ids||array[entry->>'id',entry->>'exerciseId'];
  for target in select value from jsonb_array_elements(entry->'targets'->'items') loop source_ids:=array_append(source_ids,target->>'id'); end loop;
 end loop;
 for entry in select value from jsonb_array_elements(content->'entries') loop
  capture:=origin->'definitions'->i; binding:=origin->'bindings'->i; i:=i+1; j:=0;
  if not coalesce(fitness_private.exact_keys(capture,array['entryId','definition']),false) or capture->>'entryId' is distinct from entry->>'id'
   or not fitness_private.valid_recorded_definition(capture->'definition',owner,4) then return false; end if;
  if capture->'definition' ? 'reference' and capture->'definition'->'reference'->>'exerciseId' is distinct from entry->>'exerciseId' then return false; end if;
  if captured ? (entry->>'exerciseId') and captured->(entry->>'exerciseId') is distinct from capture->'definition' then return false; end if;
  captured:=captured||jsonb_build_object(entry->>'exerciseId',capture->'definition');
  if not coalesce(fitness_private.exact_keys(binding,array['entryId','workoutEntryId','targets']),false) or binding->>'entryId' is distinct from entry->>'id'
   or not fitness_private.template_uuid(binding->'workoutEntryId') or binding->>'workoutEntryId'=any(workout_ids||source_ids) or jsonb_typeof(binding->'targets') is distinct from 'array' then return false; end if;
  workout_ids:=array_append(workout_ids,binding->>'workoutEntryId');
  if jsonb_array_length(binding->'targets')<>jsonb_array_length(entry->'targets'->'items') then return false; end if;
  for target in select value from jsonb_array_elements(entry->'targets'->'items') loop
   mapped:=binding->'targets'->j; j:=j+1;
   if not coalesce(fitness_private.exact_keys(mapped,array['targetId','workoutSetId']),false) or mapped->>'targetId' is distinct from target->>'id'
    or not fitness_private.template_uuid(mapped->'workoutSetId') or mapped->>'workoutSetId'=any(workout_ids||source_ids) then return false; end if;
   workout_ids:=array_append(workout_ids,mapped->>'workoutSetId');
  end loop;
  definitions:=definitions||jsonb_build_object('kind','captured','exerciseId',entry->>'exerciseId','mode',capture->'definition'->>'mode');
 end loop;
 return (fitness_private.template_startability(content,definitions)->>'ready')::boolean;
exception when invalid_text_representation or invalid_parameter_value or datetime_field_overflow or numeric_value_out_of_range then return false;
end $$;
revoke all on function fitness_private.valid_template_origin(jsonb,text) from public,anon,authenticated,service_role;

create function fitness_private.valid_template_completed_bindings(doc jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare origin jsonb:=doc->'templateOrigin'; entry jsonb; item jsonb; binding jsonb; definition jsonb;
begin
 if not fitness_private.template_uuid(doc->'id') or not fitness_private.template_uuid(doc->'ownerId') or not fitness_private.template_uuid(doc->'sourceId') then return false; end if;
 if doc->>'id'=origin->'content'->>'id'
  or exists(select 1 from jsonb_array_elements(origin->'content'->'entries') e where doc->>'id' in(e->>'id',e->>'exerciseId')
   or exists(select 1 from jsonb_array_elements(e->'targets'->'items') t where t->>'id'=doc->>'id'))
  or exists(select 1 from jsonb_array_elements(origin->'bindings') b where b->>'workoutEntryId'=doc->>'id'
   or exists(select 1 from jsonb_array_elements(b->'targets') t where t->>'workoutSetId'=doc->>'id')) then return false; end if;
 for entry in select value from jsonb_array_elements(doc->'exercises') loop
  if not fitness_private.template_uuid(entry->'id') then return false; end if;
  select b into binding from jsonb_array_elements(origin->'bindings') b where b->>'workoutEntryId'=entry->>'id';
  if binding is not null then
   select d->'definition' into definition from jsonb_array_elements(origin->'definitions') d where d->>'entryId'=binding->>'entryId';
   if definition is distinct from entry->'definition' then return false; end if;
  end if;
  for item in select value from jsonb_array_elements(entry->'sets') loop
   if not fitness_private.template_uuid(item->'id') or exists(select 1 from jsonb_array_elements(origin->'bindings') b
    where b->>'workoutEntryId'<>entry->>'id' and exists(select 1 from jsonb_array_elements(b->'targets') t where t->>'workoutSetId'=item->>'id')) then return false; end if;
  end loop;
 end loop;
 return true;
end $$;
revoke all on function fitness_private.valid_template_completed_bindings(jsonb) from public,anon,authenticated,service_role;

create or replace function fitness_private.valid_recorded_completion(doc jsonb) returns boolean
language plpgsql stable set search_path=pg_catalog,public as $$
declare entry jsonb; definition jsonb; item jsonb; performed jsonb; identifiers uuid[]:='{}'::uuid[]; identity uuid; started timestamptz; ended timestamptz;
  canonical_custom_uuid constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  instant_pattern constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$';
begin
 if doc->'version'='1'::jsonb then return fitness_private.valid_native_completion(doc); end if;
 if doc->'version'='3'::jsonb and not (select ready from fitness_private.custom_exercise_rollout where singleton) then return false; end if;
 if not fitness_private.exact_keys(doc,(array['version','id','ownerId','sourceId','startedAt','completedAt','durationSeconds','timezone','workoutDay','planId','exercises']||case when doc->'version'='4'::jsonb then array['templateOrigin'] else '{}'::text[] end))
   or doc->'version' not in ('2'::jsonb,'3'::jsonb,'4'::jsonb)
   or not coalesce(fitness_private.valid_uuid(doc->'id') and fitness_private.valid_uuid(doc->'ownerId') and fitness_private.valid_uuid(doc->'sourceId'),false)
   or not fitness_private.valid_measure(doc->'durationSeconds',true,0)
   or jsonb_typeof(doc->'startedAt') is distinct from 'string' or jsonb_typeof(doc->'completedAt') is distinct from 'string'
   or jsonb_typeof(doc->'timezone') is distinct from 'string' or jsonb_typeof(doc->'workoutDay') is distinct from 'string'
   or jsonb_typeof(doc->'planId') not in ('null','string')
   or jsonb_typeof(doc->'exercises') is distinct from 'array' then return false; end if;
 if doc->'version'='4'::jsonb and (not (select ready from fitness_private.template_rollout where singleton) or not fitness_private.valid_template_origin(doc->'templateOrigin',doc->>'ownerId') or not fitness_private.valid_template_completed_bindings(doc)) then return false; end if;
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
   if not fitness_private.valid_recorded_definition(definition,doc->>'ownerId',(doc->>'version')::integer) then return false; end if;
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

create or replace function fitness_private.completed_exercise_reference(definition jsonb, owner uuid) returns uuid
language plpgsql set search_path=pg_catalog,public as $$
declare result uuid;
begin
 if definition->'reference'->>'kind'='preset' then
  select id into result from public.exercises where id=(definition->'reference'->>'exerciseId')::uuid and user_id is null and not is_custom
   and equipment=definition->>'equipment' and exercise_type=definition->>'mode' for share;
 elsif definition ? 'reference' then
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
 if not fitness_private.valid_recorded_completion(p_completion) then return jsonb_build_object('status','invalid_completion'); end if;
 if exists(select 1 from public.workouts where id=p_operation_id) then return jsonb_build_object('status','identity_conflict'); end if;
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
 values(p_operation_id,owner,'Workout','completed',(p_completion->>'startedAt')::timestamptz,(p_completion->>'completedAt')::timestamptz,
   (p_completion->>'durationSeconds')::bigint,null,template_id,
   case when p_completion->'version'='1'::jsonb then p_completion end,
   case when p_completion->'version' in ('2'::jsonb,'3'::jsonb,'4'::jsonb) then p_completion end);
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
 return new;
end $$;

alter table public.workouts drop constraint workouts_recorded_authority_check;
alter table public.workouts add constraint workouts_recorded_authority_check check (
 (native_completion is null or recorded_completion is null) and (native_completion is null and recorded_completion is null or status='completed')
 and (native_completion is null or jsonb_typeof(native_completion)='object' and native_completion->'version' is not distinct from '1'::jsonb)
 and (recorded_completion is null or jsonb_typeof(recorded_completion)='object' and recorded_completion->'version' in('2'::jsonb,'3'::jsonb,'4'::jsonb))
);
-- Continuing Web and Assistant starts use the same ordered target authority.
-- The three deferred modes remain supported here; native Start still uses its
-- explicit five-mode startability contract.
create function fitness_private.start_template_workout(p_owner uuid,p_template uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare source public.routines; entry record; target fitness_private.template_targets; definition public.exercises;
 workout public.workouts; workout_entry public.workout_exercises; entries jsonb:='[]'; ordinal integer:=0; set_number integer;
 load numeric; repetitions bigint; duration integer; distance numeric;
begin
 if auth.uid() is null or auth.uid() is distinct from p_owner then return jsonb_build_object('status','unauthenticated'); end if;
 if not (select ready from fitness_private.template_rollout where singleton) then return jsonb_build_object('status','not_ready'); end if;
 select * into source from public.routines where id=p_template and user_id=p_owner for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if not fitness_private.valid_exercise_metadata(jsonb_build_object('name',source.name))
  or fitness_private.template_text_length(source.notes)>2000 then return jsonb_build_object('status','invalid_source'); end if;
 insert into public.workouts(user_id,title,status,started_at,routine_id) values(p_owner,source.name,'in_progress',clock_timestamp(),source.id) returning * into workout;
 for entry in select e.*,s.position,s.targets_resolved from public.routine_exercises e join fitness_private.template_entries s on s.entry_id=e.id where e.routine_id=source.id order by s.position,e.id loop
  select * into definition from public.exercises where id=entry.exercise_id and (user_id is null and not is_custom or user_id=p_owner and is_custom) for share;
  if not found or not entry.targets_resolved or fitness_private.template_text_length(entry.notes)>2000
   or entry.rest_timer_seconds not between 0 and 600
   or (select count(*) from fitness_private.template_targets where entry_id=entry.id) not between 1 and 20 then raise invalid_parameter_value using message='Invalid source target'; end if;
  insert into public.workout_exercises(workout_id,exercise_id,sort_order,notes,rest_timer_seconds)
  values(workout.id,entry.exercise_id,ordinal,entry.notes,entry.rest_timer_seconds) returning * into workout_entry;
  ordinal:=ordinal+1; set_number:=0;
  for target in select * from fitness_private.template_targets where entry_id=entry.id order by position,id loop
   load:=null; repetitions:=null; duration:=null; distance:=null;
   if definition.exercise_type in('weight_reps','weighted_bodyweight','assisted_bodyweight','duration_weight','weight_distance') then load:=target.weight_kg; end if;
   if definition.exercise_type in('weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight') then repetitions:=target.reps; end if;
   if definition.exercise_type in('duration','duration_weight','distance_duration') then duration:=target.duration_seconds; end if;
   if definition.exercise_type in('distance_duration','weight_distance') then distance:=target.distance_meters; end if;
   if fitness_private.template_value_reason(load::text,'weightKg') is not null
    or fitness_private.template_value_reason(repetitions::text,'reps') is not null
    or fitness_private.template_value_reason(duration::text,'durationSeconds') is not null
    or distance is not null and (distance<0 or distance>999999.99 or fitness_private.template_value_reason(distance::text,'weightKg') is not null) then raise invalid_parameter_value using message='Invalid source measurement'; end if;
   set_number:=set_number+1;
   insert into public.workout_sets(workout_exercise_id,set_number,set_type,weight_kg,reps,duration_seconds,distance_meters,is_completed,rpe)
   values(workout_entry.id,set_number,case target.kind when 'warmup' then 'warmup' else 'normal' end,load,repetitions,duration,distance,false,null);
  end loop;
  entries:=entries||jsonb_build_object('id',workout_entry.id,'workout_id',workout_entry.workout_id,'exercise_id',workout_entry.exercise_id,
   'sort_order',workout_entry.sort_order,'notes',workout_entry.notes,'rest_timer_seconds',workout_entry.rest_timer_seconds,'created_at',workout_entry.created_at,
   'exercise',to_jsonb(definition),'sets',(select jsonb_agg(to_jsonb(s) order by s.set_number) from public.workout_sets s where s.workout_exercise_id=workout_entry.id));
 end loop;
 update public.routines set last_performed_at=workout.started_at where id=source.id;
 return jsonb_build_object('status','started','workout',to_jsonb(workout)||jsonb_build_object('exercises',entries));
exception when unique_violation then return jsonb_build_object('status','conflict');
 when invalid_parameter_value or check_violation or numeric_value_out_of_range then return jsonb_build_object('status','invalid_source');
end $$;
revoke all on function fitness_private.start_template_workout(uuid,uuid) from public,anon,service_role;
grant execute on function fitness_private.start_template_workout(uuid,uuid) to authenticated;
create function public.start_train_template_workout(p_user_id uuid,p_template_id uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select fitness_private.start_template_workout(p_user_id,p_template_id)$$;
revoke all on function public.start_train_template_workout(uuid,uuid) from public,anon,service_role;
grant execute on function public.start_train_template_workout(uuid,uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.start_workout_from_routine(p_user_id uuid, p_workout jsonb, p_exercises jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
  created_workout public.workouts;
  created_workout_exercise public.workout_exercises;
  requested_exercise JSONB;
  requested_set JSONB;
  complete_exercises JSONB := '[]'::JSONB;
  complete_workout JSONB;
  authoritative JSONB;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot start a workout for another user';
  END IF;

  IF (public.train_template_capabilities()->'templates'->>'ready')::boolean THEN
    authoritative:=public.start_train_template_workout(p_user_id,(p_workout->>'routine_id')::uuid);
    IF authoritative->>'status'='started' THEN RETURN authoritative->'workout'; END IF;
    IF authoritative->>'status'='conflict' THEN RAISE unique_violation USING MESSAGE='An active workout already exists'; END IF;
    RAISE invalid_parameter_value USING MESSAGE='Template cannot be started';
  END IF;

  INSERT INTO public.workouts (
    user_id,
    title,
    status,
    started_at,
    routine_id
  )
  VALUES (
    p_user_id,
    p_workout->>'title',
    'in_progress',
    NOW(),
    (p_workout->>'routine_id')::UUID
  )
  RETURNING * INTO created_workout;

  FOR requested_exercise IN
    SELECT value FROM jsonb_array_elements(p_exercises)
  LOOP
    INSERT INTO public.workout_exercises (
      workout_id,
      exercise_id,
      sort_order,
      notes,
      rest_timer_seconds
    )
    VALUES (
      created_workout.id,
      (requested_exercise->'exercise'->>'exercise_id')::UUID,
      (requested_exercise->'exercise'->>'sort_order')::DOUBLE PRECISION,
      requested_exercise->'exercise'->>'notes',
      (requested_exercise->'exercise'->>'rest_timer_seconds')::INTEGER
    )
    RETURNING * INTO created_workout_exercise;

    FOR requested_set IN
      SELECT value FROM jsonb_array_elements(requested_exercise->'sets')
    LOOP
      PERFORM fitness_private.require_measurements(requested_set,'weight_kg','reps');
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
        created_workout_exercise.id,
        (requested_set->>'set_number')::INTEGER,
        requested_set->>'set_type',
        (requested_set->>'weight_kg')::NUMERIC,
        (requested_set->>'reps')::BIGINT,
        (requested_set->>'duration_seconds')::INTEGER,
        (requested_set->>'distance_meters')::NUMERIC,
        (requested_set->>'is_completed')::BOOLEAN,
        (requested_set->>'rpe')::SMALLINT
      );
    END LOOP;

    complete_exercises := complete_exercises || jsonb_build_array(
      to_jsonb(created_workout_exercise)
      || jsonb_build_object(
        'exercise',
        (
          SELECT to_jsonb(exercise_row)
          FROM public.exercises AS exercise_row
          WHERE exercise_row.id = created_workout_exercise.exercise_id
        ),
        'sets',
        COALESCE(
          (
            SELECT jsonb_agg(
              to_jsonb(workout_set_row)
              ORDER BY workout_set_row.set_number
            )
            FROM public.workout_sets AS workout_set_row
            WHERE workout_set_row.workout_exercise_id =
              created_workout_exercise.id
          ),
          '[]'::JSONB
        )
      )
    );
  END LOOP;

  complete_workout := to_jsonb(created_workout)
    || jsonb_build_object('exercises', complete_exercises);

  RETURN complete_workout;
END;
$$;


create or replace function public.mcp_workout_command(p_user_id uuid,p_operation text,p_request jsonb) returns jsonb
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
 elsif p_operation='start_train_template_workout' then
   routine:=(p_request->>'p_template_id')::uuid;
   if not exists(select 1 from public.routines where id=routine and user_id=p_user_id) then return jsonb_build_object('status','not_found'); end if;
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
 elsif p_operation='start_train_template_workout' then
   result:=public.start_train_template_workout(p_user_id,(p_request->>'p_template_id')::uuid);
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

-- These auth.uid()-checked helpers are reachable by the fixed service bridge,
-- never by a caller-selected generic function name.
grant execute on function fitness_private.start_template_workout(uuid,uuid),public.start_train_template_workout(uuid,uuid) to service_role;
-- The preserved invoker-based routine Start also reads the gate while the
-- fixed MCP bridge temporarily carries its verified owner's auth.uid().
grant execute on function fitness_private.template_capabilities(),public.train_template_capabilities() to service_role;
grant execute on function fitness_private.read_templates(uuid,uuid) to service_role;
create function public.mcp_read_train_templates(p_user_id uuid,p_after uuid default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare old_claims text:=current_setting('request.jwt.claims',true); old_subject text:=current_setting('request.jwt.claim.sub',true); result jsonb;
begin
 if current_user<>'service_role' then raise insufficient_privilege using message='Trusted template adapter required'; end if;
 if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then return jsonb_build_object('status','not_found'); end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_user_id::text,true);
 result:=fitness_private.read_templates(null,p_after);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(old_subject,''),true);
 return result;
exception when others then
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(old_subject,''),true);
 raise;
end $$;
revoke all on function public.mcp_read_train_templates(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mcp_read_train_templates(uuid,uuid) to service_role;
