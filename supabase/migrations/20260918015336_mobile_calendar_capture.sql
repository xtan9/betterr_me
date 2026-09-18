-- Mapping, rollout and rollback: docs/architecture/mobile-calendar.md.
alter table public.calendar_events
  add column timezone text,
  add column task_id uuid,
  add column is_protected boolean not null default true,
  add column app_owned boolean not null default false,
  add column version uuid not null default gen_random_uuid();
create unique index if not exists tasks_id_owner_calendar_key on public.tasks(id,user_id);
alter table public.calendar_events add constraint calendar_task_owner_fk
  foreign key(task_id,user_id) references public.tasks(id,user_id);

create function public.advance_calendar_version() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  new.version := gen_random_uuid();
  return new;
end $$;
create trigger advance_calendar_version before update on public.calendar_events
for each row execute function public.advance_calendar_version();

create table public.calendar_capture_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  outcome jsonb not null,
  before_event jsonb,
  before_reminders jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
alter table public.calendar_capture_receipts enable row level security;
revoke all on public.calendar_capture_receipts from public,anon,authenticated;
grant select on public.calendar_capture_receipts to authenticated;
create policy calendar_receipt_owner on public.calendar_capture_receipts
for select to authenticated using ((select auth.uid())=user_id);

create function public.calendar_capture_command(
  p_operation text, p_operation_id uuid, p_event_id uuid default null,
  p_expected_version uuid default null, p_changes jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
declare
  owner_id uuid := auth.uid();
  current_event public.calendar_events;
  candidate public.calendar_events;
  receipt public.calendar_capture_receipts;
  request jsonb := jsonb_build_object('operation',p_operation,'eventId',p_event_id,
    'version',p_expected_version,'changes',p_changes);
  before_event jsonb;
  before_reminders jsonb := '[]'::jsonb;
  outcome jsonb;
  zone text;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if p_operation_id is null or p_operation is null or p_operation not in ('create','edit','remove')
    or p_changes is null or jsonb_typeof(p_changes)<>'object'
    or exists(select 1 from jsonb_object_keys(p_changes) k where k not in
      ('title','start_date','start_time','end_date','end_time','timezone','is_protected','task_id'))
    or (p_operation='create' and (p_event_id is not null or p_expected_version is not null))
    or (p_operation<>'create' and (p_event_id is null or p_expected_version is null))
    or (p_operation='remove' and p_changes<>'{}'::jsonb) then
    return jsonb_build_object('status','invalid-transition');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':calendar:'||p_operation_id::text,0));
  select * into receipt from public.calendar_capture_receipts where user_id=owner_id and operation_id=p_operation_id;
  if found then
    if receipt.request is distinct from request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  if p_operation<>'create' then
    select * into current_event from public.calendar_events where id=p_event_id and user_id=owner_id for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if current_event.version<>p_expected_version then return jsonb_build_object('status','conflict'); end if;
    if current_event.is_recurring or current_event.is_exception or current_event.recurring_event_id is not null
      or current_event.recurrence_rule is not null or current_event.original_date is not null
      or current_event.end_type is not null or current_event.end_count is not null or current_event.end_date_recurrence is not null then
      return jsonb_build_object('status','unsupported');
    end if;
    before_event := to_jsonb(current_event);
    select coalesce(jsonb_agg(to_jsonb(r)),'[]') into before_reminders from public.reminders r
      where user_id=owner_id and source_type='calendar_event' and source_id=p_event_id;
  end if;
  if p_operation='remove' then
    perform public.delete_calendar_event_with_reminders(owner_id,p_event_id);
    outcome := jsonb_build_object('status','complete','event',before_event,'removed',true);
  else
    if p_changes ? 'title' and (jsonb_typeof(p_changes->'title')<>'string'
      or length(btrim(p_changes->>'title'))=0 or length(p_changes->>'title')>200) then
      return jsonb_build_object('status','invalid-transition');
    end if;
    if p_changes ? 'is_protected' and jsonb_typeof(p_changes->'is_protected')<>'boolean' then
      return jsonb_build_object('status','invalid-transition');
    end if;
    if exists(select 1 from jsonb_each(p_changes) p where p.key in ('start_date','end_date')
      and (jsonb_typeof(p.value)<>'string' or (p.value#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
      or exists(select 1 from jsonb_each(p_changes) p where p.key in ('start_time','end_time')
      and p.value<>'null'::jsonb and (jsonb_typeof(p.value)<>'string' or (p.value#>>'{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$')) then
      return jsonb_build_object('status','invalid-transition');
    end if;
    candidate := jsonb_populate_record(current_event,p_changes);
    if p_operation='create' then
      candidate.is_protected := coalesce(candidate.is_protected,true);
    end if;
    select coalesce(candidate.timezone,p.timezone,'UTC') into zone from public.profiles p where id=owner_id;
    if candidate.title is null or candidate.start_date is null or candidate.end_date is null
      or candidate.is_protected is null or zone is null
      or (p_operation='create' and candidate.timezone is null)
      or not exists(select 1 from pg_timezone_names where name=zone)
      or (candidate.start_time is null)<>(candidate.end_time is null)
      or candidate.end_date<candidate.start_date
      or (candidate.start_time is not null and
        (candidate.end_date+candidate.end_time) at time zone zone <= (candidate.start_date+candidate.start_time) at time zone zone) then
      return jsonb_build_object('status','invalid-transition');
    end if;
    -- Reject nonexistent local wall times during spring-forward, rather than normalize them.
    if candidate.start_time is not null and (
      ((candidate.start_date+candidate.start_time) at time zone zone) at time zone zone <> candidate.start_date+candidate.start_time
      or ((candidate.end_date+candidate.end_time) at time zone zone) at time zone zone <> candidate.end_date+candidate.end_time) then
      return jsonb_build_object('status','invalid-transition');
    end if;
    if candidate.task_id is not null then
      perform 1 from public.tasks where id=candidate.task_id and user_id=owner_id for key share;
      if not found then return jsonb_build_object('status','not-found'); end if;
    end if;
    if p_operation='create' then
      insert into public.calendar_events(user_id,title,start_date,start_time,end_date,end_time,timezone,task_id,is_protected,app_owned)
      values(owner_id,candidate.title,candidate.start_date,candidate.start_time,candidate.end_date,candidate.end_time,
        zone,candidate.task_id,candidate.is_protected,true) returning * into current_event;
    else
      -- Reuse reminder reconciliation; only supported event fields are supplied.
      perform public.update_calendar_event_with_reminders(owner_id,p_event_id,
        p_changes - array['timezone','task_id','is_protected'],null);
      update public.calendar_events set timezone=zone,task_id=candidate.task_id,is_protected=candidate.is_protected
        where id=p_event_id and user_id=owner_id returning * into current_event;
      update public.reminders set fire_at=(current_event.start_date+coalesce(current_event.start_time,time '00:00')) at time zone zone
          - relative_minutes*interval '1 minute'
        where user_id=owner_id and source_type='calendar_event' and source_id=p_event_id and status='pending' and reminder_type='relative';
    end if;
    outcome := jsonb_build_object('status','complete','event',to_jsonb(current_event),'removed',false);
  end if;
  insert into public.calendar_capture_receipts(user_id,operation_id,request,outcome,before_event,before_reminders)
  values(owner_id,p_operation_id,request,outcome,before_event,before_reminders);
  return outcome;
exception when invalid_text_representation or invalid_parameter_value or datetime_field_overflow or invalid_datetime_format or check_violation or not_null_violation then
  return jsonb_build_object('status','invalid-transition');
end $$;
revoke all on function public.calendar_capture_command(text,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.calendar_capture_command(text,uuid,uuid,uuid,jsonb) to authenticated;

-- Preserve the existing web lifecycle's grants and constrained owner. Optional
-- expected_version is checked under its existing FOR UPDATE row lock.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.update_calendar_event_with_reminders(uuid,uuid,jsonb,jsonb)'::regprocedure) into definition;
  definition := replace(definition,'UPDATE public.calendar_events',
    'IF p_event ? ''expected_version'' AND (p_event->>''expected_version'')::uuid IS DISTINCT FROM current_event.version THEN
       RAISE EXCEPTION ''Calendar event changed; reload before saving'' USING ERRCODE = ''PT409'';
     END IF;
     UPDATE public.calendar_events');
  definition := replace(definition,'COALESCE(profiles.timezone, ''UTC'')','COALESCE(updated_event.timezone, profiles.timezone, ''UTC'')');
  execute definition;
end $$;
notify pgrst,'reload schema';
