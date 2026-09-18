-- Persisted snapshot restoration. See docs/architecture/mobile-planner-undo.md.
create function planner_private.advance_history_version() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin new.version := gen_random_uuid(); return new; end $$;
revoke all on function planner_private.advance_history_version() from public,anon,authenticated;
create trigger planner_session_version before update on public.work_sessions
for each row execute function planner_private.advance_history_version();
create trigger planner_change_version before update on public.planner_changes
for each row execute function planner_private.advance_history_version();

-- Reminder edits serialize with event lifecycle writes and invalidate released
-- tombstones even when a newly attached reminder is subsequently deleted.
create function planner_private.track_reminder_version() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare item record;
begin
  for item in select distinct source_id,user_id from (
    select old.source_id,old.user_id where tg_op<>'INSERT' and old.source_type='calendar_event'
    union select new.source_id,new.user_id where tg_op<>'DELETE' and new.source_type='calendar_event'
  ) ids order by source_id,user_id loop
    perform 1 from public.calendar_events where id=item.source_id and user_id=item.user_id for update;
    update public.planner_event_versions set version=gen_random_uuid() where event_id=item.source_id and user_id=item.user_id;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function planner_private.track_reminder_version() from public,anon,authenticated;
create trigger planner_track_reminder_version before insert or update or delete on public.reminders
for each row execute function planner_private.track_reminder_version();

