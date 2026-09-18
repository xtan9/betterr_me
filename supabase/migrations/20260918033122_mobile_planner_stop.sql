-- Explicit execution endings, never inferred actual work. See mobile-planner-stop.md.
alter table public.calendar_events add column session_ended_at timestamptz;
create function public.clear_rescheduled_session_end() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.session_ended_at is not distinct from old.session_ended_at and
    row(new.start_date,new.start_time,new.end_date,new.end_time,new.timezone) is distinct from
    row(old.start_date,old.start_time,old.end_date,old.end_time,old.timezone) then new.session_ended_at := null; end if;
  return new;
end $$;
create trigger clear_rescheduled_session_end before update on public.calendar_events
for each row execute function public.clear_rescheduled_session_end();
create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null,
  task_id uuid not null,
  planned_event jsonb not null,
  ended_at timestamptz not null,
  actual_start timestamptz,
  worked_seconds integer,
  version uuid not null default gen_random_uuid()
);
create table public.planner_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  version uuid not null default gen_random_uuid()
);
create table public.planner_command_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  outcome jsonb not null,
  primary key(user_id,operation_id)
);
alter table public.work_sessions enable row level security;
alter table public.planner_changes enable row level security;
alter table public.planner_command_receipts enable row level security;
revoke all on public.work_sessions,public.planner_changes,public.planner_command_receipts from public,anon,authenticated;
grant select on public.work_sessions,public.planner_changes,public.planner_command_receipts to authenticated;
create policy session_owner on public.work_sessions for select to authenticated using ((select auth.uid())=user_id);
create policy change_owner on public.planner_changes for select to authenticated using ((select auth.uid())=user_id);
create policy planner_receipt_owner on public.planner_command_receipts for select to authenticated using ((select auth.uid())=user_id);
create index work_sessions_owner on public.work_sessions(user_id,ended_at);
create index planner_changes_owner on public.planner_changes(user_id,created_at);

create function planner_private.planner_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  owner_id uuid := auth.uid();
  request_id uuid := (p_request->>'operationId')::uuid;
  receipt public.planner_command_receipts;
  event public.calendar_events;
  before_event jsonb;
  task public.tasks;
  session public.work_sessions;
  change_id uuid;
  ended timestamptz := date_trunc('second',clock_timestamp());
  zone text;
  outcome jsonb;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if request_id is null or jsonb_typeof(p_request) is distinct from 'object'
    or p_request->>'operation' is distinct from 'stop' or p_request->>'eventId' is null or p_request->>'expectedVersion' is null
    or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','eventId','expectedVersion')) then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
  select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
  if found then
    if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  select * into event from public.calendar_events where user_id=owner_id and id=(p_request->>'eventId')::uuid for update;
  if not found then return jsonb_build_object('status','not-found'); end if;
  if event.version is distinct from (p_request->>'expectedVersion')::uuid then return jsonb_build_object('status','conflict'); end if;
  if event.session_ended_at is not null then return jsonb_build_object('status','conflict'); end if;
  if event.task_id is null or event.is_protected or not event.app_owned or event.start_time is null
    or event.is_recurring or event.is_exception or event.recurring_event_id is not null or event.original_date is not null
    or event.recurrence_rule is not null or event.end_type is not null or event.end_count is not null or event.end_date_recurrence is not null then
    return jsonb_build_object('status','unsupported');
  end if;
  select * into task from public.tasks where id=event.task_id and user_id=owner_id;
  if not found then return jsonb_build_object('status','not-found'); end if;
  if task.is_completed or task.recurring_series_id is not null or task.recurring_occurrence_id is not null then return jsonb_build_object('status','unsupported'); end if;
  select coalesce(event.timezone,timezone,'UTC') into zone from public.profiles where id=owner_id;
  if not exists(select 1 from pg_timezone_names where name=zone)
    or (event.start_date+event.start_time) at time zone zone >= ended
    or (event.end_date+event.end_time) at time zone zone <= ended then return jsonb_build_object('status','conflict'); end if;
  before_event := to_jsonb(event);
  perform public.update_calendar_event_with_reminders(owner_id,event.id,
    jsonb_build_object('end_date',(ended at time zone zone)::date,'end_time',(ended at time zone zone)::time),null);
  update public.calendar_events set session_ended_at=ended where id=event.id and user_id=owner_id returning * into event;
  insert into public.work_sessions(user_id,event_id,task_id,planned_event,ended_at)
    values(owner_id,event.id,event.task_id,before_event,ended) returning * into session;
  insert into public.planner_changes(user_id,kind,before_state,after_state)
    values(owner_id,'stop',jsonb_build_object('task',to_jsonb(task),'events',jsonb_build_array(before_event),'sessions','[]'::jsonb),
      jsonb_build_object('task',to_jsonb(task),'events',jsonb_build_array(to_jsonb(event)),'sessions',jsonb_build_array(to_jsonb(session)))) returning id into change_id;
  outcome := jsonb_build_object('status','complete','changeId',change_id);
  insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
  return outcome;
exception when invalid_text_representation or datetime_field_overflow then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.planner_command(jsonb) from public,anon;
grant execute on function planner_private.planner_command(jsonb) to authenticated;
create function public.planner_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.planner_command(p_request) $$;
revoke all on function public.planner_command(jsonb) from public,anon;
grant execute on function public.planner_command(jsonb) to authenticated;
