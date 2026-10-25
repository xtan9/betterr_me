-- Training plans reuse the authoritative planner series/occurrence lifecycle.
-- Existing clients and schedule rows retain their routine behavior.
alter table public.planner_routine_schedules
  add column activity_kind text not null default 'routine'
    check (activity_kind in ('routine','training')),
  add column repeat_mode text not null default 'recurring'
    check (repeat_mode in ('once','recurring')),
  add constraint planner_training_once_kind check (repeat_mode<>'once' or activity_kind='training');
comment on column public.planner_routine_schedules.activity_kind is
  'Planner classification only. Training plans have no implied workout or workout-template identity.';
comment on column public.planner_routine_schedules.repeat_mode is
  'Once uses an authoritative one-occurrence series bound. Recurring preserves existing rules.';

CREATE OR REPLACE FUNCTION planner_private.timed_routine_command(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare owner_id uuid:=auth.uid(); request_id uuid:=(p_request->>'operationId')::uuid;
  receipt public.planner_command_receipts; result jsonb; outcome jsonb; series_id uuid;
  starts time; ends time; zone text; day date;
  series public.recurring_task_series; occurrence public.recurring_task_occurrences; task public.tasks;
  event public.calendar_events; step_event public.calendar_events; current_step_event public.calendar_events; schedule public.planner_routine_schedules; rule jsonb; change_id uuid;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if p_request ? 'steps' and not planner_private.valid_steps(p_request->'steps') then return jsonb_build_object('status','invalid'); end if;
  if request_id is null or jsonb_typeof(p_request) is distinct from 'object' then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
  select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
  if found then
    if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  if p_request->>'operation' in ('edit','skip') then
    if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','seriesId','occurrenceId','expectedSeriesToken','expectedOccurrenceVersion','expectedTaskVersion','expectedEventVersion','title','date','startTime','endTime','steps')) then return jsonb_build_object('status','invalid'); end if;
    select * into series from public.recurring_task_series where id=(p_request->>'seriesId')::uuid and user_id=owner_id for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    select * into schedule from public.planner_routine_schedules where planner_routine_schedules.series_id=series.id and user_id=owner_id;
    if not found then return jsonb_build_object('status','unsupported'); end if;
    select recurrence_rule into rule from public.recurring_task_series_revisions where id=series.current_revision_id;
    if not planner_private.routine_rule_supported(rule) then return jsonb_build_object('status','unsupported'); end if;
    select * into occurrence from public.recurring_task_occurrences where id=(p_request->>'occurrenceId')::uuid and recurring_task_occurrences.series_id=series.id for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    select * into task from public.tasks where id=occurrence.task_id and user_id=owner_id for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    select * into event from public.calendar_events where routine_occurrence_id=occurrence.id and user_id=owner_id for update;
    if occurrence.version is distinct from (p_request->>'expectedOccurrenceVersion')::uuid or task.version is distinct from (p_request->>'expectedTaskVersion')::uuid
      or series.revision_token is distinct from (p_request->>'expectedSeriesToken')::integer or event.version is distinct from (p_request->>'expectedEventVersion')::uuid then return jsonb_build_object('status','conflict'); end if;
    if occurrence.state not in ('open','extra') then return jsonb_build_object('status','unsupported'); end if;
    if p_request->>'operation'='edit' then
      if length(btrim(coalesce(p_request->>'title',''))) not between 1 and 100 or coalesce(p_request->>'date','')!~'^\d{4}-\d{2}-\d{2}$'
        or coalesce(p_request->>'startTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
        or coalesce(p_request->>'endTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' then return jsonb_build_object('status','invalid'); end if;
      starts:=(p_request->>'startTime')::time; ends:=(p_request->>'endTime')::time; day:=(p_request->>'date')::date;
      if not planner_private.routine_interval_valid(day,starts,ends,series.time_zone) then return jsonb_build_object('status','invalid'); end if;
    end if;
    result:=public.recurring_task_lifecycle(case when p_request->>'operation'='edit' then 'edit-occurrence' else 'skip-occurrence' end,
      jsonb_build_object('userId',owner_id,'seriesId',series.id,'occurrenceId',occurrence.id,'taskId',task.id,'scope','this',
        'scheduledDate',occurrence.scheduled_date,'expectedTaskVersion',task.version,'expectedRevisionToken',series.revision_token,'expectedRevisionId',occurrence.revision_id,
        'idempotencyKey',request_id,'updates',jsonb_build_object('title',btrim(p_request->>'title'))));
    if result->>'status' not in ('complete','already-applied') then return result; end if;
    if p_request->>'operation'='skip' then
      if exists(select 1 from public.calendar_events where id=event.id and user_id=owner_id) then perform public.delete_calendar_event_with_reminders(owner_id,event.id); end if;
      insert into public.planner_changes(user_id,kind,before_state,after_state) values(owner_id,'routine-skip',
        jsonb_build_object('task',to_jsonb(task),'occurrence',to_jsonb(occurrence),'events',case when event.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(event)) end),
        jsonb_build_object('occurrenceId',occurrence.id)) returning id into change_id;
    elsif event.id is null then
      insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone,task_id,is_protected,app_owned,routine_occurrence_id)
        values(owner_id,btrim(p_request->>'title'),day,planner_private.routine_end_date(day,starts,ends),starts,ends,series.time_zone,task.id,schedule.is_protected,true,occurrence.id);
    else
      perform public.update_calendar_event_with_reminders(owner_id,event.id,jsonb_build_object('title',btrim(p_request->>'title'),
        'start_date',day,'end_date',planner_private.routine_end_date(day,starts,ends),'start_time',starts,'end_time',ends),null);
    end if;
    outcome:=jsonb_build_object('status','complete','seriesId',series.id,'changeId',change_id);
    if p_request->>'operation'='edit' and p_request ? 'steps' then
      select * into step_event from public.calendar_events where routine_occurrence_id=occurrence.id and user_id=owner_id;
      result:=planner_private.change_task_steps(task.id,p_request->'steps');
      if result->>'status'<>'complete' then raise exception using errcode='23514',message='Routine step edit rejected'; end if;
      select * into current_step_event from public.calendar_events where id=step_event.id and user_id=owner_id;
      update public.planner_changes set before_state=before_state||jsonb_build_object('task',to_jsonb(task),'occurrence',to_jsonb(occurrence),
        'events',(select coalesce(jsonb_agg(e),'[]'::jsonb) from jsonb_array_elements(coalesce(before_state->'events','[]')) e where e->>'id' is distinct from step_event.id::text)
          ||case when event.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(event)) end),
        after_state=after_state||jsonb_build_object('events',
          (select coalesce(jsonb_agg(e),'[]'::jsonb) from jsonb_array_elements(coalesce(after_state->'events','[]')) e where e->>'id' is distinct from step_event.id::text)
            ||case when current_step_event.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(current_step_event)) end,
          'eventVersions',(select coalesce(jsonb_agg(jsonb_build_object('id',event_id,'version',version)),'[]'::jsonb)
            from public.planner_event_versions where event_id=current_step_event.id and user_id=owner_id),
          'reconcileEvents',case when event.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(event)) end,
          'createdEvents',case when event.id is null and current_step_event.id is not null then jsonb_build_array(to_jsonb(current_step_event)) else '[]'::jsonb end)
        where id=(result->>'changeId')::uuid and user_id=owner_id;
      outcome:=outcome||result;
    end if;
    insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
    return outcome;
  end if;
  if p_request->>'operation' is distinct from 'create' then return jsonb_build_object('status','unsupported'); end if;
  if coalesce(planner_private.routine_rule_supported(p_request->'rule'),false)=false or length(btrim(coalesce(p_request->>'title',''))) not between 1 and 100
    or coalesce(p_request->>'date','')!~'^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_request->>'startTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
    or coalesce(p_request->>'endTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
    or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','title','date','startTime','endTime','steps','timezone','protected','rule','steps','activityKind','repeatMode')) then return jsonb_build_object('status','invalid'); end if;
  -- The planner occurrence is the plan identity; no fitness entity is created.
  if coalesce(p_request->>'activityKind','routine') not in ('routine','training')
    or coalesce(p_request->>'repeatMode','recurring') not in ('once','recurring')
    or (p_request ? 'activityKind' and jsonb_typeof(p_request->'activityKind') is distinct from 'string')
    or (p_request ? 'repeatMode' and jsonb_typeof(p_request->'repeatMode') is distinct from 'string')
    or (p_request->>'repeatMode'='once' and (p_request->>'activityKind' is distinct from 'training'
      or p_request->'rule' is distinct from '{"frequency":"daily","interval":1}'::jsonb)) then
    return jsonb_build_object('status','invalid');
  end if;
  starts:=(p_request->>'startTime')::time; ends:=(p_request->>'endTime')::time; zone:=p_request->>'timezone'; day:=(p_request->>'date')::date;
  if not exists(select 1 from pg_timezone_names where name=zone) or ends=starts then return jsonb_build_object('status','invalid'); end if;
  result:=public.recurring_task_lifecycle('create-series',jsonb_build_object('userId',owner_id,'idempotencyKey',request_id,
    'recurrenceRule',p_request->'rule','recurrenceAnchor',day,'activationDate',day,'timeZone',zone,
    'occurrenceLimit',case when p_request->>'repeatMode'='once' then 1 else null end,
    'lastScheduledDate',case when p_request->>'repeatMode'='once' then day else null end,'defaults',jsonb_build_object('title',btrim(p_request->>'title'),'dueTime',null,'steps',coalesce(p_request->'steps','[]'::jsonb))));
  if result->>'status' not in ('complete','already-applied') then return result; end if;
  series_id:=(result->'series'->>'id')::uuid;
  insert into public.planner_routine_schedules(series_id,user_id,start_time,end_time,is_protected,activity_kind,repeat_mode)
    values(series_id,owner_id,starts,ends,coalesce((p_request->>'protected')::boolean,false),
      coalesce(p_request->>'activityKind','routine'),coalesce(p_request->>'repeatMode','recurring'));
  perform planner_private.routine_snapshot(day);
  outcome:=jsonb_build_object('status','complete','seriesId',series_id);
  insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
  return outcome;
exception when invalid_text_representation or datetime_field_overflow or check_violation or not_null_violation then return jsonb_build_object('status','invalid');
end $function$;

-- Snapshot v2 already includes the schedule row; expose the same classification
-- in the library snapshot without rewriting its recurrence/ownership queries.
do $$
declare definition text; original text := '''timingMode'',r.timing_mode,''periods'',r.periods';
begin
  definition:=pg_get_functiondef('planner_private.routine_series_snapshot_v2()'::regprocedure);
  if strpos(definition,original)=0 then raise exception 'Unexpected routine library definition'; end if;
  execute replace(definition,original,original||',''activityKind'',r.activity_kind,''repeatMode'',r.repeat_mode');
end $$;
