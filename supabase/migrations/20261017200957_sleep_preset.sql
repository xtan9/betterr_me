-- One owner-scoped schedule; calendar projections have no linked task or completion state.
create table public.sleep_schedules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id) on delete cascade,
 timezone text not null, version uuid not null default gen_random_uuid(),
 start_time time not null, end_time time not null, effective_date date not null,
 check(start_time<>end_time)
);
alter table public.sleep_schedules enable row level security;
revoke all on public.sleep_schedules from public,anon,authenticated;
grant select on public.sleep_schedules to authenticated;
create policy sleep_owner on public.sleep_schedules for select to authenticated using((select auth.uid())=user_id);
alter table public.calendar_events add column sleep_schedule_id uuid references public.sleep_schedules(id) on delete cascade;
create index calendar_sleep on public.calendar_events(sleep_schedule_id) where sleep_schedule_id is not null;
create unique index sleep_night_exception on public.calendar_events(sleep_schedule_id,original_date) where sleep_schedule_id is not null and is_exception;
alter table public.calendar_events add constraint sleep_projection_shape check(sleep_schedule_id is null or
 (is_protected and app_owned and task_id is null and routine_occurrence_id is null and session_ended_at is null
 and start_time is not null and end_time is not null and (is_recurring<>is_exception)));

-- A private capability is scoped to this backend transaction, not a caller-set GUC.
create table planner_private.sleep_writers (transaction_id bigint primary key, owner_id uuid not null);
revoke all on planner_private.sleep_writers from public,anon,authenticated,service_role;
create function planner_private.guard_sleep_event() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare event_owner uuid; protected_id uuid;
begin
 event_owner:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 protected_id:=case when tg_op='DELETE' then old.sleep_schedule_id else new.sleep_schedule_id end;
 if tg_op='UPDATE' then protected_id:=coalesce(old.sleep_schedule_id,new.sleep_schedule_id); end if;
 if protected_id is null and tg_op<>'DELETE' and new.recurring_event_id is not null then
  select sleep_schedule_id into protected_id from public.calendar_events where id=new.recurring_event_id;
 end if;
 if protected_id is not null then
  -- Deleting the account itself remains supported, including FK cascades.
  if tg_op='DELETE' and not exists(select 1 from public.profiles where id=event_owner) then return old; end if;
  if not exists(select 1 from planner_private.sleep_writers where transaction_id=txid_current() and owner_id=event_owner)
   then raise exception using errcode='42501',message='Use sleep settings to change planned sleep'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function planner_private.guard_sleep_event() from public,anon,authenticated;
create trigger sleep_event_guard before insert or update or delete on public.calendar_events for each row execute function planner_private.guard_sleep_event();

create function public.planner_sleep_snapshot() returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('status','complete','schedule',(select jsonb_build_object('id',id,'version',version,'timezone',timezone,
 'startTime',to_char(start_time,'HH24:MI'),'endTime',to_char(end_time,'HH24:MI'),'effectiveDate',effective_date) from public.sleep_schedules where user_id=auth.uid()))
$$;
revoke all on function public.planner_sleep_snapshot() from public,anon;
grant execute on function public.planner_sleep_snapshot() to authenticated;

create function public.planner_sleep_routine_coverage(p_start date,p_end date) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d date;
begin
 if auth.uid() is null or p_start is null or p_end is null or p_end<p_start or p_end-p_start>32 then raise exception 'Invalid preview range'; end if;
 for d in select p_start+n from generate_series(0,p_end-p_start) n loop perform public.planner_routine_snapshot(d); end loop;
end $$;
revoke all on function public.planner_sleep_routine_coverage(date,date) from public,anon;
grant execute on function public.planner_sleep_routine_coverage(date,date) to authenticated;

