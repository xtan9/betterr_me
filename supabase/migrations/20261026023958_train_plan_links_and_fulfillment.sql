-- Additive Train metadata. Existing workout documents and planner identities remain unchanged.
alter table public.planner_routine_schedules add column training_template_id uuid references public.routines(id) on delete set null;
create table fitness_private.training_occurrence_metadata(
 occurrence_id uuid primary key references public.recurring_task_occurrences(id) on delete cascade,
 planned_day date,
 template_overridden boolean not null default false,
 template_id uuid references public.routines(id) on delete set null
);
alter table fitness_private.training_occurrence_metadata enable row level security;
revoke all on fitness_private.training_occurrence_metadata from public,anon,authenticated,service_role;

-- Retain the last known placement when fulfillment releases its reservation.
create function planner_private.capture_training_placement() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare occurrence_id uuid; day date;
begin
 if tg_op='DELETE' then occurrence_id:=old.routine_occurrence_id; day:=old.start_date;
 else occurrence_id:=new.routine_occurrence_id; day:=new.start_date; end if;
 if occurrence_id is not null and exists(select 1 from public.recurring_task_occurrences o join public.planner_routine_schedules s on s.series_id=o.series_id
   where o.id=occurrence_id and s.activity_kind='training') then
  insert into fitness_private.training_occurrence_metadata(occurrence_id,planned_day) values(occurrence_id,day)
   on conflict on constraint training_occurrence_metadata_pkey do update set planned_day=excluded.planned_day;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function planner_private.capture_training_placement() from public,anon,authenticated,service_role;
create trigger capture_training_placement after insert or update or delete on public.calendar_events
 for each row execute function planner_private.capture_training_placement();
insert into fitness_private.training_occurrence_metadata(occurrence_id,planned_day)
 select o.id,e.start_date from public.recurring_task_occurrences o join public.planner_routine_schedules s on s.series_id=o.series_id
 join public.calendar_events e on e.routine_occurrence_id=o.id and e.user_id=s.user_id where s.activity_kind='training';

