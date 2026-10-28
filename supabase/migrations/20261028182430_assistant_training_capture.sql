-- A training intention can name a day without reserving a clock interval.
-- Keep its identity in the existing occurrence ledger, bounded to one occurrence.
alter table public.planner_routine_schedules drop constraint routine_timing_valid,
 add constraint routine_timing_valid check (
  (timing_mode='time' and start_time is not null and end_time is not null and cardinality(periods)=0)
  or (timing_mode='period' and start_time is null and end_time is null and not is_protected and planner_private.valid_routine_periods(periods))
  or (timing_mode='anytime' and start_time is null and end_time is null and not is_protected and cardinality(periods)=0
    and activity_kind='training' and repeat_mode='once'));
alter table public.planner_routine_schedule_revisions drop constraint routine_revision_timing_valid,
 add constraint routine_revision_timing_valid check (
  (timing_mode='time' and start_time is not null and end_time is not null and cardinality(periods)=0)
  or (timing_mode='period' and start_time is null and end_time is null and not is_protected and planner_private.valid_routine_periods(periods))
  or (timing_mode='anytime' and start_time is null and end_time is null and not is_protected and cardinality(periods)=0));

alter function planner_private.routine_command(jsonb) rename to routine_before_anytime_command;
create function planner_private.routine_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
<<training_command>>
declare owner uuid:=auth.uid(); operation_id uuid; prior public.planner_command_receipts;
 result jsonb; outcome jsonb; source_id uuid; occurrence_id uuid; day date; zone text; template uuid;
 series public.recurring_task_series; occurrence public.recurring_task_occurrences; task public.tasks;
