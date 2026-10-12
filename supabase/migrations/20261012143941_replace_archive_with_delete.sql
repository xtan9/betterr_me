-- Archive is retired. Tombstones retain history and prevent stale writers from
-- resurrecting deleted work. Legacy archive fields remain internal exclusions.
alter table public.tasks add column deleted_at timestamptz;
alter table public.projects add column deleted_at timestamptz;

-- The old child guard reopens completed projects on restoration. Preserve the
-- user's completion choices during this one-time legacy restoration instead.
alter table public.tasks disable trigger planner_guard_project_child;
update public.tasks set archived_at=null where archived_at is not null;
update public.projects set status='active' where status='archived';
alter table public.tasks enable trigger planner_guard_project_child;

create or replace function planner_private.guard_completed_project_child() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare parent public.projects;
begin
  if new.project_id is not null and not new.is_completed and new.archived_at is null then
    select * into parent from public.projects where id=new.project_id and user_id=new.user_id for no key update;
    if not found or parent.deleted_at is not null then raise exception using errcode='23503',message='Project not found'; end if;
    if parent.completed_at is not null then
      if tg_op='INSERT' or old.project_id is distinct from new.project_id then
        raise exception using errcode='23514',message='Reopen the project before adding open tasks';
      end if;
      -- Existing explicit child-reopen behavior remains intact.
      update public.projects set completed_at=null where id=parent.id and user_id=new.user_id;
    end if;
  end if;
  return new;
end $$;

create policy tasks_not_deleted on public.tasks as restrictive for all to public
  using (deleted_at is null) with check (deleted_at is null);
create policy projects_not_deleted on public.projects as restrictive for all to public
  using (deleted_at is null) with check (deleted_at is null);

create table planner_private.deletion_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null, request jsonb not null, outcome jsonb not null,
  primary key(user_id,operation_id)
);
revoke all on planner_private.deletion_receipts from public,anon,authenticated;

create function planner_private.guard_deleted_item() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then
    -- Recurrence lifecycle commands retain their established occurrence semantics.
    if tg_table_name='tasks' and (to_jsonb(old)->>'recurring_series_id' is not null
      or to_jsonb(old)->>'recurring_occurrence_id' is not null) then return old; end if;
    -- Account erasure remains separate; ordinary hard deletes need the reviewed command.
    if exists(select 1 from public.profiles where id=old.user_id) then
      raise exception using errcode='23514',message='Use the deletion preview and confirmation command';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.deleted_at is not null then
    raise exception using errcode='23514',message='Deleted items cannot be changed';
  end if;
  if new.deleted_at is not null and current_user in ('authenticated','anon') then
    raise exception using errcode='42501',message='Use the deletion confirmation command';
  end if;
  if new.deleted_at is null then
    if (tg_table_name='tasks' and to_jsonb(new)->>'archived_at' is not null)
      or (tg_table_name='projects' and to_jsonb(new)->>'status'='archived') then
      raise exception using errcode='23514',message='Archiving is no longer supported; update the app';
    end if;
  end if;
  return new;
end $$;
revoke all on function planner_private.guard_deleted_item() from public,anon,authenticated;
create trigger aaaa_guard_deleted_task before insert or update or delete on public.tasks
  for each row execute function planner_private.guard_deleted_item();
create trigger aaaa_guard_deleted_project before insert or update or delete on public.projects
  for each row execute function planner_private.guard_deleted_item();

-- Serialize new relationships with deletion, including privileged legacy writers.
create function planner_private.guard_deleted_relationship() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare target uuid; item jsonb;
begin
  if tg_table_name='tasks' then
    target:=new.project_id;
    if target is not null then
      select to_jsonb(p) into item from public.projects p where id=target and user_id=new.user_id for share;
      if item is null or item->>'deleted_at' is not null then raise exception using errcode='23503',message='Project is unavailable'; end if;
    end if;
  elsif tg_table_name='calendar_events' then
    for target in select unnest(array[new.task_id,new.booking_task_id]) loop
      if target is not null then
        select to_jsonb(t) into item from public.tasks t where id=target and user_id=new.user_id for share;
        if item is null or item->>'deleted_at' is not null then raise exception using errcode='23503',message='Task is unavailable'; end if;
      end if;
    end loop;
  elsif tg_table_name='reminders' then
    if new.source_type='task' then
      select to_jsonb(t) into item from public.tasks t where id=new.source_id and user_id=new.user_id for share;
      if item is null or item->>'deleted_at' is not null then raise exception using errcode='23503',message='Task is unavailable'; end if;
    end if;
  else
    for target in select unnest(new.task_ids) loop
      select to_jsonb(t) into item from public.tasks t where id=target and user_id=new.user_id for share;
      if item is null or item->>'deleted_at' is not null then raise exception using errcode='23503',message='Task is unavailable'; end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function planner_private.guard_deleted_relationship() from public,anon,authenticated;
create trigger guard_deleted_project_link before insert or update of project_id on public.tasks
  for each row execute function planner_private.guard_deleted_relationship();
create trigger guard_deleted_event_link before insert or update of task_id,booking_task_id on public.calendar_events
  for each row execute function planner_private.guard_deleted_relationship();
create trigger guard_deleted_queue_link before insert or update on public.action_queue_state
  for each row execute function planner_private.guard_deleted_relationship();
create trigger guard_deleted_priority_link before insert or update on public.daily_priority_state
  for each row execute function planner_private.guard_deleted_relationship();
create trigger guard_deleted_task_reminder before insert or update of source_id,source_type on public.reminders
  for each row execute function planner_private.guard_deleted_relationship();