create function planner_private.training_plan(p_occurrence uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('ownerId',s.user_id,'occurrenceId',o.id,'seriesId',s.id,'taskId',t.id,
  'scheduledDate',o.scheduled_date,'plannedDay',coalesce(e.start_date,p.date,m.planned_day,
   case when o.state in ('open','extra') then o.scheduled_date end),
  'title',coalesce(t.title,o.details->>'title',''),'timezone',s.time_zone,'state',o.state,
  'completed',o.state='completed' or coalesce(t.is_completed,false),
  'templateId',case when coalesce(m.template_overridden,false) then m.template_id else r.training_template_id end,
  'version',jsonb_build_object('taskVersion',t.version,'occurrenceVersion',o.version,'seriesToken',s.revision_token,'eventVersion',e.version))
 from public.recurring_task_occurrences o join public.recurring_task_series s on s.id=o.series_id
 join public.planner_routine_schedules r on r.series_id=s.id and r.user_id=s.user_id and r.activity_kind='training'
 left join public.tasks t on t.id=o.task_id and t.user_id=s.user_id
 left join public.calendar_events e on e.routine_occurrence_id=o.id and e.user_id=s.user_id
 left join public.planner_routine_period_placements p on p.occurrence_id=o.id and p.user_id=s.user_id
 left join fitness_private.training_occurrence_metadata m on m.occurrence_id=o.id
 where o.id=p_occurrence and s.user_id=auth.uid();
$$;
revoke all on function planner_private.training_plan(uuid) from public,anon,authenticated,service_role;
-- Existing editors must distinguish an explicit occurrence defer from its
-- series default. Add one field; preserve every legacy row and snapshot key.
create or replace function public.planner_routine_snapshot_v2(p_date date) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare snapshot jsonb; rows jsonb;
begin
 snapshot:=planner_private.routine_snapshot_v2(p_date);
 if snapshot->>'status' is distinct from 'complete' then return snapshot; end if;
 select coalesce(jsonb_agg(case when row->'schedule'->>'activity_kind'='training' then
  jsonb_set(row,'{occurrence,training_template_id}',coalesce(planner_private.training_plan((row->'occurrence'->>'id')::uuid)->'templateId','null'))
  else row end order by position),'[]') into rows from jsonb_array_elements(snapshot->'rows') with ordinality values(row,position);
 return jsonb_set(snapshot,'{rows}',rows);
end $$;
-- The private resolver validates auth.uid and reveals only its owned occurrence.
grant execute on function planner_private.training_plan(uuid) to authenticated;

create function public.read_train_plans(p_date date default null,p_occurrence_id uuid default null,p_after uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); plan jsonb; rows jsonb; has_more boolean;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if p_occurrence_id is not null then
  plan:=planner_private.training_plan(p_occurrence_id);
  if plan is null then return jsonb_build_object('status','not_found'); end if;
  return jsonb_build_object('protocolVersion',1,'plan',plan);
 end if;
 if p_date is null then return jsonb_build_object('status','invalid_request'); end if;
 perform public.planner_routine_snapshot_v2(p_date);
 select coalesce(jsonb_agg(value order by id),'[]') into rows from (
  select o.id,planner_private.training_plan(o.id) value from public.recurring_task_occurrences o join public.recurring_task_series s on s.id=o.series_id
   join public.planner_routine_schedules r on r.series_id=s.id and r.user_id=owner and r.activity_kind='training'
  where s.user_id=owner and (p_after is null or o.id>p_after)
   and planner_private.training_plan(o.id)->>'plannedDay'=p_date::text order by o.id limit 101
 ) scanned;
 has_more:=jsonb_array_length(rows)>100;
 return jsonb_build_object('protocolVersion',1,'ownerId',owner,'plans',case when has_more then rows-100 else rows end,
  'nextCursor',case when has_more then rows->99->>'occurrenceId' end);
end $$;
revoke all on function public.read_train_plans(date,uuid,uuid) from public,anon,service_role;
grant execute on function public.read_train_plans(date,uuid,uuid) to authenticated;

alter function planner_private.routine_command(jsonb) rename to routine_before_training_template_command;
create function planner_private.routine_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); operation uuid; template uuid; prior public.planner_command_receipts; result jsonb; source uuid;
begin
 if not p_request ? 'trainingTemplateId' then return planner_private.routine_before_training_template_command(p_request); end if;
 if owner is null then return jsonb_build_object('status','not-found'); end if;
 if p_request->>'operation' not in ('create','edit') or jsonb_typeof(p_request->'trainingTemplateId') not in ('string','null') then return jsonb_build_object('status','invalid'); end if;
 operation:=(p_request->>'operationId')::uuid; template:=(p_request->>'trainingTemplateId')::uuid;
 if operation is null then return jsonb_build_object('status','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':planner:'||operation::text,0));
 select * into prior from public.planner_command_receipts where user_id=owner and operation_id=operation;
 if found then
  if prior.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
  return jsonb_set(prior.outcome,'{status}','"already-applied"');
 end if;
 if template is not null and not exists(select 1 from public.routines where id=template and user_id=owner) then return jsonb_build_object('status','not-found'); end if;
 if p_request->>'operation'='create' then
  if p_request->>'activityKind' is distinct from 'training' then return jsonb_build_object('status','invalid'); end if;
 else
  if not exists(select 1 from public.planner_routine_schedules where series_id=(p_request->>'seriesId')::uuid and user_id=owner and activity_kind='training') then return jsonb_build_object('status','not-found'); end if;
 end if;
 result:=planner_private.routine_before_training_template_command(p_request-'trainingTemplateId');
 if result->>'status' not in ('complete','already-applied') then return result; end if;
 if p_request->>'operation'='create' then
  source:=(result->>'seriesId')::uuid;
  update public.planner_routine_schedules set training_template_id=template where series_id=source and user_id=owner;
 else
  insert into fitness_private.training_occurrence_metadata(occurrence_id,template_overridden,template_id)
   values((p_request->>'occurrenceId')::uuid,true,template)
   on conflict on constraint training_occurrence_metadata_pkey do update set template_overridden=true,template_id=excluded.template_id;
  update public.recurring_task_occurrences set version=gen_random_uuid() where id=(p_request->>'occurrenceId')::uuid;
 end if;
 update public.planner_command_receipts set request=p_request where user_id=owner and operation_id=operation;
 return result;
exception when invalid_text_representation or check_violation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.routine_command(jsonb) from public,anon,service_role;
grant execute on function planner_private.routine_command(jsonb) to authenticated;
create or replace function public.planner_routine_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select planner_private.routine_command(p_request)$$;

create table public.train_workout_plan_links(
 workout_id uuid primary key references public.workouts(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 occurrence_id uuid references public.recurring_task_occurrences(id) on delete set null,
 captured_occurrence_id uuid not null,
 linked_at timestamptz not null default clock_timestamp()
);
alter table public.train_workout_plan_links enable row level security;
revoke all on public.train_workout_plan_links from public,anon,authenticated,service_role;
-- Trusted Assistant detail reads use an explicit owned workout query. Service
-- receives read access only; all link mutation remains inside the auth.uid RPC.
grant select on public.train_workout_plan_links to authenticated,service_role;
create policy train_workout_plan_owner on public.train_workout_plan_links for select to authenticated using((select auth.uid())=owner_id);
create table public.train_plan_command_outcomes(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 operation_id uuid not null,
 request jsonb not null,
 receipt jsonb,
 rejection jsonb,
 primary key(owner_id,operation_id),check((receipt is null)<>(rejection is null))
);
alter table public.train_plan_command_outcomes enable row level security;
revoke all on public.train_plan_command_outcomes from public,anon,authenticated,service_role;
grant select on public.train_plan_command_outcomes to authenticated;
create policy train_plan_outcome_owner on public.train_plan_command_outcomes for select to authenticated using((select auth.uid())=owner_id);

create function fitness_private.training_workout_link(p_workout uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('ownerId',l.owner_id,'workoutId',l.workout_id,'occurrenceId',l.captured_occurrence_id,'linkedAt',l.linked_at,
  'current',case when l.occurrence_id is not null then planner_private.training_plan(l.occurrence_id) end)
 from public.train_workout_plan_links l join public.workouts w on w.id=l.workout_id and w.user_id=l.owner_id
 where l.workout_id=p_workout and l.owner_id=auth.uid();
$$;
revoke all on function fitness_private.training_workout_link(uuid) from public,anon,authenticated,service_role;
create function public.read_train_workout_link(p_workout_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then return jsonb_build_object('status','unauthenticated'); end if;
 if not exists(select 1 from public.workouts where id=p_workout_id and user_id=auth.uid() and status='completed') then return jsonb_build_object('status','not_found'); end if;
 return jsonb_build_object('protocolVersion',1,'link',fitness_private.training_workout_link(p_workout_id));
end $$;
revoke all on function public.read_train_workout_link(uuid) from public,anon,service_role;
grant execute on function public.read_train_workout_link(uuid) to authenticated;

create function fitness_private.execute_train_plan_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
<<plan_command>>
declare owner uuid:=auth.uid(); operation_id uuid; command jsonb:=p_request->'command'; kind text:=command->>'kind'; occurrence_id uuid; workout_id uuid;
 prior public.train_plan_command_outcomes; series public.recurring_task_series; occurrence public.recurring_task_occurrences;
 task public.tasks; link public.train_workout_plan_links; plan jsonb; preview jsonb; result jsonb; receipt jsonb; rejection jsonb; code text;
 uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if p_request->>'ownerId' is distinct from owner::text then return jsonb_build_object('status','owner_mismatch'); end if;
 if not coalesce(fitness_private.exact_keys(p_request,array['protocolVersion','ownerId','operationId','command']),false)
  or p_request->'protocolVersion' is distinct from '1'::jsonb or p_request->>'operationId' !~ uuid_pattern
  or not coalesce(fitness_private.exact_keys(command,case kind when 'link-workout' then array['kind','workoutId','occurrenceId'] when 'fulfill-plan' then array['kind','occurrenceId','expected'] else array[]::text[] end),false)
  or coalesce(kind,'') not in ('link-workout','fulfill-plan') or command->>'occurrenceId' !~ uuid_pattern
  or kind='link-workout' and command->>'workoutId' !~ uuid_pattern then return jsonb_build_object('status','invalid_request'); end if;
 operation_id:=(p_request->>'operationId')::uuid; occurrence_id:=(command->>'occurrenceId')::uuid; workout_id:=(command->>'workoutId')::uuid;
 if operation_id is null or occurrence_id is null or kind='link-workout' and workout_id is null then return jsonb_build_object('status','invalid_request'); end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':train:plan:'||operation_id::text,0));
 select * into prior from public.train_plan_command_outcomes o where o.owner_id=owner and o.operation_id=plan_command.operation_id;
 if found then
  if prior.request is distinct from p_request then return jsonb_build_object('status','operation_conflict'); end if;
  return case when prior.receipt is not null then jsonb_build_object('status','accepted','receipt',prior.receipt)
   else jsonb_build_object('status',prior.rejection->>'code','rejection',prior.rejection) end;
 end if;
 select s.* into series from public.recurring_task_series s join public.recurring_task_occurrences o on o.series_id=s.id
  join public.planner_routine_schedules r on r.series_id=s.id and r.user_id=owner and r.activity_kind='training'
  where s.user_id=owner and o.id=occurrence_id for update of s;
 if not found then code:='not_found';
 else
  select * into occurrence from public.recurring_task_occurrences o where o.id=occurrence_id and o.series_id=series.id for update;
  select * into task from public.tasks t where t.id=occurrence.task_id and t.user_id=owner for update;
  perform 1 from public.calendar_events where routine_occurrence_id=occurrence.id and user_id=owner order by id for update;
  plan:=planner_private.training_plan(occurrence.id);
 end if;
 if kind='fulfill-plan' and (not coalesce(fitness_private.exact_keys(command->'expected',array['taskVersion','occurrenceVersion','seriesToken','eventVersion']),false)
  or jsonb_typeof(command->'expected'->'occurrenceVersion') is distinct from 'string' or command->'expected'->>'occurrenceVersion' !~ uuid_pattern
  or jsonb_typeof(command->'expected'->'taskVersion') not in ('string','null')
  or jsonb_typeof(command->'expected'->'eventVersion') not in ('string','null')
  or command->'expected'->>'taskVersion' is not null and command->'expected'->>'taskVersion' !~ uuid_pattern
  or command->'expected'->>'eventVersion' is not null and command->'expected'->>'eventVersion' !~ uuid_pattern
  or not coalesce(fitness_private.valid_measure(command->'expected'->'seriesToken',true,1),false)) then
  return jsonb_build_object('status','invalid_request');
 end if;
 if code is null and kind='link-workout' then
  perform 1 from public.workouts w where w.id=workout_id and w.user_id=owner and w.status='completed' for update;
  if not found then code:='not_found';
  else
   select * into link from public.train_workout_plan_links l where l.workout_id=plan_command.workout_id;
   if found and (link.owner_id<>owner or link.captured_occurrence_id<>occurrence_id) then code:='link_conflict';
   else
    if link.workout_id is null then
     insert into public.train_workout_plan_links(workout_id,owner_id,occurrence_id,captured_occurrence_id)
      values(workout_id,owner,occurrence_id,occurrence_id) returning * into link;
    end if;
    receipt:=jsonb_build_object('operation','link-workout','operationId',operation_id,'ownerId',owner,'workoutId',workout_id,
     'occurrenceId',occurrence_id,'linkedAt',link.linked_at,'acceptedAt',clock_timestamp());
   end if;
  end if;
 elsif code is null then
  if not coalesce(fitness_private.exact_keys(command->'expected',array['taskVersion','occurrenceVersion','seriesToken','eventVersion']),false) then code:='invalid_request';
  elsif plan->'completed'='true'::jsonb then
   receipt:=jsonb_build_object('operation','fulfill-plan','operationId',operation_id,'ownerId',owner,'occurrenceId',occurrence_id,
    'outcome','already-completed','changeId',null,'completedAt',coalesce(task.completed_at,occurrence.completed_at),'acceptedAt',clock_timestamp());
  elsif occurrence.state not in ('open','extra') or task.id is null then code:='unavailable_occurrence';
  elsif plan->'version' is distinct from command->'expected' then code:='changed';
  else
   preview:=public.planner_completion_preview(task.id);
   result:=public.planner_command(jsonb_build_object('operation','complete','operationId',operation_id,'taskId',task.id,
    'expectedVersion',task.version,'occurrenceVersion',occurrence.version,'seriesToken',series.revision_token,'plan',preview->'plan'));
   if result->>'status' not in ('complete','already-applied') or result->>'changeId' is null then
    -- Never persist an invented success when the authoritative planner did not acknowledge it.
    raise exception using errcode='40001',message='Planner completion was not acknowledged';
   end if;
   select * into task from public.tasks where id=task.id and user_id=owner;
   receipt:=jsonb_build_object('operation','fulfill-plan','operationId',operation_id,'ownerId',owner,'occurrenceId',occurrence_id,
    'outcome','completed','changeId',result->>'changeId','completedAt',task.completed_at,'acceptedAt',clock_timestamp());
  end if;
 end if;
 if code is not null then
  rejection:=jsonb_build_object('operationId',operation_id,'operation',kind,'ownerId',owner,'occurrenceId',occurrence_id,'rejectedAt',clock_timestamp(),'code',code);
  if kind='link-workout' then rejection:=rejection||jsonb_build_object('workoutId',workout_id); end if;
  if code='changed' then rejection:=rejection||jsonb_build_object('current',plan); end if;
  insert into public.train_plan_command_outcomes values(owner,operation_id,p_request,null,rejection);
  return jsonb_build_object('status',code,'rejection',rejection);
 end if;
 insert into public.train_plan_command_outcomes values(owner,operation_id,p_request,receipt,null);
 return jsonb_build_object('status','accepted','receipt',receipt);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;
revoke all on function fitness_private.execute_train_plan_command(jsonb) from public,anon,service_role;
grant execute on function fitness_private.execute_train_plan_command(jsonb) to authenticated;
create function public.execute_train_plan_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select fitness_private.execute_train_plan_command(p_request)$$;
revoke all on function public.execute_train_plan_command(jsonb) from public,anon,service_role;
grant execute on function public.execute_train_plan_command(jsonb) to authenticated;

-- The cursor covers the whole scanned day page; unsupported documents can be
-- isolated by the typed reader without falsely claiming that the day is exhausted.
create function public.read_train_workout_day(p_day date,p_before jsonb default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); rows jsonb; more boolean; before_time timestamptz; before_id uuid;
begin
 if owner is null then return jsonb_build_object('status','unauthenticated'); end if;
 if p_day is null then return jsonb_build_object('status','invalid_request'); end if;
 if p_before is not null and p_before<>'null'::jsonb then
  if not coalesce(fitness_private.exact_keys(p_before,array['startedAt','id']),false) then return jsonb_build_object('status','invalid_request'); end if;
  before_time:=(p_before->>'startedAt')::timestamptz; before_id:=(p_before->>'id')::uuid;
  if before_time is null or before_id is null then return jsonb_build_object('status','invalid_request'); end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('record',to_jsonb(w),'link',fitness_private.training_workout_link(w.id)) order by w.started_at desc,w.id desc),'[]') into rows
 from (select * from public.workouts where user_id=owner and status='completed'
  and coalesce(native_completion,recorded_completion)->>'workoutDay'=p_day::text
  and (before_time is null or (started_at,id)<(before_time,before_id)) order by started_at desc,id desc limit 21) w;
 more:=jsonb_array_length(rows)>20;
 return jsonb_build_object('protocolVersion',1,'ownerId',owner,'day',p_day,'workouts',case when more then rows-20 else rows end,
  'nextCursor',case when more then jsonb_build_object('startedAt',rows->19->'record'->>'started_at','id',rows->19->'record'->>'id') end);
exception when invalid_text_representation or datetime_field_overflow then return jsonb_build_object('status','invalid_request');
end $$;
revoke all on function public.read_train_workout_day(date,jsonb) from public,anon,service_role;
grant execute on function public.read_train_workout_day(date,jsonb) to authenticated;