begin
 if owner is null then return jsonb_build_object('status','not-found');end if;
 if jsonb_typeof(p_request) is distinct from 'object' then return jsonb_build_object('status','invalid');end if;
 if p_request->>'timingMode' is distinct from 'anytime' then
  if p_request->>'operation' in ('edit','skip') and exists(select 1 from public.planner_routine_schedules
    where series_id=(p_request->>'seriesId')::uuid and user_id=owner and timing_mode='anytime') then
   return jsonb_build_object('status','unsupported');end if;
  return planner_private.routine_before_anytime_command(p_request);
 end if;
 operation_id:=(p_request->>'operationId')::uuid;
 if operation_id is null or p_request->>'operation' not in ('create','edit','skip') then return jsonb_build_object('status','invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':planner:'||operation_id::text,0));
 select r.* into prior from public.planner_command_receipts r where r.user_id=owner and r.operation_id=training_command.operation_id;
 if found then
  if prior.request is distinct from p_request then return jsonb_build_object('status','conflict');end if;
  return jsonb_set(prior.outcome,'{status}','"already-applied"');
 end if;
 if p_request->>'operation'='create' then
  if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','title','date','timezone','timingMode','activityKind','repeatMode','rule','steps','trainingTemplateId'))
   or p_request->>'activityKind' is distinct from 'training' or p_request->>'repeatMode' is distinct from 'once'
   or p_request->'rule' is distinct from '{"frequency":"daily","interval":1}'::jsonb then return jsonb_build_object('status','invalid');end if;
 else
  if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','timingMode','seriesId','occurrenceId','expectedSeriesToken','expectedOccurrenceVersion','expectedTaskVersion','expectedEventVersion','title','date','steps','trainingTemplateId'))
   then return jsonb_build_object('status','invalid');end if;
  select s.* into series from public.recurring_task_series s join public.planner_routine_schedules r on r.series_id=s.id
   where s.id=(p_request->>'seriesId')::uuid and s.user_id=owner and r.user_id=owner and r.timing_mode='anytime' and r.activity_kind='training' and r.repeat_mode='once' for update of s;
  if not found then return jsonb_build_object('status','not-found');end if;
  select * into occurrence from public.recurring_task_occurrences where id=(p_request->>'occurrenceId')::uuid and series_id=series.id for update;
  if not found then return jsonb_build_object('status','not-found');end if;
  select * into task from public.tasks where id=occurrence.task_id and user_id=owner for update;
  if not found then return jsonb_build_object('status','not-found');end if;
  if series.revision_token is distinct from (p_request->>'expectedSeriesToken')::integer
   or occurrence.version is distinct from (p_request->>'expectedOccurrenceVersion')::uuid
   or task.version is distinct from (p_request->>'expectedTaskVersion')::uuid or p_request->>'expectedEventVersion' is not null
   then return jsonb_build_object('status','conflict');end if;
  if occurrence.state not in ('open','extra') then return jsonb_build_object('status','unsupported');end if;
 end if;
 if p_request->>'operation'<>'skip' then
  if jsonb_typeof(p_request->'title') is distinct from 'string' or length(btrim(p_request->>'title')) not between 1 and 100
   or coalesce(p_request->>'date','')!~'^\d{4}-\d{2}-\d{2}$'
   or p_request ? 'steps' and not planner_private.valid_steps(p_request->'steps') then return jsonb_build_object('status','invalid');end if;
  day:=(p_request->>'date')::date;zone:=coalesce(series.time_zone,p_request->>'timezone');
  if not exists(select 1 from pg_timezone_names where name=zone) then return jsonb_build_object('status','invalid');end if;
  if p_request ? 'trainingTemplateId' then
   if jsonb_typeof(p_request->'trainingTemplateId') not in ('string','null') then return jsonb_build_object('status','invalid');end if;
   template:=(p_request->>'trainingTemplateId')::uuid;
   if template is not null and not exists(select 1 from public.routines where id=template and user_id=owner and archived_at is null) then return jsonb_build_object('status','not-found');end if;
  end if;
 end if;
 if p_request->>'operation'='create' then
  result:=public.recurring_task_lifecycle('create-series',jsonb_build_object('userId',owner,'idempotencyKey',operation_id,
   'recurrenceRule',p_request->'rule','recurrenceAnchor',day,'activationDate',day,'timeZone',zone,'occurrenceLimit',1,'lastScheduledDate',day,
   'defaults',jsonb_build_object('title',btrim(p_request->>'title'),'dueTime',null,'steps',coalesce(p_request->'steps','[]'::jsonb))));
  if result->>'status' not in ('complete','already-applied') then return result;end if;
  source_id:=(result->'series'->>'id')::uuid;
  insert into public.planner_routine_schedules(series_id,user_id,timing_mode,periods,is_protected,activity_kind,repeat_mode,training_template_id)
   values(source_id,owner,'anytime','{}',false,'training','once',template);
  perform planner_private.routine_snapshot_v2(day);
  select id into occurrence_id from public.recurring_task_occurrences where series_id=source_id and scheduled_date=day and scheduled_period='';
  if occurrence_id is null then raise exception using errcode='PT409',message='Training occurrence was not materialized';end if;
  insert into fitness_private.training_occurrence_metadata(occurrence_id,planned_day) values(occurrence_id,day)
   on conflict on constraint training_occurrence_metadata_pkey do update set planned_day=excluded.planned_day;
 else
  result:=public.recurring_task_lifecycle(case when p_request->>'operation'='skip' then 'skip-occurrence' else 'edit-occurrence' end,
   jsonb_build_object('userId',owner,'seriesId',series.id,'occurrenceId',occurrence.id,'taskId',task.id,'scope','this','scheduledDate',occurrence.scheduled_date,
    'expectedTaskVersion',task.version,'expectedRevisionToken',series.revision_token,'expectedRevisionId',occurrence.revision_id,'idempotencyKey',operation_id,
    'updates',jsonb_build_object('title',btrim(p_request->>'title'))));
  if result->>'status' not in ('complete','already-applied') then return result;end if;
  source_id:=series.id;occurrence_id:=occurrence.id;
  if p_request->>'operation'='edit' then
   insert into fitness_private.training_occurrence_metadata(occurrence_id,planned_day) values(occurrence_id,day)
    on conflict on constraint training_occurrence_metadata_pkey do update set planned_day=excluded.planned_day;
   if p_request ? 'trainingTemplateId' then
    update fitness_private.training_occurrence_metadata set template_overridden=true,template_id=template where training_occurrence_metadata.occurrence_id=training_command.occurrence_id;
   end if;
   if p_request ? 'steps' then
    result:=planner_private.change_task_steps(task.id,p_request->'steps');
    if result->>'status'<>'complete' then raise exception using errcode='PT409',message='Training steps changed';end if;
   end if;
  end if;
 end if;
 outcome:=jsonb_build_object('status','complete','seriesId',source_id,'occurrenceId',occurrence_id);
 insert into public.planner_command_receipts values(owner,operation_id,p_request,outcome);
 return outcome;
exception when sqlstate 'PT409' or unique_violation then return jsonb_build_object('status','conflict');
 when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or check_violation or not_null_violation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.routine_command(jsonb) from public,anon,service_role;
grant execute on function planner_private.routine_command(jsonb) to authenticated;
create or replace function public.planner_routine_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select planner_private.routine_command(p_request)$$;

-- Moved date-only plans retain their immutable scheduled position. Their
-- visible placement is owned by Train metadata and never becomes a clock event.
do $$ declare source text; anchor text;begin
 source:=pg_get_functiondef('planner_private.routine_snapshot_v2(date)'::regprocedure);
 anchor:='coalesce(p.date,o.scheduled_date)';
 if position(anchor in source)=0 then raise exception 'Routine date projection missing';end if;
 source:=replace(source,anchor,'coalesce(p.date,m.planned_day,o.scheduled_date)');
 anchor:='left join public.planner_routine_period_placements p on p.occurrence_id=o.id and p.user_id=owner_id';
 if position(anchor in source)=0 then raise exception 'Routine placement join missing';end if;
 source:=replace(source,anchor,anchor||' left join fitness_private.training_occurrence_metadata m on m.occurrence_id=o.id and r.timing_mode=''anytime''');
 source:=replace(source,'''timeIssue'',o.scheduled_period='''' and','''timeIssue'',h.timing_mode=''time'' and o.scheduled_period='''' and');
 execute source;
 source:=pg_get_functiondef('planner_private.routine_series_preview(jsonb)'::regprocedure);
 anchor:='select * into schedule from public.planner_routine_schedules where series_id=series.id and user_id=auth.uid();';
 if position(anchor in source)=0 then raise exception 'Routine series schedule guard missing';end if;
 source:=replace(source,anchor,anchor||' if schedule.timing_mode=''anytime'' then return jsonb_build_object(''status'',''unsupported'');end if;');
 execute source;
end $$;

-- Keep native training edits as immutable replacement previews, with the same
-- all-or-nothing turn/history/supersession contract as ordinary task edits.
alter function planner_private.ai_revise_capture(jsonb) rename to ai_revise_before_training;
create function planner_private.ai_revise_capture(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner uuid:=auth.uid(); request_id uuid; conversation uuid; source_id uuid; fingerprint text;
 source public.planner_ai_proposals; prior public.assistant_turns; template public.routines;
 item jsonb; changes jsonb; body jsonb; stored jsonb; begun jsonb; finished jsonb; message text; user_message text;
begin
 if owner is null then return jsonb_build_object('status','not-found');end if;
 source_id:=(p_request->>'proposalId')::uuid;
 select * into source from public.planner_ai_proposals where id=source_id and user_id=owner;
 if source.body->'items'->0->>'kind' is distinct from 'training-create' then
  return planner_private.ai_revise_before_training(p_request-'supportsTrainingPlans');
 end if;
 if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>8192
  or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('requestId','conversationId','proposalId','expectedVersion','locale','changes','supportsTrainingPlans'))
  or exists(select 1 from unnest(array['requestId','conversationId','proposalId','expectedVersion','locale']) k where jsonb_typeof(p_request->k) is distinct from 'string')
  or p_request->'supportsTrainingPlans' is distinct from 'true'::jsonb or p_request->>'locale' not in ('en','zh')
  or jsonb_typeof(p_request->'changes') is distinct from 'object' then return jsonb_build_object('status','invalid');end if;
 request_id:=(p_request->>'requestId')::uuid;conversation:=(p_request->>'conversationId')::uuid;
 if request_id=source_id or request_id is null or conversation is null or (p_request->>'expectedVersion')::uuid is null then return jsonb_build_object('status','invalid');end if;
 changes:=p_request->'changes';
 if exists(select 1 from jsonb_object_keys(changes) k where k not in ('title','date','timezone','trainingTemplateId','startTime','endTime'))
  or exists(select 1 from unnest(array['title','date','timezone']) k where jsonb_typeof(changes->k) is distinct from 'string')
  or not changes ? 'trainingTemplateId' or jsonb_typeof(changes->'trainingTemplateId') not in ('null','string')
  or (changes ? 'startTime') is distinct from (changes ? 'endTime') then return jsonb_build_object('status','invalid');end if;
 fingerprint:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':assistant',0));
 select * into prior from public.assistant_turns where user_id=owner and id=request_id;
 if found then
  if prior.request_fingerprint is distinct from fingerprint or prior.conversation_id<>conversation then return jsonb_build_object('status','conflict');end if;
  if prior.response is not null then return jsonb_build_object('status','complete','response',prior.response);end if;
 end if;
 perform 1 from public.planner_state_versions where user_id=owner for update;
 select * into source from public.planner_ai_proposals where id=source_id and user_id=owner for update;
 if not found then return jsonb_build_object('status','not-found');end if;
 if source.state<>'pending' or source.version is distinct from (p_request->>'expectedVersion')::uuid then return jsonb_build_object('status','conflict');end if;
 if source.proposal_type<>'capture' or jsonb_array_length(source.body->'items')<>1 then return jsonb_build_object('status','unsupported');end if;
 if not exists(select 1 from public.assistant_turns where id=source.id and user_id=owner and conversation_id=conversation and response is not null) then return jsonb_build_object('status','not-found');end if;
 item:=source.body->'items'->0;
 changes:=((item->'changes')-'trainingTemplateVersion'-'trainingTemplateName')||changes;
 if changes->'startTime'='null'::jsonb and changes->'endTime'='null'::jsonb then changes:=changes-'startTime'-'endTime'-'protected';
 elsif changes ? 'startTime' then changes:=changes||jsonb_build_object('protected',coalesce(item->'changes'->'protected','true'::jsonb));end if;
 if changes->>'trainingTemplateId' is not null then
  select * into template from public.routines where id=(changes->>'trainingTemplateId')::uuid and user_id=owner and archived_at is null for share;
  if not found then return jsonb_build_object('status','conflict');end if;
  changes:=changes||jsonb_build_object('trainingTemplateVersion',template.version::text,'trainingTemplateName',template.name);
 end if;
 if not planner_private.training_capture_valid(changes) then return jsonb_build_object('status','invalid');end if;
 if planner_private.training_capture_past(changes) then return jsonb_build_object('status','past-time');end if;
 item:=jsonb_set(item,'{changes}',changes);
 message:=case when p_request->>'locale'='zh' then '请确认更新后的训练计划。' else 'Review the updated training plan.' end;
 user_message:=case when p_request->>'locale'='zh' then '修改训练计划。' else 'Edit the training plan.' end;
 body:=jsonb_build_object('message',message,'items',jsonb_build_array(item));
 stored:=planner_private.ai_store_proposal(request_id,fingerprint,body);
 if stored->>'status'='invalid' then raise exception using errcode='22023',message='Invalid training revision';end if;
 if stored->>'status' is distinct from 'complete' then raise exception using errcode='PT409',message='Training revision changed';end if;
 begun:=planner_private.assistant_begin_turn(request_id,conversation,false,fingerprint,jsonb_build_array(jsonb_build_object('role','user','content',user_message)));
 if begun->>'status' is distinct from 'prepared' then raise exception using errcode='PT409',message='Conversation changed';end if;
 finished:=planner_private.assistant_finish_turn(request_id,fingerprint,jsonb_build_object('message',message,'intent','capture','planning',null,
  'missing','[]'::jsonb,'ui','{"quickReplies":[]}'::jsonb,'memoryUpdates','[]'::jsonb,'capture',body,
  'supersedeCapture',jsonb_build_object('proposalId',source.id,'version',source.version)));
 if finished->>'status' is distinct from 'complete' then raise exception using errcode='PT409',message='Training revision could not be recorded';end if;
 return finished;