-- Resolve one stable night identity, including an exception whose civil start moved.
create function planner_private.sleep_night(p_owner uuid,p_day date) returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare e public.calendar_events; day date; ending date;
begin
 select * into e from public.calendar_events where user_id=p_owner and sleep_schedule_id is not null and is_exception and original_date=p_day;
 if not found then
  select * into e from public.calendar_events where user_id=p_owner and sleep_schedule_id is not null and is_recurring
   and start_date<=p_day and (end_type='never' or end_date_recurrence>=p_day) order by start_date desc limit 1;
  if not found then return null; end if;
  day:=p_day; ending:=p_day+(e.end_date-e.start_date);
 else day:=e.start_date; ending:=e.end_date; end if;
 if not planner_private.routine_interval_valid(day,e.start_time,e.end_time,e.timezone) then return null; end if;
 return jsonb_build_object('nightDate',p_day,'startDate',day,'endDate',ending,'startTime',to_char(e.start_time,'HH24:MI'),
  'endTime',to_char(e.end_time,'HH24:MI'),'start',(day+e.start_time) at time zone e.timezone,'end',(ending+e.end_time) at time zone e.timezone);
end $$;
revoke all on function planner_private.sleep_night(uuid,date) from public,anon,authenticated;

-- Pick the next civil bedtime without letting a past spring gap normalize into the future.
create function planner_private.sleep_first_date(p_time time,p_zone text,p_now timestamptz) returns date language plpgsql stable set search_path=pg_catalog as $$
declare civil timestamp:=p_now at time zone p_zone; candidate timestamptz:=(civil::date+p_time) at time zone p_zone;
begin
 if candidate<=p_now or (candidate at time zone p_zone<>civil::date+p_time and civil::time>=p_time) then return civil::date+1; end if;
 return civil::date;
end $$;
revoke all on function planner_private.sleep_first_date(time,text,timestamptz) from public,anon,authenticated;

create function planner_private.sleep_prepare(p_owner uuid,p_change jsonb) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.sleep_schedules; op text:=p_change->>'operation'; zone text; starts time; ends time; day date; initial date;
 ending date; local_today date; d date; existing jsonb; slot jsonb; intervals jsonb:='[]'; checks jsonb:='[]'; preserved integer:=0; plan_version uuid;
