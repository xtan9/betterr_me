-- Mapping and time policy: docs/architecture/mobile-routines.md.
create table public.planner_routine_schedules (
  series_id uuid primary key references public.recurring_task_series(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_time time not null, end_time time not null,
  is_protected boolean not null default false,
  version uuid not null default gen_random_uuid(),
  check(end_time>start_time)
);
alter table public.planner_routine_schedules enable row level security;
revoke all on public.planner_routine_schedules from public,anon,authenticated;
grant select on public.planner_routine_schedules to authenticated;
create policy routine_schedule_owner on public.planner_routine_schedules for select to authenticated using ((select auth.uid())=user_id);
create index planner_routine_schedule_owner on public.planner_routine_schedules(user_id);
alter table public.recurring_task_occurrences add column version uuid not null default gen_random_uuid();
create trigger planner_occurrence_version before update on public.recurring_task_occurrences
for each row execute function planner_private.advance_history_version();
alter table public.calendar_events add column routine_occurrence_id uuid unique references public.recurring_task_occurrences(id) on delete set null;

create function planner_private.routine_rule_supported(rule jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
begin
  if jsonb_typeof(rule) is distinct from 'object' then return false; end if;
  if rule='{"frequency":"daily","interval":1}'::jsonb then return true; end if;
  if rule->>'frequency' is distinct from 'weekly' or rule->'interval' is distinct from '1'::jsonb
    or jsonb_typeof(rule->'days_of_week') is distinct from 'array' then return false; end if;
  return jsonb_array_length(rule->'days_of_week') between 1 and 7
    and not exists(select 1 from jsonb_array_elements(rule->'days_of_week') d where d not in ('0'::jsonb,'1','2','3','4','5','6'))
    and not exists(select 1 from jsonb_object_keys(rule) k where k not in ('frequency','interval','days_of_week'));
end $$;
revoke all on function planner_private.routine_rule_supported(jsonb) from public,anon,authenticated;
create function planner_private.routine_time_valid(day date,starts time,ends time,zone text) returns boolean
language sql stable set search_path=pg_catalog as $$
  select ends>starts and ((day+starts) at time zone zone) at time zone zone=day+starts
    and ((day+ends) at time zone zone) at time zone zone=day+ends
    and (day+ends) at time zone zone>(day+starts) at time zone zone
$$;
revoke all on function planner_private.routine_time_valid(date,time,time,text) from public,anon,authenticated;

create function planner_private.reserve_routine_occurrence(p_occurrence uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare occurrence public.recurring_task_occurrences; schedule public.planner_routine_schedules; series public.recurring_task_series;
begin
  select * into occurrence from public.recurring_task_occurrences where id=p_occurrence;
  select * into schedule from public.planner_routine_schedules where series_id=occurrence.series_id;
  if not found or occurrence.state not in ('open','extra') or occurrence.task_id is null then return; end if;
  select * into series from public.recurring_task_series where id=schedule.series_id and user_id=schedule.user_id;
  if not found or not planner_private.routine_time_valid(occurrence.scheduled_date,schedule.start_time,schedule.end_time,series.time_zone) then return; end if;
  insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone,task_id,is_protected,app_owned,routine_occurrence_id)
    values(series.user_id,occurrence.details->>'title',occurrence.scheduled_date,occurrence.scheduled_date,schedule.start_time,schedule.end_time,series.time_zone,occurrence.task_id,schedule.is_protected,true,occurrence.id)
    on conflict(routine_occurrence_id) do nothing;
end $$;
revoke all on function planner_private.reserve_routine_occurrence(uuid) from public,anon,authenticated;
create function planner_private.reserve_new_routine_occurrence() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform planner_private.reserve_routine_occurrence(new.id); return new; end $$;
revoke all on function planner_private.reserve_new_routine_occurrence() from public,anon,authenticated;
create trigger planner_reserve_new_occurrence after insert on public.recurring_task_occurrences
for each row execute function planner_private.reserve_new_routine_occurrence();

create function planner_private.routine_snapshot(p_date date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); series_id uuid; result jsonb; rows jsonb;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if p_date is null then return jsonb_build_object('status','invalid'); end if;
  for series_id in select s.id from public.recurring_task_series s join public.planner_routine_schedules r on r.series_id=s.id
    where s.user_id=owner_id and r.user_id=owner_id and s.status='active'
      and not exists(select 1 from public.recurring_task_occurrences o where o.series_id=s.id and o.scheduled_date=p_date)
      order by s.id loop
    result := public.recurring_task_lifecycle('ensure-coverage',jsonb_build_object('userId',owner_id,'seriesId',series_id,'range',jsonb_build_object('from',p_date,'to',p_date)));
    if result->>'status' not in ('complete','already-applied') then raise exception 'Routine coverage unavailable'; end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('series',to_jsonb(s),'schedule',to_jsonb(r),'occurrence',to_jsonb(o),
    'task',to_jsonb(t),'event',to_jsonb(e),'supported',planner_private.routine_rule_supported(v.recurrence_rule),
    'timeIssue',not planner_private.routine_time_valid(o.scheduled_date,r.start_time,r.end_time,s.time_zone) and e.id is null,
    'startInstant',case when e.id is not null then (e.start_date+e.start_time) at time zone e.timezone end) order by r.start_time,o.id),'[]') into rows
    from public.planner_routine_schedules r join public.recurring_task_series s on s.id=r.series_id
    join public.recurring_task_series_revisions v on v.id=s.current_revision_id
    join public.recurring_task_occurrences o on o.series_id=s.id
    left join public.tasks t on t.id=o.task_id and t.user_id=owner_id
    left join public.calendar_events e on e.routine_occurrence_id=o.id and e.user_id=owner_id
    where r.user_id=owner_id and s.user_id=owner_id and o.scheduled_date=p_date;
  return jsonb_build_object('status','complete','rows',rows);
