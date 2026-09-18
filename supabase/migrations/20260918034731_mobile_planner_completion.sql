-- Compatible linked completion for every ordinary task write path.
create function planner_private.normalize_task_completion() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.recurring_series_id is not null or new.recurring_occurrence_id is not null then return new; end if;
  if new.status is distinct from old.status then
    new.is_completed := new.status='done';
  elsif new.is_completed is distinct from old.is_completed then
    new.status := case when new.is_completed then 'done' else 'todo' end;
  end if;
  if new.is_completed is distinct from old.is_completed then
    new.completed_at := case when new.is_completed then coalesce(new.completed_at,clock_timestamp()) else null end;
  end if;
  return new;
end $$;
revoke all on function planner_private.normalize_task_completion() from public,anon,authenticated;
create trigger aaa_planner_normalize_completion before update on public.tasks
for each row execute function planner_private.normalize_task_completion();
alter table public.projects add column completed_at timestamptz;
create table public.planner_event_versions (
  event_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version uuid not null default gen_random_uuid()
);
alter table public.planner_event_versions enable row level security;
revoke all on public.planner_event_versions from public,anon,authenticated;
grant select on public.planner_event_versions to authenticated;
create policy event_version_owner on public.planner_event_versions for select to authenticated using ((select auth.uid())=user_id);
create index planner_event_versions_owner on public.planner_event_versions(user_id);
insert into public.planner_event_versions(event_id,user_id) select id,user_id from public.calendar_events;
create function planner_private.track_event_version() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then
    -- Account cascade deletion must not recreate a reference to the deleted owner.
    if exists(select 1 from public.profiles where id=old.user_id) then
      insert into public.planner_event_versions(event_id,user_id) values(old.id,old.user_id)
      on conflict(event_id) do update set version=gen_random_uuid();
    end if;
    return old;
  end if;
  insert into public.planner_event_versions(event_id,user_id) values(new.id,new.user_id)
  on conflict(event_id) do update set user_id=excluded.user_id,version=gen_random_uuid();
  return new;
end $$;
revoke all on function planner_private.track_event_version() from public,anon,authenticated;
create trigger planner_track_event_version after insert or update or delete on public.calendar_events
for each row execute function planner_private.track_event_version();

create function planner_private.completion_plan(p_owner uuid,p_task uuid,p_now timestamptz) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(jsonb_build_object('event',to_jsonb(e),'action',case when
    (e.start_date+e.start_time) at time zone coalesce(e.timezone,p.timezone,'UTC')>p_now then 'release' else 'end' end,
    'start',(e.start_date+e.start_time) at time zone coalesce(e.timezone,p.timezone,'UTC'),
    'end',(e.end_date+e.end_time) at time zone coalesce(e.timezone,p.timezone,'UTC')) order by e.id),'[]')
  from public.calendar_events e join public.profiles p on p.id=e.user_id
  where e.user_id=p_owner and e.task_id=p_task and e.app_owned and not e.is_protected
    and e.start_time is not null and e.end_time is not null and e.session_ended_at is null
    and not e.is_recurring and not e.is_exception and e.recurring_event_id is null and e.original_date is null
    and e.recurrence_rule is null and e.end_type is null and e.end_count is null and e.end_date_recurrence is null
    and (e.end_date+e.end_time) at time zone coalesce(e.timezone,p.timezone,'UTC')>p_now
