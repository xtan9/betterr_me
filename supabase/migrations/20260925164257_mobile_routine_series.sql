-- Effective-dated reservation policy; the shared lifecycle still owns recurrence.
create table public.planner_routine_schedule_revisions (
  series_id uuid not null references public.planner_routine_schedules(series_id) on delete cascade,
  effective_from date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_time time not null, end_time time not null, is_protected boolean not null,
  primary key(series_id,effective_from), check(end_time>start_time)
);
alter table public.planner_routine_schedule_revisions enable row level security;
revoke all on public.planner_routine_schedule_revisions from public,anon,authenticated;
grant select on public.planner_routine_schedule_revisions to authenticated;
create policy routine_schedule_revision_owner on public.planner_routine_schedule_revisions for select to authenticated using ((select auth.uid())=user_id);
create index planner_routine_schedule_revision_owner on public.planner_routine_schedule_revisions(user_id);
insert into public.planner_routine_schedule_revisions
select r.series_id,s.activation_date,r.user_id,r.start_time,r.end_time,r.is_protected
from public.planner_routine_schedules r join public.recurring_task_series s on s.id=r.series_id;

create function planner_private.routine_schedule_at(p_series uuid,p_date date)
returns table(start_time time,end_time time,is_protected boolean)
language sql stable set search_path=pg_catalog as $$
 select h.start_time,h.end_time,h.is_protected from public.planner_routine_schedule_revisions h
 where h.series_id=p_series and h.effective_from<=p_date order by h.effective_from desc limit 1
$$;
revoke all on function planner_private.routine_schedule_at(uuid,date) from public,anon,authenticated;

create function planner_private.seed_routine_schedule_history() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.planner_routine_schedule_revisions
 select new.series_id,s.activation_date,new.user_id,new.start_time,new.end_time,new.is_protected
 from public.recurring_task_series s where s.id=new.series_id;
 return new;
end $$;
revoke all on function planner_private.seed_routine_schedule_history() from public,anon,authenticated;
create trigger planner_seed_routine_schedule after insert on public.planner_routine_schedules
for each row execute function planner_private.seed_routine_schedule_history();

create function planner_private.routine_series_snapshot() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); rows jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found'); end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',s.id,'title',v.defaults->>'title','status',s.status,'seriesToken',s.revision_token,
   'scheduleVersion',r.version,'timezone',s.time_zone,'rule',v.recurrence_rule,
   'startTime',r.start_time,'endTime',r.end_time,'protected',r.is_protected,
   'effectiveFrom',v.effective_from,'activationDate',s.activation_date,
   'supported',planner_private.routine_rule_supported(v.recurrence_rule),
   'nextDate',n.day,'nextStartTime',n.start_time,
   'nextReason',case when n.day is not null then null when s.status<>'active' then s.status
     when not planner_private.routine_rule_supported(v.recurrence_rule) then 'unsupported' else 'none-in-horizon' end
 ) order by case s.status when 'active' then 0 when 'paused' then 1 else 2 end,v.defaults->>'title',s.id),'[]') into rows
 from public.planner_routine_schedules r join public.recurring_task_series s on s.id=r.series_id and s.user_id=owner_id
 join public.recurring_task_series_revisions v on v.id=s.current_revision_id
 left join lateral (
   select candidates.day,candidates.start_time from (
   select e.start_date as day,e.start_time
   from public.recurring_task_occurrences o join public.calendar_events e on e.routine_occurrence_id=o.id and e.user_id=owner_id
   where o.series_id=s.id and o.state in ('open','extra') and (e.start_date+e.start_time) at time zone e.timezone>statement_timestamp()
   union all
   select d.scheduled_date as day,h.start_time
   from public.recurring_task_series_revisions rv
   cross join lateral public.recurring_task_scheduled_dates(rv.recurrence_rule,rv.recurrence_anchor,rv.activation_date,
     greatest((statement_timestamp() at time zone s.time_zone)::date,rv.effective_from),
     least(greatest((statement_timestamp() at time zone s.time_zone)::date,rv.effective_from)+366,coalesce(rv.effective_to-1,'9999-12-31'::date),coalesce(s.last_scheduled_date,'9999-12-31'::date))) d
   cross join lateral planner_private.routine_schedule_at(s.id,d.scheduled_date) h
   where rv.series_id=s.id and rv.state='active' and s.status<>'ended'
     and planner_private.routine_rule_supported(rv.recurrence_rule)
     and (d.scheduled_date+h.start_time) at time zone s.time_zone>statement_timestamp()
     and not exists(select 1 from public.recurring_task_intentional_absences a where a.series_id=s.id and a.scheduled_date=d.scheduled_date)
     and planner_private.routine_time_valid(d.scheduled_date,h.start_time,h.end_time,s.time_zone)
     and not exists(select 1 from public.recurring_task_occurrences o where o.series_id=s.id and o.scheduled_date=d.scheduled_date)
   ) candidates order by candidates.day,candidates.start_time limit 1
 ) n on true
 where r.user_id=owner_id;
 return jsonb_build_object('status','complete','rows',rows);
