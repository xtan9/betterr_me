-- Tasks collection: explicit project reopening and atomic parent/child restoration.
-- Existing completion, scheduling and receipt contracts remain the authority.
create or replace function planner_private.guard_completed_project_child() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare parent public.projects;
begin
  if new.project_id is not null and not new.is_completed and new.archived_at is null then
    select * into parent from public.projects where id=new.project_id and user_id=new.user_id for no key update;
    if not found then raise exception using errcode='23503',message='Project not found'; end if;
    if parent.completed_at is not null then
      update public.projects set completed_at=null where id=parent.id and user_id=new.user_id;
    end if;
  end if;
  return new;
end $$;
revoke all on function planner_private.guard_completed_project_child() from public,anon,authenticated;

alter function planner_private.planner_command(jsonb) rename to planner_before_tasks_command;
revoke all on function planner_private.planner_before_tasks_command(jsonb) from public,anon,authenticated;
create function planner_private.planner_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  owner_id uuid:=auth.uid(); request_id uuid:=(p_request->>'operationId')::uuid;
  receipt public.planner_command_receipts; parent public.projects; after_parent public.projects;
  task public.tasks; after_task public.tasks; occurrence public.recurring_task_occurrences;
  after_occurrence public.recurring_task_occurrences; series public.recurring_task_series;
  change public.planner_changes; change_id uuid; outcome jsonb;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if p_request->>'operation' not in ('reopen-project','reopen','undo') then
    return planner_private.planner_before_tasks_command(p_request);
  end if;
  if request_id is null or p_request->>'expectedVersion' is null then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
  select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
  if found then
    if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  if p_request->>'operation'='reopen-project' then
    if p_request->>'projectId' is null or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','expectedVersion','projectId')) then return jsonb_build_object('status','invalid'); end if;
    select * into parent from public.projects where id=(p_request->>'projectId')::uuid and user_id=owner_id for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if parent.version::text is distinct from p_request->>'expectedVersion' then return jsonb_build_object('status','conflict'); end if;
    if parent.completed_at is null then return jsonb_build_object('status','invalid'); end if;
    update public.projects set completed_at=null where id=parent.id returning * into after_parent;
    insert into public.planner_changes(user_id,kind,before_state,after_state) values(owner_id,'reopen-project',jsonb_build_object('project',to_jsonb(parent)),jsonb_build_object('project',to_jsonb(after_parent))) returning id into change_id;
  elsif p_request->>'operation'='reopen' then
    select * into task from public.tasks where id=(p_request->>'taskId')::uuid and user_id=owner_id;
    if task.recurring_series_id is not null then
      select * into series from public.recurring_task_series where id=task.recurring_series_id and user_id=owner_id for update;
      select * into occurrence from public.recurring_task_occurrences where id=task.recurring_occurrence_id and user_id=owner_id for update;
    end if;
    select * into task from public.tasks where id=(p_request->>'taskId')::uuid and user_id=owner_id for update;
    select * into parent from public.projects where id=task.project_id and user_id=owner_id for no key update;
    outcome:=planner_private.planner_before_tasks_command(p_request);
    if outcome->>'status'='complete' then
      change_id:=(outcome->>'changeId')::uuid;
      if parent.completed_at is not null then
        select * into after_parent from public.projects where id=parent.id and user_id=owner_id;
        update public.planner_changes set before_state=before_state||jsonb_build_object('project',to_jsonb(parent)),after_state=after_state||jsonb_build_object('project',to_jsonb(after_parent)) where id=change_id and user_id=owner_id;
      end if;
      if occurrence.id is not null then
        select * into after_occurrence from public.recurring_task_occurrences where id=occurrence.id and user_id=owner_id;
        update public.planner_changes set before_state=before_state||jsonb_build_object('occurrence',to_jsonb(occurrence)),after_state=after_state||jsonb_build_object('occurrence',to_jsonb(after_occurrence),'seriesId',series.id,'seriesToken',series.revision_token) where id=change_id and user_id=owner_id;
      end if;
    end if;
    return outcome;
  else
    select * into change from public.planner_changes where id=(p_request->>'changeId')::uuid and user_id=owner_id for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if change.kind not in ('reopen','reopen-project') then
      -- A later explicit parent completion is an intervening change, not permission
      -- to reopen the parent silently while undoing an older child completion.
      if change.before_state ? 'task' and (change.before_state->'task'->>'is_completed')::boolean=false then
        perform 1 from public.projects where id=(change.before_state->'task'->>'project_id')::uuid and user_id=owner_id and completed_at is not null for update;
        if found then return jsonb_build_object('status','conflict'); end if;
      end if;
      return planner_private.planner_before_tasks_command(p_request);
    end if;
    if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','expectedVersion','changeId')) then return jsonb_build_object('status','invalid'); end if;
    if change.version::text is distinct from p_request->>'expectedVersion' or change.undone_at is not null then return jsonb_build_object('status','conflict'); end if;
    if change.after_state ? 'occurrence' then
      select * into series from public.recurring_task_series where id=(change.after_state->>'seriesId')::uuid and user_id=owner_id for update;
      if not found or series.revision_token::text is distinct from change.after_state->>'seriesToken' then return jsonb_build_object('status','conflict'); end if;
      select * into occurrence from public.recurring_task_occurrences where id=(change.after_state->'occurrence'->>'id')::uuid and user_id=owner_id for update;
      if not found or occurrence.version::text is distinct from change.after_state->'occurrence'->>'version' then return jsonb_build_object('status','conflict'); end if;
    end if;
    if change.kind='reopen' then
      select * into task from public.tasks where id=(change.after_state->'task'->>'id')::uuid and user_id=owner_id for update;
      if not found or task.version::text is distinct from change.after_state->'task'->>'version' then return jsonb_build_object('status','conflict'); end if;
      -- Re-completion must not release work added after the reopen.
      if exists(select 1 from public.calendar_events where user_id=owner_id and task_id=task.id and app_owned and not is_protected) then return jsonb_build_object('status','conflict'); end if;
    end if;
    if change.after_state ? 'project' then
      select * into parent from public.projects where id=(change.after_state->'project'->>'id')::uuid and user_id=owner_id for update;
      if not found or parent.version::text is distinct from change.after_state->'project'->>'version' then return jsonb_build_object('status','conflict'); end if;
    end if;
    if change.after_state ? 'occurrence' then
      perform set_config('betterr.recurring_lifecycle','on',true);
      update public.recurring_task_occurrences set state=change.before_state->'occurrence'->>'state',completed_at=(change.before_state->'occurrence'->>'completed_at')::timestamptz,
        due_date=(change.before_state->'occurrence'->>'due_date')::date,details=change.before_state->'occurrence'->'details',overrides=change.before_state->'occurrence'->'overrides' where id=occurrence.id;
    end if;
    if change.kind='reopen' then perform planner_private.restore_snapshot('tasks',change.before_state->'task',owner_id); end if;
    if change.after_state ? 'project' then perform planner_private.restore_snapshot('projects',change.before_state->'project',owner_id); end if;
    update public.planner_changes set undone_at=statement_timestamp() where id=change.id;
    change_id:=change.id;
  end if;
  outcome:=jsonb_build_object('status','complete','changeId',change_id);
  insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
  return outcome;