end $$;
revoke all on function planner_private.routine_snapshot(date) from public,anon;
grant execute on function planner_private.routine_snapshot(date) to authenticated;
create function public.planner_routine_snapshot(p_date date) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.routine_snapshot(p_date) $$;
revoke all on function public.planner_routine_snapshot(date) from public,anon;
grant execute on function public.planner_routine_snapshot(date) to authenticated;

create function planner_private.routine_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); request_id uuid:=(p_request->>'operationId')::uuid;
  receipt public.planner_command_receipts; result jsonb; outcome jsonb; series_id uuid;
  starts time; ends time; zone text; day date;
  series public.recurring_task_series; occurrence public.recurring_task_occurrences; task public.tasks;
  event public.calendar_events; schedule public.planner_routine_schedules; rule jsonb; change_id uuid;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if request_id is null or jsonb_typeof(p_request) is distinct from 'object' then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
  select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
  if found then
    if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  if p_request->>'operation' in ('edit','skip') then
    if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','seriesId','occurrenceId','expectedSeriesToken','expectedOccurrenceVersion','expectedTaskVersion','expectedEventVersion','title','date','startTime','endTime')) then return jsonb_build_object('status','invalid'); end if;
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
      if not planner_private.routine_time_valid(day,starts,ends,series.time_zone) then return jsonb_build_object('status','invalid'); end if;
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
        values(owner_id,btrim(p_request->>'title'),day,day,starts,ends,series.time_zone,task.id,schedule.is_protected,true,occurrence.id);
    else
      perform public.update_calendar_event_with_reminders(owner_id,event.id,jsonb_build_object('title',btrim(p_request->>'title'),
        'start_date',day,'end_date',day,'start_time',starts,'end_time',ends),null);
    end if;
    outcome:=jsonb_build_object('status','complete','seriesId',series.id,'changeId',change_id);
    insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
    return outcome;
  end if;
  if p_request->>'operation' is distinct from 'create' then return jsonb_build_object('status','unsupported'); end if;
  if coalesce(planner_private.routine_rule_supported(p_request->'rule'),false)=false or length(btrim(coalesce(p_request->>'title',''))) not between 1 and 100
    or coalesce(p_request->>'date','')!~'^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_request->>'startTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
    or coalesce(p_request->>'endTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
    or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','title','date','startTime','endTime','timezone','protected','rule')) then return jsonb_build_object('status','invalid'); end if;
  starts:=(p_request->>'startTime')::time; ends:=(p_request->>'endTime')::time; zone:=p_request->>'timezone'; day:=(p_request->>'date')::date;
  if not exists(select 1 from pg_timezone_names where name=zone) or ends<=starts then return jsonb_build_object('status','invalid'); end if;
  result:=public.recurring_task_lifecycle('create-series',jsonb_build_object('userId',owner_id,'idempotencyKey',request_id,
    'recurrenceRule',p_request->'rule','recurrenceAnchor',day,'activationDate',day,'timeZone',zone,'defaults',jsonb_build_object('title',btrim(p_request->>'title'),'dueTime',null)));
  if result->>'status' not in ('complete','already-applied') then return result; end if;
  series_id:=(result->'series'->>'id')::uuid;
  insert into public.planner_routine_schedules(series_id,user_id,start_time,end_time,is_protected)
    values(series_id,owner_id,starts,ends,coalesce((p_request->>'protected')::boolean,false));
  perform planner_private.routine_snapshot(day);
  outcome:=jsonb_build_object('status','complete','seriesId',series_id);
  insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
  return outcome;
exception when invalid_text_representation or datetime_field_overflow or check_violation or not_null_violation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.routine_command(jsonb) from public,anon;
grant execute on function planner_private.routine_command(jsonb) to authenticated;
create function public.planner_routine_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.routine_command(p_request) $$;
revoke all on function public.planner_routine_command(jsonb) from public,anon;
grant execute on function public.planner_routine_command(jsonb) to authenticated;