begin
 if p_owner is null or not exists(select 1 from public.profiles where id=p_owner) then return jsonb_build_object('status','not-found'); end if;
 if jsonb_typeof(p_change) is distinct from 'object' or op is null or op not in('setup','revise','night')
  or exists(select 1 from jsonb_object_keys(p_change) k where k not in('operation','expectedVersion','startTime','endTime','timezone','effectiveDate','nightDate','startDate','eventId','expectedEventVersion'))
  or coalesce(p_change->>'startTime','')!~'^([01]\d|2[0-3]):[0-5]\d$' or coalesce(p_change->>'endTime','')!~'^([01]\d|2[0-3]):[0-5]\d$'
 then return jsonb_build_object('status','invalid'); end if;
 select * into s from public.sleep_schedules where user_id=p_owner;
 if (op='setup' and s.id is not null) or (op<>'setup' and s.id is null) or s.version is distinct from (p_change->>'expectedVersion')::uuid
  then return jsonb_build_object('status','conflict'); end if;
 zone:=case when op='setup' then p_change->>'timezone' else s.timezone end;
 if not exists(select 1 from pg_timezone_names where name=zone) or (op<>'setup' and p_change ? 'timezone')
  or (op<>'night' and (p_change ? 'nightDate' or p_change ? 'startDate' or p_change ? 'eventId' or p_change ? 'expectedEventVersion')) or (op='night' and p_change ? 'effectiveDate')
  or (op='setup' and p_change ? 'effectiveDate')
  then return jsonb_build_object('status','invalid'); end if;
 starts:=(p_change->>'startTime')::time; ends:=(p_change->>'endTime')::time;
 local_today:=(statement_timestamp() at time zone zone)::date;
 if starts=ends then return jsonb_build_object('status','invalid'); end if;
 if op='night' then
  initial:=(p_change->>'nightDate')::date; day:=(p_change->>'startDate')::date;
  existing:=planner_private.sleep_night(p_owner,initial);
  if existing is null then return jsonb_build_object('status','invalid'); end if;
  if not exists(select 1 from public.calendar_events where user_id=p_owner and sleep_schedule_id=s.id
   and id=(p_change->>'eventId')::uuid and version=(p_change->>'expectedEventVersion')::uuid
   and ((is_exception and original_date=initial) or (is_recurring and start_date<=initial and (end_type='never' or end_date_recurrence>=initial)
     and not exists(select 1 from public.calendar_events x where x.sleep_schedule_id=s.id and x.is_exception and x.original_date=initial))))
  then return jsonb_build_object('status','conflict'); end if;
  if (existing->>'end')::timestamptz<=statement_timestamp() then return jsonb_build_object('status','past'); end if;
 else
  day:=planner_private.sleep_first_date(starts,zone,statement_timestamp());
  if op='revise' then
   existing:=planner_private.sleep_night(p_owner,day);
   if existing is not null and (existing->>'start')::timestamptz<=statement_timestamp() then day:=day+1; end if;
  end if;
  initial:=coalesce((p_change->>'effectiveDate')::date,day);
  if initial<day or initial>local_today+366 then return jsonb_build_object('status','invalid'); end if;
  day:=initial;
 end if;
 if initial is null or day is null or abs(day-local_today)>732 or not planner_private.routine_interval_valid(day,starts,ends,zone)
 then return jsonb_build_object('status','invalid'); end if;
 ending:=planner_private.routine_end_date(day,starts,ends);
 if (ending+ends) at time zone zone<=statement_timestamp() then return jsonb_build_object('status','past'); end if;
 -- Check the displayed horizon and every saved exception, even beyond that horizon.
 for d in select distinct v from (
   select day+n v from generate_series(-1,case when op='night' then 1 else 30 end) n
   union select original_date+n from public.calendar_events cross join generate_series(-1,1) n where user_id=p_owner and sleep_schedule_id=s.id and is_exception
   union select start_date+n from public.calendar_events cross join generate_series(-1,1) n where user_id=p_owner and sleep_schedule_id=s.id and is_exception
   union select initial
  ) dates order by v loop
  if op='night' and d=initial then
   slot:=jsonb_build_object('nightDate',initial,'startDate',day,'endDate',ending,'startTime',p_change->>'startTime','endTime',p_change->>'endTime',
    'start',(day+starts) at time zone zone,'end',(ending+ends) at time zone zone);
  elsif op<>'night' and d>=initial and not exists(select 1 from public.calendar_events where user_id=p_owner and sleep_schedule_id=s.id and is_exception and original_date=d) then
   if not planner_private.routine_interval_valid(d,starts,ends,zone) then return jsonb_build_object('status','invalid'); end if;
   slot:=jsonb_build_object('nightDate',d,'startDate',d,'endDate',planner_private.routine_end_date(d,starts,ends),'startTime',p_change->>'startTime','endTime',p_change->>'endTime',
    'start',(d+starts) at time zone zone,'end',(planner_private.routine_end_date(d,starts,ends)+ends) at time zone zone);
  else slot:=planner_private.sleep_night(p_owner,d); end if;
  if slot is not null then
   checks:=checks||jsonb_build_array(slot);
   if (op='night' and d=initial) or (op<>'night' and d between initial and initial+29) then intervals:=intervals||jsonb_build_array(slot); end if;
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(checks) a cross join jsonb_array_elements(checks) b where a->>'nightDate'<b->>'nightDate'
  and (a->>'start')::timestamptz<(b->>'end')::timestamptz and (b->>'start')::timestamptz<(a->>'end')::timestamptz)
 then return jsonb_build_object('status','overlap'); end if;
 select count(*) into preserved from public.calendar_events where user_id=p_owner and sleep_schedule_id=s.id and is_exception and original_date>=initial;
 select version into plan_version from public.planner_state_versions where user_id=p_owner;
 return jsonb_build_object('status','complete','effectiveDate',initial,'rangeStart',day,'rangeEnd',case when op='night' then ending else day+30 end,
  'timezone',zone,'preserved',preserved,'intervals',intervals,
  'token',md5(jsonb_build_object('change',p_change,'schedule',s.version,'state',plan_version,'intervals',intervals,'checks',checks)::text));
exception when invalid_text_representation or datetime_field_overflow or invalid_parameter_value then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.sleep_prepare(uuid,jsonb) from public,anon,authenticated;