exception when sqlstate 'PT409' or integrity_constraint_violation or serialization_failure or deadlock_detected then return jsonb_build_object('status','conflict');
 when invalid_text_representation or invalid_parameter_value or datetime_field_overflow or invalid_datetime_format then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.ai_revise_capture(jsonb) from public,anon,service_role;
grant execute on function planner_private.ai_revise_capture(jsonb) to authenticated;
create or replace function public.planner_ai_revise_capture(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select planner_private.ai_revise_capture(p_request)$$;
create or replace function public.planner_routine_snapshot(p_date date) returns jsonb
language sql security invoker set search_path=pg_catalog as $$
 select result||jsonb_build_object('rows',coalesce((select jsonb_agg(row) from jsonb_array_elements(result->'rows') row
  where row->'schedule'->>'timing_mode'='time'),'[]')) from (select planner_private.routine_snapshot_v2(p_date) result) snapshot
$$;
alter function planner_private.routine_series_snapshot_v2() rename to routine_series_snapshot_before_anytime;
create function planner_private.routine_series_snapshot_v2() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; rows jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('status','not-found');end if;
 result:=planner_private.routine_series_snapshot_before_anytime();
 select coalesce(jsonb_agg(case when row->>'timingMode'='anytime' then row||jsonb_build_object(
  'nextDate',p.day,'nextPeriod',null,'nextStartTime',null,'nextStartInstant',null,
  'nextReason',case when p.day is null then 'ended' else null end) else row end order by ordinal),'[]') into rows
 from jsonb_array_elements(result->'rows') with ordinality records(row,ordinal)
 left join lateral (select (planner_private.training_plan(o.id)->>'plannedDay')::date as day
  from public.recurring_task_occurrences o join public.recurring_task_series s on s.id=o.series_id and s.user_id=auth.uid()
  where o.series_id=(row->>'id')::uuid and o.state in ('open','extra')
  order by 1 limit 1) p on row->>'timingMode'='anytime';
 return jsonb_set(result,'{rows}',rows);
end $$;
revoke all on function planner_private.routine_series_snapshot_v2() from public,anon,service_role;
grant execute on function planner_private.routine_series_snapshot_v2() to authenticated;
create or replace function public.planner_routine_series_snapshot_v2() returns jsonb
language sql security invoker set search_path=pg_catalog as $$select planner_private.routine_series_snapshot_v2()$$;

create function planner_private.training_capture_schedule(changes jsonb) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select case when changes ? 'startTime' then jsonb_build_object('startDate',changes->>'date','startTime',changes->>'startTime',
  'endDate',changes->>'date',
  'endTime',changes->>'endTime','timezone',changes->>'timezone','durationSource','explicit') end
$$;
create function planner_private.training_capture_valid(changes jsonb) returns boolean
language plpgsql stable set search_path=pg_catalog as $$
declare day date; template uuid;
begin
 if jsonb_typeof(changes) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(changes) k where k not in ('title','date','timezone','trainingTemplateId','trainingTemplateVersion','trainingTemplateName','startTime','endTime','protected'))
  or exists(select 1 from unnest(array['title','date','timezone']) k where jsonb_typeof(changes->k) is distinct from 'string')
  or length(btrim(changes->>'title')) not between 1 and 100 or changes->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
  or not changes ? 'trainingTemplateId' or jsonb_typeof(changes->'trainingTemplateId') not in ('null','string')
  or not exists(select 1 from pg_timezone_names where name=changes->>'timezone') then return false;end if;
 day:=(changes->>'date')::date;template:=(changes->>'trainingTemplateId')::uuid;
 if template is null then
  if changes ? 'trainingTemplateVersion' or changes ? 'trainingTemplateName' then return false;end if;
 elsif jsonb_typeof(changes->'trainingTemplateVersion') is distinct from 'string' or (changes->>'trainingTemplateVersion')!~'^[1-9][0-9]{0,18}$' or (changes->>'trainingTemplateVersion')::numeric>9223372036854775807
  or jsonb_typeof(changes->'trainingTemplateName') is distinct from 'string' or length(btrim(changes->>'trainingTemplateName'))=0 then return false;end if;
 if changes ? 'startTime' or changes ? 'endTime' or changes ? 'protected' then
  if jsonb_typeof(changes->'startTime') is distinct from 'string' or jsonb_typeof(changes->'endTime') is distinct from 'string'
   or jsonb_typeof(changes->'protected') is distinct from 'boolean' or changes->>'endTime'<=changes->>'startTime'
   or not planner_private.timed_task_schedule_valid(planner_private.training_capture_schedule(changes),'{}') then return false;end if;
 end if;
 return true;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or invalid_parameter_value then return false;