create function planner_private.deletion_preview(p_kind text,p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); item jsonb; plan jsonb; children jsonb; retained jsonb;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if p_kind='project' then
    select to_jsonb(p) into item from public.projects p where id=p_id and user_id=owner_id and deleted_at is null;
    if item is null then return jsonb_build_object('status','not-found'); end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version) order by id),'[]') into children
      from public.tasks where user_id=owner_id and project_id=p_id and deleted_at is null;
    return jsonb_build_object('status','complete','kind',p_kind,'id',p_id,'version',item->>'version',
      'title',item->>'name','children',children,'plan','[]'::jsonb,'retained','[]'::jsonb);
  elsif p_kind='task' then
    select to_jsonb(t) into item from public.tasks t where id=p_id and user_id=owner_id and deleted_at is null;
    if item is null then return jsonb_build_object('status','not-found'); end if;
    if item->>'recurring_series_id' is not null or item->>'recurring_occurrence_id' is not null then
      return jsonb_build_object('status','unsupported');
    end if;
    select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into plan
      from public.calendar_events e join public.profiles p on p.id=e.user_id
      where e.user_id=owner_id and e.task_id=p_id and e.app_owned
        and e.booking_task_id is null and e.routine_occurrence_id is null
        and e.session_ended_at is null and not e.is_recurring and not e.is_exception
        and e.recurring_event_id is null and e.original_date is null and e.recurrence_rule is null
        and e.end_type is null and e.end_count is null and e.end_date_recurrence is null
        and e.start_time is not null and e.end_time is not null
        and (e.start_date+e.start_time) at time zone coalesce(e.timezone,p.timezone,'UTC')>statement_timestamp();
    select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into retained from public.calendar_events e
      where e.user_id=owner_id and (e.task_id=p_id or e.booking_task_id=p_id)
      and not exists(select 1 from jsonb_array_elements(plan) x where x->>'id'=e.id::text);
    return jsonb_build_object('status','complete','kind',p_kind,'id',p_id,'version',item->>'version',
      'title',item->>'title','plan',plan,'retained',retained,'children','[]'::jsonb);
  end if;
  return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.deletion_preview(text,uuid) from public,anon;
grant execute on function planner_private.deletion_preview(text,uuid) to authenticated;
create function public.item_deletion_preview(p_kind text,p_id uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.deletion_preview(p_kind,p_id) $$;
revoke all on function public.item_deletion_preview(text,uuid) from public,anon;
grant execute on function public.item_deletion_preview(text,uuid) to authenticated;

create function planner_private.delete_item(p_operation_id uuid,p_preview jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); target uuid; kind text:=p_preview->>'kind'; current_preview jsonb;
  receipt planner_private.deletion_receipts; item jsonb; result jsonb; change_id uuid;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if p_operation_id is null or kind is null or kind not in ('task','project') then return jsonb_build_object('status','invalid'); end if;
  target:=(p_preview->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':delete:'||p_operation_id::text,0));
  select * into receipt from planner_private.deletion_receipts where user_id=owner_id and operation_id=p_operation_id;
  if found then
    if receipt.request is distinct from p_preview then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  if kind='task' then
    perform 1 from public.tasks where id=target and user_id=owner_id for update;
    perform 1 from public.calendar_events where user_id=owner_id and (task_id=target or booking_task_id=target) order by id for update;
  else
    perform 1 from public.projects where id=target and user_id=owner_id for update;
    perform 1 from public.tasks where project_id=target and user_id=owner_id order by id for update;
  end if;
  current_preview:=planner_private.deletion_preview(kind,target);
  if current_preview->>'status'<>'complete' then return current_preview; end if;
  if current_preview is distinct from p_preview then return jsonb_build_object('status','conflict'); end if;
  if kind='task' then
    for item in select value from jsonb_array_elements(current_preview->'plan') loop
      perform public.delete_calendar_event_with_reminders(owner_id,(item->>'id')::uuid);
    end loop;
    -- Retain full event contents and clear only the actionable task relationship.
    update public.calendar_events set task_id=case when task_id=target then null else task_id end,
      booking_task_id=case when booking_task_id=target then null else booking_task_id end
      where user_id=owner_id and (task_id=target or booking_task_id=target);
    update public.action_queue_state set task_ids=array_remove(task_ids,target),version=gen_random_uuid()
      where user_id=owner_id and target=any(task_ids);
    update public.daily_priority_state set task_ids=array_remove(task_ids,target),version=gen_random_uuid()
      where user_id=owner_id and target=any(task_ids);
    delete from public.reminders where user_id=owner_id and source_type='task' and source_id=target;
    update public.tasks set deleted_at=statement_timestamp(),archived_at=statement_timestamp()
      where id=target and user_id=owner_id;
  else
    update public.tasks set project_id=null where project_id=target and user_id=owner_id and deleted_at is null;
    update public.projects set deleted_at=statement_timestamp(),status='archived' where id=target and user_id=owner_id;
  end if;
  insert into public.planner_changes(user_id,kind,before_state,after_state)
    values(owner_id,'delete-'||kind,current_preview||jsonb_build_object(kind,
      case when kind='task' then jsonb_build_object('title',current_preview->>'title') else jsonb_build_object('name',current_preview->>'title') end),jsonb_build_object('deletedId',target)) returning id into change_id;
  result:=jsonb_build_object('status','complete','changeId',change_id);
  insert into planner_private.deletion_receipts values(owner_id,p_operation_id,p_preview,result);
  return result;
exception when invalid_text_representation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.delete_item(uuid,jsonb) from public,anon;
grant execute on function planner_private.delete_item(uuid,jsonb) to authenticated;
create function public.item_delete_command(p_operation_id uuid,p_preview jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.delete_item(p_operation_id,p_preview) $$;
revoke all on function public.item_delete_command(uuid,jsonb) from public,anon;
grant execute on function public.item_delete_command(uuid,jsonb) to authenticated;