-- Only the authenticated HTTP service can attest a freshly read external calendar preview.
grant usage on schema planner_private to service_role;
create function public.planner_sleep_prepare(p_owner uuid,p_change jsonb) returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select planner_private.sleep_prepare(p_owner,p_change)
$$;
revoke all on function public.planner_sleep_prepare(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.planner_sleep_prepare(uuid,jsonb),planner_private.sleep_prepare(uuid,jsonb) to service_role;

create function planner_private.sleep_commit(p_owner uuid,p_request jsonb,p_token text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.sleep_schedules; c jsonb:=p_request->'change'; op text:=c->>'operation'; receipt public.planner_command_receipts;
 preview jsonb; request_id uuid:=(p_request->>'operationId')::uuid; day date; first_day date; parent uuid; new_parent uuid; outcome jsonb;
begin
 if request_id is null or p_owner is null then return jsonb_build_object('status','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':sleep',0));
 select * into receipt from public.planner_command_receipts where user_id=p_owner and operation_id=request_id;
 if found then
  if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
  return jsonb_set(receipt.outcome,'{status}','"already-applied"');
 end if;
 -- Calendar writes also take this row lock via touch_plan_state, closing the preview/write race.
 insert into public.planner_state_versions(user_id) values(p_owner) on conflict do nothing;
 perform 1 from public.planner_state_versions where user_id=p_owner for update;
 preview:=planner_private.sleep_prepare(p_owner,c);
 if preview->>'status'<>'complete' then return preview; end if;
 if preview->>'token' is distinct from p_token then return jsonb_build_object('status','conflict'); end if;
 first_day:=(preview->>'effectiveDate')::date;
 insert into planner_private.sleep_writers values(txid_current(),p_owner);
 if op='setup' then
  insert into public.sleep_schedules(user_id,timezone,start_time,end_time,effective_date) values(p_owner,preview->>'timezone',(c->>'startTime')::time,(c->>'endTime')::time,first_day) returning * into s;
 else select * into s from public.sleep_schedules where user_id=p_owner for update; end if;
 if op='night' then
  day:=(c->>'startDate')::date;
  select id into parent from public.calendar_events where sleep_schedule_id=s.id and is_recurring and start_date<=first_day
   and (end_type='never' or end_date_recurrence>=first_day) order by start_date desc limit 1;
  insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone,is_protected,app_owned,sleep_schedule_id,is_exception,recurring_event_id,original_date)
  values(p_owner,'Sleep and Wake',day,planner_private.routine_end_date(day,(c->>'startTime')::time,(c->>'endTime')::time),(c->>'startTime')::time,(c->>'endTime')::time,s.timezone,true,true,s.id,true,parent,first_day)
  on conflict(sleep_schedule_id,original_date) where sleep_schedule_id is not null and is_exception do update set start_date=excluded.start_date,end_date=excluded.end_date,start_time=excluded.start_time,end_time=excluded.end_time;
 else
  insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone,is_protected,app_owned,sleep_schedule_id,is_recurring,recurrence_rule,end_type)
  values(p_owner,'Sleep and Wake',first_day,planner_private.routine_end_date(first_day,(c->>'startTime')::time,(c->>'endTime')::time),(c->>'startTime')::time,(c->>'endTime')::time,s.timezone,true,true,s.id,true,'{"frequency":"daily","interval":1}','never') returning id into new_parent;
  update public.calendar_events set recurring_event_id=new_parent where sleep_schedule_id=s.id and is_exception and original_date>=first_day;
  delete from public.calendar_events where sleep_schedule_id=s.id and is_recurring and start_date>=first_day and id<>new_parent;
  update public.calendar_events set end_type='on_date',end_date_recurrence=first_day-1 where sleep_schedule_id=s.id and is_recurring and id<>new_parent and start_date<first_day and (end_type='never' or end_date_recurrence>=first_day);
  update public.sleep_schedules set start_time=(c->>'startTime')::time,end_time=(c->>'endTime')::time,effective_date=first_day where id=s.id;
 end if;
 update public.sleep_schedules set version=gen_random_uuid() where id=s.id returning * into s;
 delete from planner_private.sleep_writers where transaction_id=txid_current();
 outcome:=jsonb_build_object('status','complete','scheduleId',s.id,'version',s.version);
 insert into public.planner_command_receipts(user_id,operation_id,request,outcome) values(p_owner,request_id,p_request,outcome);
 return outcome;
end $$;
revoke all on function planner_private.sleep_commit(uuid,jsonb,text) from public,anon,authenticated;
create function public.planner_sleep_commit(p_owner uuid,p_request jsonb,p_token text) returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select planner_private.sleep_commit(p_owner,p_request,p_token)
$$;
revoke all on function public.planner_sleep_commit(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.planner_sleep_commit(uuid,jsonb,text),planner_private.sleep_commit(uuid,jsonb,text) to service_role;

-- AI proposals use the same protected occupancy even if an older client bypasses HTTP validation.
create function planner_private.sleep_overlaps(p_owner uuid,p_start timestamptz,p_end timestamptz) returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare zone text; d date; slot jsonb;
begin
 select timezone into zone from public.sleep_schedules where user_id=p_owner;
 if zone is null then return false; end if;
 if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '93 days' then return true; end if;
 if exists(select 1 from public.calendar_events where user_id=p_owner and sleep_schedule_id is not null and is_exception
  and (start_date+start_time) at time zone timezone<p_end and (end_date+end_time) at time zone timezone>p_start) then return true; end if;
 for d in select (p_start at time zone zone)::date-1+n from generate_series(0,(p_end at time zone zone)::date-(p_start at time zone zone)::date+1) n loop
  slot:=planner_private.sleep_night(p_owner,d);
  if slot is not null and (slot->>'start')::timestamptz<p_end and (slot->>'end')::timestamptz>p_start then return true; end if;
  if slot is null and exists(select 1 from public.calendar_events where user_id=p_owner and sleep_schedule_id is not null and is_recurring and start_date<=d
    and (end_type='never' or end_date_recurrence>=d) and not planner_private.routine_interval_valid(d,start_time,end_time,zone)) then return true; end if;
 end loop;
 return false;
end $$;
revoke all on function planner_private.sleep_overlaps(uuid,timestamptz,timestamptz) from public,anon,authenticated;
create function planner_private.guard_sleep_proposal() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare item jsonb; c jsonb; d date; a timestamptz; b timestamptz;
begin
 if not exists(select 1 from public.sleep_schedules where user_id=new.user_id) then return new; end if;
 if tg_op='UPDATE' and new.state<>'accepted' and new.body is not distinct from old.body then return new; end if;
 for item in select value from jsonb_array_elements(coalesce(new.body->'events','[]')) where value->>'kind'<>'event-remove' loop
  c:=item->'changes';
  a:=((c->>'start_date')::date+(c->>'start_time')::time) at time zone (c->>'timezone');
  b:=((c->>'end_date')::date+(c->>'end_time')::time) at time zone (c->>'timezone');
  if planner_private.sleep_overlaps(new.user_id,a,b) then raise exception using errcode='23514',message='AI proposals must preserve planned sleep'; end if;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(new.body->'capture'->'items',new.body->'items','[]')) where value->>'kind'='routine-create' loop
  c:=item->'changes';
  -- Cover every weekly day and annual offset change, including pending sleep revisions.
  for d in select (c->>'date')::date+n from generate_series(0,732) n loop
   if c->'rule'->>'frequency'='weekly' and not (c->'rule'->'days_of_week' @> to_jsonb(array[extract(dow from d)::integer])) then continue; end if;
   a:=(d+(c->>'startTime')::time) at time zone (c->>'timezone');
   b:=(planner_private.routine_end_date(d,(c->>'startTime')::time,(c->>'endTime')::time)+(c->>'endTime')::time) at time zone (c->>'timezone');
   if planner_private.sleep_overlaps(new.user_id,a,b) then raise exception using errcode='23514',message='AI routines must preserve planned sleep'; end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function planner_private.guard_sleep_proposal() from public,anon,authenticated;
create trigger sleep_proposal_guard before insert or update of body,state on public.planner_ai_proposals for each row execute function planner_private.guard_sleep_proposal();