end $$;
create function planner_private.training_capture_template_current(changes jsonb) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and (changes->>'trainingTemplateId' is null or exists(select 1 from public.routines
  where id=(changes->>'trainingTemplateId')::uuid and user_id=auth.uid() and archived_at is null
   and version::text=changes->>'trainingTemplateVersion' and name=changes->>'trainingTemplateName'
   and (fitness_private.template_read(id)->'startability'->>'ready')::boolean))
$$;
create function planner_private.training_capture_past(changes jsonb) returns boolean
language sql stable set search_path=pg_catalog as $$
 select case when changes ? 'startTime' then
  ((changes->>'date')::date+(changes->>'startTime')::time) at time zone (changes->>'timezone')<statement_timestamp()
  else (changes->>'date')::date<(statement_timestamp() at time zone (changes->>'timezone'))::date end
$$;
revoke all on function planner_private.training_capture_schedule(jsonb),planner_private.training_capture_valid(jsonb),
 planner_private.training_capture_template_current(jsonb),planner_private.training_capture_past(jsonb) from public,anon,authenticated,service_role;

-- Extend the existing capture boundary: exact previews, atomic multi-item
-- acceptance, and the same durable operation receipts remain authoritative.
do $$ declare source text;anchor text;begin
 source:=pg_get_functiondef('planner_private.ai_store_proposal(uuid,text,jsonb)'::regprocedure);
 anchor:='(''task-create'',''task-edit'',''project-create'',''project-edit'',''routine-create'')';
 if position(anchor in source)=0 then raise exception 'Capture kind validation missing';end if;
 source:=replace(source,anchor,'(''task-create'',''task-edit'',''project-create'',''project-edit'',''routine-create'',''training-create'')');
 anchor:=$a$  else
   if jsonb_typeof(c->'title')$a$;
 if position(anchor in source)=0 then raise exception 'Capture routine validator missing';end if;
 source:=replace(source,anchor,$a$  elsif item->>'kind'='training-create' then
   if not planner_private.training_capture_valid(c) or not planner_private.training_capture_template_current(c) then return jsonb_build_object('status','invalid');end if;
   if c ? 'startTime' then
    insert into public.planner_state_versions(user_id) values(owner_id) on conflict(user_id) do nothing;
    perform 1 from public.planner_state_versions where user_id=owner_id for update;
    if not planner_private.timed_task_slot_available(planner_private.training_capture_schedule(c)) then return jsonb_build_object('status','conflict');end if;
   end if;
  else
   if jsonb_typeof(c->'title')$a$);
 execute source;
 source:=pg_get_functiondef('planner_private.ai_proposal_command(jsonb)'::regprocedure);
 anchor:=$a$('operation','operationId','proposalId','expectedVersion','supportsTimedTasks','revalidate')$a$;
 if position(anchor in source)=0 then raise exception 'Capture acceptance capability guard missing';end if;
 source:=replace(source,anchor,$a$('operation','operationId','proposalId','expectedVersion','supportsTimedTasks','supportsTrainingPlans','revalidate')$a$);
 anchor:=$a$p.body ? 'contextVersion'$a$;
 if position(anchor in source)=0 then raise exception 'Capture planner lock missing';end if;
 source:=replace(source,anchor,$a$(p.body ? 'contextVersion' or exists(select 1 from jsonb_array_elements(p.body->'items') i where i->>'kind'='training-create'))$a$);
 source:=replace(source,'select version into token from public.planner_state_versions where user_id=owner_id for update;',
  'insert into public.planner_state_versions(user_id) values(owner_id) on conflict(user_id) do nothing; select version into token from public.planner_state_versions where user_id=owner_id for update;');
 source:=replace(source,'project_id uuid; project_version uuid; task public.tasks;','project_id uuid; project_version uuid; task public.tasks; training_occurrence_id uuid;');
 anchor:=$a$-- Lock existing parents before children; verify the entire preview before writes.$a$;
 if position(anchor in source)=0 then raise exception 'Capture atomic preflight missing';end if;
 source:=replace(source,anchor,$a$
 if exists(select 1 from jsonb_array_elements(proposal.body->'items') i where i->>'kind'='training-create') then
  if p_request->'supportsTrainingPlans' is distinct from 'true'::jsonb then return jsonb_build_object('status','invalid');end if;
  perform 1 from public.routines where user_id=owner_id and id in (select (i->'changes'->>'trainingTemplateId')::uuid
   from jsonb_array_elements(proposal.body->'items') i where i->>'kind'='training-create' and i->'changes'->>'trainingTemplateId' is not null) order by id for share;
  for item in select value from jsonb_array_elements(proposal.body->'items') where value->>'kind'='training-create' loop
   if not planner_private.training_capture_template_current(item->'changes') then return jsonb_build_object('status','conflict');end if;
   if planner_private.training_capture_past(item->'changes') then return jsonb_build_object('status','past-time');end if;
   if item->'changes' ? 'startTime' and not planner_private.timed_task_slot_available(planner_private.training_capture_schedule(item->'changes')) then return jsonb_build_object('status','conflict');end if;
  end loop;
 end if;
 $a$||anchor);
 anchor:=$a$   else
    result:=planner_private.routine_command(changes||jsonb_build_object('operation','create','operationId',item->>'id'));$a$;
 if position(anchor in source)=0 then raise exception 'Capture routine dispatch missing';end if;
 source:=replace(source,anchor,$a$   elsif item->>'kind'='training-create' then
    if changes ? 'startTime' and not planner_private.timed_task_slot_available(planner_private.training_capture_schedule(changes)) then raise exception using errcode='PT409',message='Training reservation changed';end if;
    result:=planner_private.routine_command((changes-'trainingTemplateVersion'-'trainingTemplateName')||jsonb_build_object(
     'operation','create','operationId',item->>'id','activityKind','training','repeatMode','once','rule','{"frequency":"daily","interval":1}'::jsonb)
     ||case when changes ? 'startTime' then '{}'::jsonb else '{"timingMode":"anytime"}'::jsonb end);
    if result->>'status' is distinct from 'complete' then raise exception using errcode='PT409',message='Training plan changed';end if;
    select o.id into training_occurrence_id from public.recurring_task_occurrences o join public.recurring_task_series s on s.id=o.series_id and s.user_id=owner_id
     where o.series_id=(result->>'seriesId')::uuid and o.scheduled_date=(changes->>'date')::date and o.scheduled_period='';
    if training_occurrence_id is null then raise exception using errcode='PT409',message='Training occurrence was not acknowledged';end if;
    results:=results||jsonb_build_array(jsonb_build_object('itemId',item->>'id','kind','training-create','seriesId',result->>'seriesId','recordId',training_occurrence_id));
   else
    result:=planner_private.routine_command(changes||jsonb_build_object('operation','create','operationId',item->>'id'));$a$);
 execute source;
end $$;