end $$;
revoke all on function planner_private.routine_series_snapshot() from public,anon;
grant execute on function planner_private.routine_series_snapshot() to authenticated;
create function public.planner_routine_series_snapshot() returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.routine_series_snapshot() $$;
revoke all on function public.planner_routine_series_snapshot() from public,anon;
grant execute on function public.planner_routine_series_snapshot() to authenticated;

-- A versioned read set is both the impact summary and the optimistic lock.
create function planner_private.routine_series_impact(p_series uuid,p_from date) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'version',o.version,'taskVersion',t.version,'eventVersion',e.version,'state',o.state,
   'preserved',o.state in ('completed','skipped','extra') or o.overrides<>'{}'::jsonb
     or (o.scheduled_date+h.start_time) at time zone s.time_zone<=statement_timestamp()
     or (e.id is not null and ((e.start_date+e.start_time) at time zone e.timezone<=statement_timestamp()
       or e.start_date<>o.scheduled_date or e.end_date<>o.scheduled_date or e.start_time<>h.start_time
       or e.end_time<>h.end_time or e.timezone<>s.time_zone or e.is_protected<>h.is_protected or e.title is distinct from o.details->>'title'))
     or (o.state='open' and e.id is null and planner_private.routine_time_valid(o.scheduled_date,h.start_time,h.end_time,s.time_zone))
 ) order by o.id),'[]')
 from public.recurring_task_occurrences o join public.recurring_task_series s on s.id=o.series_id
 cross join lateral planner_private.routine_schedule_at(s.id,o.scheduled_date) h
 left join public.tasks t on t.id=o.task_id
 left join public.calendar_events e on e.routine_occurrence_id=o.id
 where o.series_id=p_series and o.scheduled_date>=p_from
$$;
revoke all on function planner_private.routine_series_impact(uuid,date) from public,anon,authenticated;