exception when sqlstate 'PT409' or integrity_constraint_violation or serialization_failure or deadlock_detected then return jsonb_build_object('status','conflict');
  when invalid_text_representation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.planner_command(jsonb) from public,anon;
grant execute on function planner_private.planner_command(jsonb) to authenticated;
create or replace function public.planner_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.planner_command(p_request) $$;
notify pgrst, 'reload schema';

-- A future availability date is independent of a due date or calendar reservation.
alter table public.task_action_rules add column available_after date;
do $rules$
declare definition text;
begin
  select pg_get_functiondef('planner_private.action_queue_command(jsonb)'::regprocedure) into definition;
  if position('dependency_ids=excluded.dependency_ids,version=gen_random_uuid()' in definition)=0 then raise exception 'Unexpected rules command shape'; end if;
  definition:=replace(definition,'''timezone'',''windows'',''dependencyIds''','''timezone'',''windows'',''dependencyIds'',''availableAfter''');
  definition:=replace(definition,'for allowed_window in select',
    'if p_request ? ''availableAfter'' and p_request->''availableAfter''<>''null''::jsonb and (jsonb_typeof(p_request->''availableAfter'')<>''string'' or p_request->>''availableAfter'' !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' or not isfinite((p_request->>''availableAfter'')::date)) then return jsonb_build_object(''status'',''invalid''); end if;
    for allowed_window in select');
  definition:=replace(definition,'windows,dependency_ids)', 'windows,dependency_ids,available_after)');
  definition:=replace(definition,'p_request->''windows'',ids)', 'p_request->''windows'',ids,(p_request->>''availableAfter'')::date)');
  definition:=replace(definition,'dependency_ids=excluded.dependency_ids,version=gen_random_uuid()',
    'dependency_ids=excluded.dependency_ids,available_after=case when p_request ? ''availableAfter'' then excluded.available_after else task_action_rules.available_after end,version=gen_random_uuid()');
  definition:=replace(definition,'when invalid_text_representation or numeric_value_out_of_range then', 'when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then');
  execute definition;
end $rules$;
alter function public.action_queue_snapshot(timestamptz,integer) rename to action_queue_snapshot_before_tasks;
revoke all on function public.action_queue_snapshot_before_tasks(timestamptz,integer) from public,anon;
create function public.action_queue_snapshot(p_at timestamptz default now(), p_gap_minutes integer default null) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare snapshot jsonb; item jsonb; result jsonb:='[]'; rule public.task_action_rules;
begin
  snapshot:=public.action_queue_snapshot_before_tasks(p_at,p_gap_minutes);
  for item in select value from jsonb_array_elements(snapshot->'tasks') loop
    select * into rule from public.task_action_rules where task_id=(item->>'id')::uuid and user_id=auth.uid();
    item:=jsonb_set(item,'{rules,availableAfter}',coalesce(to_jsonb(rule.available_after),'null'::jsonb));
    if rule.available_after is not null and (p_at at time zone rule.timezone)::date<rule.available_after then
      item:=jsonb_set(item,'{facts,reasons}',(item->'facts'->'reasons')||'"deferred"'::jsonb);
      item:=jsonb_set(item,'{facts,actionable}','false');
      if p_gap_minutes is not null then item:=jsonb_set(item,'{facts,fitsGap}','false'); end if;
    end if;
    result:=result||jsonb_build_array(item);
  end loop;
  return jsonb_set(snapshot,'{tasks}',result);
end $$;
revoke all on function public.action_queue_snapshot(timestamptz,integer) from public,anon;
grant execute on function public.action_queue_snapshot(timestamptz,integer) to authenticated;
notify pgrst, 'reload schema';