$$;
revoke all on function planner_private.completion_plan(uuid,uuid,timestamptz) from public,anon,authenticated;
create function planner_private.completion_preview(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare task public.tasks;
begin
  select * into task from public.tasks where id=p_task_id and user_id=auth.uid();
  if not found then return jsonb_build_object('status','not-found'); end if;
  if task.recurring_series_id is not null or task.recurring_occurrence_id is not null then return jsonb_build_object('status','unsupported'); end if;
  return jsonb_build_object('status','complete','task',to_jsonb(task),'plan',planner_private.completion_plan(task.user_id,task.id,clock_timestamp()));
end $$;
revoke all on function planner_private.completion_preview(uuid) from public,anon;
grant execute on function planner_private.completion_preview(uuid) to authenticated;
create function public.planner_completion_preview(p_task_id uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.completion_preview(p_task_id) $$;
revoke all on function public.planner_completion_preview(uuid) from public,anon;
grant execute on function public.planner_completion_preview(uuid) to authenticated;

create function planner_private.complete_linked_work() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  item jsonb; event public.calendar_events; session public.work_sessions;
  ended timestamptz := date_trunc('second',clock_timestamp());
  zone text; before_events jsonb := '[]'; after_events jsonb := '[]';
  reminders jsonb := '[]'; event_reminders jsonb; sessions jsonb := '[]'; released jsonb := '[]'; token uuid;
begin
  if new.recurring_series_id is not null or new.recurring_occurrence_id is not null then return new; end if;
  perform 1 from public.calendar_events where user_id=new.user_id and task_id=new.id order by id for update;
  for item in select value from jsonb_array_elements(planner_private.completion_plan(new.user_id,new.id,ended)) loop
    event := jsonb_populate_record(null::public.calendar_events,item->'event');
    before_events := before_events||jsonb_build_array(to_jsonb(event));
    if item->>'action'='release' then
      select coalesce(jsonb_agg(to_jsonb(r)),'[]') into event_reminders from public.reminders r
        where user_id=new.user_id and source_type='calendar_event' and source_id=event.id;
      reminders := reminders||event_reminders;
      perform public.delete_calendar_event_with_reminders(new.user_id,event.id);
      select version into token from public.planner_event_versions where event_id=event.id and user_id=new.user_id;
      released := released||jsonb_build_array(jsonb_build_object('id',event.id,'version',token));
    else
      select coalesce(event.timezone,p.timezone,'UTC') into zone from public.profiles p where id=new.user_id;
      -- Zero-length endings at the exact start are explicit, not inferred work.
      update public.calendar_events set end_date=(ended at time zone zone)::date,end_time=(ended at time zone zone)::time,session_ended_at=ended
        where id=event.id and user_id=new.user_id returning * into event;
      after_events := after_events||jsonb_build_array(to_jsonb(event));
      insert into public.work_sessions(user_id,event_id,task_id,planned_event,ended_at)
        values(new.user_id,event.id,new.id,item->'event',ended) returning * into session;
      sessions := sessions||jsonb_build_array(to_jsonb(session));
    end if;
  end loop;
  insert into public.planner_changes(user_id,kind,before_state,after_state) values(new.user_id,'complete',
    jsonb_build_object('task',to_jsonb(old),'events',before_events,'sessions','[]'::jsonb,'reminders',reminders),
    jsonb_build_object('task',to_jsonb(new),'events',after_events,'sessions',sessions,'released',released));
  return new;
end $$;
revoke all on function planner_private.complete_linked_work() from public,anon,authenticated;
create trigger planner_complete_linked_work after update on public.tasks
for each row when (new.is_completed and not old.is_completed) execute function planner_private.complete_linked_work();

-- Serialize reservation creation with task completion. A completed outcome cannot
-- acquire a new eligible future reservation while its completion is in flight.
create function planner_private.guard_completed_task_reservation() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare completed boolean;
begin
  if new.task_id is not null and new.app_owned and not new.is_protected and new.session_ended_at is null then
    select is_completed into completed from public.tasks where id=new.task_id and user_id=new.user_id for share;
    if not found then raise exception using errcode='23503',message='Task not found'; end if;
    if completed and new.start_time is not null and (new.end_date+new.end_time) at time zone coalesce(new.timezone,'UTC')>clock_timestamp() then
      raise exception using errcode='PT409',message='Completed tasks cannot acquire flexible reservations';
    end if;
  end if;
  return new;
end $$;
revoke all on function planner_private.guard_completed_task_reservation() from public,anon,authenticated;
create trigger planner_guard_reservation before insert or update on public.calendar_events
for each row execute function planner_private.guard_completed_task_reservation();

create function planner_private.guard_completed_project_child() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare completed timestamptz;
begin
  if new.project_id is not null and not new.is_completed and new.archived_at is null then
    select completed_at into completed from public.projects where id=new.project_id and user_id=new.user_id for share;
    if not found then raise exception using errcode='23503',message='Project not found'; end if;
    if completed is not null then raise exception using errcode='PT409',message='Completed project cannot contain unresolved work'; end if;
  end if;
  return new;
end $$;
revoke all on function planner_private.guard_completed_project_child() from public,anon,authenticated;
create trigger planner_guard_project_child before insert or update on public.tasks
for each row execute function planner_private.guard_completed_project_child();
create function planner_private.guard_project_completion() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.completed_at is not null and old.completed_at is null and exists(select 1 from public.tasks
    where user_id=new.user_id and project_id=new.id and not is_completed and archived_at is null) then
    raise exception using errcode='PT409',message='Resolve open children before completing the project';
  end if;
  return new;
end $$;
revoke all on function planner_private.guard_project_completion() from public,anon,authenticated;
create trigger planner_guard_project_completion before update on public.projects
for each row execute function planner_private.guard_project_completion();

create function planner_private.record_project_completion() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.planner_changes(user_id,kind,before_state,after_state) values(new.user_id,'complete-project',
    jsonb_build_object('project',to_jsonb(old)),jsonb_build_object('project',to_jsonb(new)));
  return new;
end $$;
revoke all on function planner_private.record_project_completion() from public,anon,authenticated;
create trigger planner_record_project_completion after update on public.projects
for each row when (old.completed_at is null and new.completed_at is not null) execute function planner_private.record_project_completion();

alter function planner_private.planner_command(jsonb) rename to planner_stop_command;
revoke all on function planner_private.planner_stop_command(jsonb) from authenticated;
create function planner_private.planner_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid := auth.uid(); request_id uuid := (p_request->>'operationId')::uuid;
  receipt public.planner_command_receipts; task public.tasks; prior_task jsonb; project public.projects;
  outcome jsonb; change_id uuid; plan jsonb;
begin
  if p_request->>'operation'='stop' then return planner_private.planner_stop_command(p_request); end if;
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if request_id is null or p_request->>'expectedVersion' is null or coalesce(p_request->>'operation','') not in ('complete','reopen','complete-project')
    or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','expectedVersion','taskId','projectId','plan')) then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
  select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
  if found then
    if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  if p_request->>'operation'='complete-project' then
    select * into project from public.projects where user_id=owner_id and id=(p_request->>'projectId')::uuid for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if project.version is distinct from (p_request->>'expectedVersion')::uuid then return jsonb_build_object('status','conflict'); end if;
    if project.completed_at is not null then return jsonb_build_object('status','invalid'); end if;
    update public.projects set completed_at=clock_timestamp() where id=project.id returning * into project;
    select id into change_id from public.planner_changes where user_id=owner_id and kind='complete-project' and after_state->'project'->>'version'=project.version::text;
  else
    select * into task from public.tasks where user_id=owner_id and id=(p_request->>'taskId')::uuid for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if task.version is distinct from (p_request->>'expectedVersion')::uuid then return jsonb_build_object('status','conflict'); end if;
    if task.recurring_series_id is not null or task.recurring_occurrence_id is not null then return jsonb_build_object('status','unsupported'); end if;
    prior_task := to_jsonb(task);
    if p_request->>'operation'='complete' then
      if task.is_completed then return jsonb_build_object('status','invalid'); end if;
      perform 1 from public.calendar_events where user_id=owner_id and task_id=task.id order by id for update;
      plan := planner_private.completion_plan(owner_id,task.id,date_trunc('second',clock_timestamp()));
      if p_request->'plan' is distinct from plan then return jsonb_build_object('status','conflict'); end if;
      update public.tasks set is_completed=true,status='done',completed_at=clock_timestamp() where id=task.id returning * into task;
      select id into change_id from public.planner_changes where user_id=owner_id and kind='complete' and after_state->'task'->>'version'=task.version::text;
    else
      if not task.is_completed then return jsonb_build_object('status','invalid'); end if;
      update public.tasks set is_completed=false,status='todo',completed_at=null where id=task.id returning * into task;
      insert into public.planner_changes(user_id,kind,before_state,after_state) values(owner_id,'reopen',
        jsonb_build_object('task',prior_task),jsonb_build_object('task',to_jsonb(task))) returning id into change_id;
    end if;
  end if;
  outcome := jsonb_build_object('status','complete','changeId',change_id);
  insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
  return outcome;
exception when sqlstate 'PT409' then return jsonb_build_object('status','conflict');
  when invalid_text_representation or check_violation or not_null_violation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.planner_command(jsonb) from public,anon;
grant execute on function planner_private.planner_command(jsonb) to authenticated;
-- Rebind the SQL wrapper after renaming its original dependency.
create or replace function public.planner_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.planner_command(p_request) $$;