create function planner_private.routine_series_preview(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare series public.recurring_task_series; revision public.recurring_task_series_revisions;
 schedule public.planner_routine_schedules; day date; impact jsonb; affected integer; preserved integer;
 starts time; ends time;
begin
 if auth.uid() is null then return jsonb_build_object('status','not-found'); end if;
 if jsonb_typeof(p_request) is distinct from 'object' or coalesce(p_request->>'operation','') not in ('revise','pause','resume','end')
   or coalesce(p_request->>'effectiveDate','')!~'^\d{4}-\d{2}-\d{2}$'
   or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','seriesId','effectiveDate','expectedSeriesToken','expectedScheduleVersion','title','startTime','endTime','protected','rule'))
 then return jsonb_build_object('status','invalid'); end if;
 select * into series from public.recurring_task_series where id=(p_request->>'seriesId')::uuid and user_id=auth.uid();
 if not found then return jsonb_build_object('status','not-found'); end if;
 select * into schedule from public.planner_routine_schedules where series_id=series.id and user_id=auth.uid();
 if not found then return jsonb_build_object('status','unsupported'); end if;
 select * into revision from public.recurring_task_series_revisions where id=series.current_revision_id;
 if series.revision_token is distinct from (p_request->>'expectedSeriesToken')::integer
   or schedule.version is distinct from (p_request->>'expectedScheduleVersion')::uuid then return jsonb_build_object('status','conflict'); end if;
 if not planner_private.routine_rule_supported(revision.recurrence_rule) then return jsonb_build_object('status','unsupported'); end if;
 day:=(p_request->>'effectiveDate')::date;
 if day<greatest((statement_timestamp() at time zone series.time_zone)::date,series.activation_date,revision.effective_from)
   or day>greatest((statement_timestamp() at time zone series.time_zone)::date,series.activation_date,revision.effective_from)+366
   or series.status='ended' or (p_request->>'operation'='pause' and series.status<>'active')
   or (p_request->>'operation'='resume' and series.status<>'paused') then return jsonb_build_object('status','invalid'); end if;
 if p_request->>'operation'='resume' and (day+schedule.start_time) at time zone series.time_zone<=statement_timestamp()
 then return jsonb_build_object('status','invalid'); end if;
 if p_request->>'operation'='revise' then
   if length(btrim(coalesce(p_request->>'title',''))) not between 1 and 100
     or not coalesce(planner_private.routine_rule_supported(p_request->'rule'),false)
     or jsonb_typeof(p_request->'protected') is distinct from 'boolean'
     or coalesce(p_request->>'startTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
     or coalesce(p_request->>'endTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
   then return jsonb_build_object('status','invalid'); end if;
   starts:=(p_request->>'startTime')::time; ends:=(p_request->>'endTime')::time;
   if not planner_private.routine_time_valid(day,starts,ends,series.time_zone)
     or (day+starts) at time zone series.time_zone<=statement_timestamp() then return jsonb_build_object('status','invalid'); end if;
 end if;
 impact:=planner_private.routine_series_impact(series.id,day);
 select count(*) filter(where not (i->>'preserved')::boolean),count(*) filter(where (i->>'preserved')::boolean)
   into affected,preserved from jsonb_array_elements(impact) i;
 return jsonb_build_object('status','complete','affected',affected,'preserved',preserved,'effectiveDate',day,
   'token',md5(jsonb_build_object('request',p_request,'impact',impact)::text));
exception when invalid_text_representation or datetime_field_overflow then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.routine_series_preview(jsonb) from public,anon;
grant execute on function planner_private.routine_series_preview(jsonb) to authenticated;
create function public.planner_routine_series_preview(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.routine_series_preview(p_request) $$;
revoke all on function public.planner_routine_series_preview(jsonb) from public,anon;
grant execute on function public.planner_routine_series_preview(jsonb) to authenticated;

-- Reservation creation also runs when the lifecycle restores a withdrawn row.
create or replace function planner_private.reserve_routine_occurrence(p_occurrence uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare occurrence public.recurring_task_occurrences; series public.recurring_task_series; schedule record;
begin
 select * into occurrence from public.recurring_task_occurrences where id=p_occurrence;
 if occurrence.state not in ('open','extra') or occurrence.task_id is null then return; end if;
 select * into series from public.recurring_task_series where id=occurrence.series_id;
 select * into schedule from planner_private.routine_schedule_at(series.id,occurrence.scheduled_date);
 if not found or not planner_private.routine_time_valid(occurrence.scheduled_date,schedule.start_time,schedule.end_time,series.time_zone) then return; end if;
 insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone,task_id,is_protected,app_owned,routine_occurrence_id)
 values(series.user_id,occurrence.details->>'title',occurrence.scheduled_date,occurrence.scheduled_date,schedule.start_time,schedule.end_time,series.time_zone,occurrence.task_id,schedule.is_protected,true,occurrence.id)
 on conflict(routine_occurrence_id) do nothing;
end $$;
create trigger planner_reserve_restored_occurrence after update of state on public.recurring_task_occurrences
for each row when(old.state='withdrawn' and new.state='open') execute function planner_private.reserve_new_routine_occurrence();

create function planner_private.routine_series_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); request_id uuid:=(p_request->>'operationId')::uuid;
 series public.recurring_task_series; schedule public.planner_routine_schedules;
 receipt public.planner_command_receipts; preview jsonb; impact jsonb; result jsonb;
 day date; occurrence public.recurring_task_occurrences; event public.calendar_events; slot record;
 lifecycle_request jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found'); end if;
 if request_id is null then return jsonb_build_object('status','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
 select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
 if found then
   if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
   return jsonb_set(receipt.outcome,'{status}','"already-applied"');
 end if;
 select * into series from public.recurring_task_series where id=(p_request->>'seriesId')::uuid and user_id=owner_id for update;
 if not found then return jsonb_build_object('status','not-found'); end if;
 perform 1 from public.recurring_task_occurrences where series_id=series.id order by id for update;
 perform 1 from public.tasks where recurring_series_id=series.id and user_id=owner_id order by id for update;
 perform 1 from public.calendar_events where user_id=owner_id and routine_occurrence_id in
   (select id from public.recurring_task_occurrences where series_id=series.id) order by id for update;
 preview:=planner_private.routine_series_preview(p_request-'operationId'-'previewToken');
 if preview->>'status'<>'complete' then return preview; end if;
 if preview->>'token' is distinct from p_request->>'previewToken' then return jsonb_build_object('status','conflict'); end if;
 day:=(p_request->>'effectiveDate')::date;
 select * into schedule from public.planner_routine_schedules where series_id=series.id;
 impact:=planner_private.routine_series_impact(series.id,day);
 perform set_config('betterr.recurring_lifecycle','on',true);
 -- Retain all details of exceptions and already-started work. The lifecycle
 -- keeps these as Extra Occurrences if the new rule removes their date.
 update public.recurring_task_occurrences o set overrides=o.details||o.overrides
 where o.series_id=series.id and o.state in ('open','extra') and o.id in
   (select (i->>'id')::uuid from jsonb_array_elements(impact) i where (i->>'preserved')::boolean);
 update public.tasks t set occurrence_overrides=o.overrides from public.recurring_task_occurrences o
 where o.task_id=t.id and o.series_id=series.id and o.state in ('open','extra') and o.id in
   (select (i->>'id')::uuid from jsonb_array_elements(impact) i where (i->>'preserved')::boolean);
 if p_request->>'operation'='revise' then
   insert into public.planner_routine_schedule_revisions values(series.id,day,owner_id,(p_request->>'startTime')::time,(p_request->>'endTime')::time,(p_request->>'protected')::boolean)
   on conflict(series_id,effective_from) do update set start_time=excluded.start_time,end_time=excluded.end_time,is_protected=excluded.is_protected;
   update public.planner_routine_schedules set start_time=(p_request->>'startTime')::time,end_time=(p_request->>'endTime')::time,is_protected=(p_request->>'protected')::boolean,version=gen_random_uuid() where series_id=series.id;
 end if;
 -- Materialize the still-active interval before a future terminal boundary.
 -- Once ended the shared lifecycle intentionally creates no more occurrences.
 if p_request->>'operation'='end' and day>greatest((statement_timestamp() at time zone series.time_zone)::date,series.activation_date) then
   result:=public.recurring_task_lifecycle('ensure-coverage',jsonb_build_object('userId',owner_id,'seriesId',series.id,
     'range',jsonb_build_object('from',greatest((statement_timestamp() at time zone series.time_zone)::date,series.activation_date),'to',day-1)));
   if result->>'status' not in ('complete','already-applied') then raise exception using errcode='PT409',message='Routine coverage rejected'; end if;
 end if;
 lifecycle_request:=jsonb_build_object('userId',owner_id,'seriesId',series.id,'idempotencyKey',request_id,'expectedRevisionToken',series.revision_token,
   'effectiveDate',day,'scope','following','coverage',jsonb_build_object('from',day,'to',greatest(day,series.coverage_horizon)));
 if p_request->>'operation'='revise' then
   lifecycle_request:=lifecycle_request||jsonb_build_object('recurrenceRule',p_request->'rule','defaults',jsonb_build_object('title',btrim(p_request->>'title')));
 end if;
 result:=public.recurring_task_lifecycle((p_request->>'operation')||'-series',lifecycle_request);
 -- Failure must unwind preservation, time policy and lifecycle together.
 if result->>'status' not in ('complete','already-applied') then
   raise exception using errcode='PT409',message='Routine series transition rejected',detail=result::text;
 end if;
 for occurrence in select o.* from public.recurring_task_occurrences o
   where o.series_id=series.id and o.scheduled_date>=day and o.state='open' and o.overrides='{}'::jsonb
   order by o.id loop
   select * into slot from planner_private.routine_schedule_at(series.id,occurrence.scheduled_date);
   select * into event from public.calendar_events where routine_occurrence_id=occurrence.id and user_id=owner_id;
   if not planner_private.routine_time_valid(occurrence.scheduled_date,slot.start_time,slot.end_time,series.time_zone) then
     if event.id is not null then perform public.delete_calendar_event_with_reminders(owner_id,event.id); end if;
   elsif event.id is null then
     perform planner_private.reserve_routine_occurrence(occurrence.id);
   else
     perform public.update_calendar_event_with_reminders(owner_id,event.id,jsonb_build_object('title',occurrence.details->>'title',
       'start_date',occurrence.scheduled_date,'end_date',occurrence.scheduled_date,'start_time',slot.start_time,'end_time',slot.end_time),null);
     update public.calendar_events set is_protected=slot.is_protected
       where id=event.id and user_id=owner_id and is_protected is distinct from slot.is_protected;
   end if;
 end loop;
 result:=jsonb_build_object('status','complete','seriesId',series.id);
 insert into public.planner_command_receipts values(owner_id,request_id,p_request,result);
 return result;
exception when sqlstate 'PT409' then return jsonb_build_object('status','conflict');
 when invalid_text_representation or datetime_field_overflow or check_violation or not_null_violation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.routine_series_command(jsonb) from public,anon;
grant execute on function planner_private.routine_series_command(jsonb) to authenticated;
create function public.planner_routine_series_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.routine_series_command(p_request) $$;
revoke all on function public.planner_routine_series_command(jsonb) from public,anon;
grant execute on function public.planner_routine_series_command(jsonb) to authenticated;

-- Date views resolve that date's time policy, never the latest future policy.
create or replace function planner_private.routine_snapshot(p_date date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); series_id uuid; result jsonb; rows jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found'); end if;
 if p_date is null then return jsonb_build_object('status','invalid'); end if;
 for series_id in select s.id from public.recurring_task_series s join public.planner_routine_schedules r on r.series_id=s.id
   where s.user_id=owner_id and r.user_id=owner_id and s.status<>'ended'
   and not exists(select 1 from public.recurring_task_occurrences o where o.series_id=s.id and o.scheduled_date=p_date) order by s.id loop
   result:=public.recurring_task_lifecycle('ensure-coverage',jsonb_build_object('userId',owner_id,'seriesId',series_id,'range',jsonb_build_object('from',p_date,'to',p_date)));
   if result->>'status' not in ('complete','already-applied') then raise exception 'Routine coverage unavailable'; end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('series',to_jsonb(s),'schedule',to_jsonb(r)||to_jsonb(h),'occurrence',to_jsonb(o),
   'task',to_jsonb(t),'event',to_jsonb(e),'supported',planner_private.routine_rule_supported(v.recurrence_rule),
   'timeIssue',not planner_private.routine_time_valid(o.scheduled_date,h.start_time,h.end_time,s.time_zone) and e.id is null,
   'startInstant',case when e.id is not null then (e.start_date+e.start_time) at time zone e.timezone end) order by h.start_time,o.id),'[]') into rows
 from public.planner_routine_schedules r join public.recurring_task_series s on s.id=r.series_id
 join public.recurring_task_occurrences o on o.series_id=s.id
 join public.recurring_task_series_revisions v on v.id=o.revision_id
 cross join lateral planner_private.routine_schedule_at(s.id,o.scheduled_date) h
 left join public.tasks t on t.id=o.task_id and t.user_id=owner_id
 left join public.calendar_events e on e.routine_occurrence_id=o.id and e.user_id=owner_id
 where r.user_id=owner_id and s.user_id=owner_id and o.scheduled_date=p_date;
 return jsonb_build_object('status','complete','rows',rows);
end $$;