-- Only stored server snapshots enter this helper. Never callable by clients.
create function planner_private.restore_snapshot(p_table text,p_snapshot jsonb,p_owner uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare columns text; restored integer;
begin
  if p_table not in ('tasks','projects','calendar_events') or p_snapshot->>'user_id' is distinct from p_owner::text then
    raise exception using errcode='PT409',message='Invalid stored restoration snapshot';
  end if;
  select string_agg(format('%I',attname),',' order by attnum) into columns from pg_attribute
    where attrelid=format('public.%I',p_table)::regclass and attnum>0 and not attisdropped and attgenerated=''
      and attname not in ('id','user_id','version','created_at','updated_at') and p_snapshot ? attname;
  execute format('update public.%I set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1)) where id=$2 and user_id=$3',p_table,columns,columns,p_table)
    using p_snapshot,(p_snapshot->>'id')::uuid,p_owner;
  get diagnostics restored = row_count;
  if restored<>1 then raise exception using errcode='PT409',message='Restoration target disappeared'; end if;
end $$;
revoke all on function planner_private.restore_snapshot(text,jsonb,uuid) from public,anon,authenticated;

create function planner_private.insert_snapshot(p_table text,p_snapshot jsonb,p_owner uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare columns text;
begin
  if p_table not in ('calendar_events','reminders') or p_snapshot->>'user_id' is distinct from p_owner::text then
    raise exception using errcode='PT409',message='Invalid stored insertion snapshot';
  end if;
  select string_agg(format('%I',attname),',' order by attnum) into columns from pg_attribute
    where attrelid=format('public.%I',p_table)::regclass and attnum>0 and not attisdropped and attgenerated='' and p_snapshot ? attname;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1)',p_table,columns,columns,p_table) using p_snapshot;
end $$;
revoke all on function planner_private.insert_snapshot(text,jsonb,uuid) from public,anon,authenticated;

alter function planner_private.planner_command(jsonb) rename to planner_completion_command;
revoke all on function planner_private.planner_completion_command(jsonb) from authenticated;
create function planner_private.planner_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  owner_id uuid := auth.uid(); request_id uuid := (p_request->>'operationId')::uuid;
  change public.planner_changes; receipt public.planner_command_receipts;
  task public.tasks; project public.projects; event public.calendar_events; session public.work_sessions;
  item jsonb; token uuid; outcome jsonb; affected uuid;
begin
  if p_request->>'operation' is distinct from 'undo' then return planner_private.planner_completion_command(p_request); end if;
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if request_id is null or p_request->>'changeId' is null or p_request->>'expectedVersion' is null
    or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','changeId','expectedVersion')) then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
  select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
  if found then
    if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  select * into change from public.planner_changes where user_id=owner_id and id=(p_request->>'changeId')::uuid for update;
  if not found then return jsonb_build_object('status','not-found'); end if;
  if change.version is distinct from (p_request->>'expectedVersion')::uuid or change.undone_at is not null then return jsonb_build_object('status','conflict'); end if;
  if change.kind not in ('stop','complete','complete-project') then return jsonb_build_object('status','unsupported'); end if;
  if change.kind='complete-project' then
    select * into project from public.projects where user_id=owner_id and id=(change.after_state->'project'->>'id')::uuid for update;
    if not found or project.version is distinct from (change.after_state->'project'->>'version')::uuid then return jsonb_build_object('status','conflict'); end if;
  else
    select * into task from public.tasks where user_id=owner_id and id=(change.after_state->'task'->>'id')::uuid for update;
    if not found or task.version is distinct from (change.after_state->'task'->>'version')::uuid then return jsonb_build_object('status','conflict'); end if;
  end if;
  -- All checks precede restoration. Exceptions also roll back the whole block.
  for item in select value from jsonb_array_elements(coalesce(change.after_state->'events','[]')) order by value->>'id' loop
    select * into event from public.calendar_events where user_id=owner_id and id=(item->>'id')::uuid for update;
    if not found or event.version is distinct from (item->>'version')::uuid then return jsonb_build_object('status','conflict'); end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(change.after_state->'released','[]')) order by value->>'id' loop
    affected := (item->>'id')::uuid;
    select version into token from public.planner_event_versions where event_id=affected and user_id=owner_id for update;
    if not found or token is distinct from (item->>'version')::uuid or exists(select 1 from public.calendar_events where id=affected)
      or exists(select 1 from public.reminders where source_type='calendar_event' and source_id=affected) then return jsonb_build_object('status','conflict'); end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(change.after_state->'sessions','[]')) order by value->>'id' loop
    select * into session from public.work_sessions where user_id=owner_id and id=(item->>'id')::uuid for update;
    if not found or session.version is distinct from (item->>'version')::uuid then return jsonb_build_object('status','conflict'); end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(change.before_state->'reminders','[]')) loop
    if exists(select 1 from public.reminders where id=(item->>'id')::uuid) then return jsonb_build_object('status','conflict'); end if;
  end loop;
  if change.kind='complete-project' then
    perform planner_private.restore_snapshot('projects',change.before_state->'project',owner_id);
  elsif change.kind='complete' then
    perform planner_private.restore_snapshot('tasks',change.before_state->'task',owner_id);
  end if;
  for item in select value from jsonb_array_elements(coalesce(change.before_state->'events','[]')) order by value->>'id' loop
    if exists(select 1 from jsonb_array_elements(coalesce(change.after_state->'released','[]')) r where r->>'id'=item->>'id') then
      perform planner_private.insert_snapshot('calendar_events',item||jsonb_build_object('version',gen_random_uuid(),'updated_at',statement_timestamp()),owner_id);
    else
      perform planner_private.restore_snapshot('calendar_events',item,owner_id);
    end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(change.before_state->'reminders','[]')) loop
    perform planner_private.insert_snapshot('reminders',item,owner_id);
  end loop;
  delete from public.work_sessions where user_id=owner_id and id in(select (value->>'id')::uuid from jsonb_array_elements(coalesce(change.after_state->'sessions','[]')));
  update public.planner_changes set undone_at=statement_timestamp() where id=change.id and user_id=owner_id;
  outcome := jsonb_build_object('status','complete','changeId',change.id);
  insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
  return outcome;
exception when sqlstate 'PT409' or integrity_constraint_violation or serialization_failure or deadlock_detected then
  return jsonb_build_object('status','conflict');
when invalid_text_representation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.planner_command(jsonb) from public,anon;
grant execute on function planner_private.planner_command(jsonb) to authenticated;
create or replace function public.planner_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.planner_command(p_request) $$;
