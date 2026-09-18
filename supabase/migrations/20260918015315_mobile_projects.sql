-- Mapping, rollout and rollback: docs/architecture/mobile-projects.md.
alter table public.projects add column version uuid not null default gen_random_uuid();
create trigger advance_project_version before update on public.projects
for each row execute function public.advance_task_version();
-- Preserve legacy links without legitimizing new cross-owner relationships.
alter table public.projects add constraint projects_id_owner_unique unique(id,user_id);
alter table public.tasks add constraint tasks_project_owner_fk
foreign key(project_id,user_id) references public.projects(id,user_id)
on delete set null (project_id) not valid;

create table public.project_capture_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null, request jsonb not null, outcome jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id,operation_id)
);
alter table public.project_capture_receipts enable row level security;
revoke all on public.project_capture_receipts from public,anon,authenticated;
grant select on public.project_capture_receipts to authenticated;
create policy project_capture_receipt_owner on public.project_capture_receipts
for select to authenticated using ((select auth.uid())=user_id);

-- Definer is required for protected receipts; derive the owner only from auth.uid().
create function public.project_capture_command(
  p_operation text, p_operation_id uuid, p_project_id uuid default null,
  p_expected_version uuid default null, p_changes jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  owner_id uuid := auth.uid();
  project public.projects%rowtype;
  receipt public.project_capture_receipts%rowtype;
  request jsonb := jsonb_build_object('operation',p_operation,'projectId',p_project_id,'version',p_expected_version,'changes',p_changes);
  outcome jsonb;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if p_operation_id is null or p_operation is null or p_operation not in ('create','edit','archive','unarchive')
    or p_changes is null or jsonb_typeof(p_changes)<>'object'
    or exists(select 1 from jsonb_object_keys(p_changes) k where k<>'name')
    or (p_operation in ('archive','unarchive') and p_changes<>'{}'::jsonb)
    or (p_operation='create' and (p_project_id is not null or p_expected_version is not null or not p_changes ? 'name'))
    or (p_operation<>'create' and (p_project_id is null or p_expected_version is null)) then
    return jsonb_build_object('status','invalid-transition');
  end if;
  if p_changes ? 'name' and (jsonb_typeof(p_changes->'name')<>'string'
    or char_length(btrim(p_changes->>'name')) not between 1 and 50) then
    return jsonb_build_object('status','invalid-transition');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':project:' || p_operation_id::text,0));
  select * into receipt from public.project_capture_receipts where user_id=owner_id and operation_id=p_operation_id;
  if found then
    if receipt.request is distinct from request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  if p_operation='create' then
    insert into public.projects(user_id,name) values(owner_id,btrim(p_changes->>'name')) returning * into project;
  else
    select * into project from public.projects where id=p_project_id and user_id=owner_id for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if project.version<>p_expected_version then return jsonb_build_object('status','conflict'); end if;
    update public.projects set name=case when p_changes ? 'name' then btrim(p_changes->>'name') else name end,
      status=case p_operation when 'archive' then 'archived' when 'unarchive' then 'active' else status end
    where id=project.id and user_id=owner_id returning * into project;
  end if;
  outcome := jsonb_build_object('status','complete','project',to_jsonb(project));
  insert into public.project_capture_receipts(user_id,operation_id,request,outcome) values(owner_id,p_operation_id,request,outcome);
  return outcome;
end $$;
revoke all on function public.project_capture_command(text,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.project_capture_command(text,uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.task_capture_command(
  p_operation text,
  p_operation_id uuid,
  p_task_id uuid default null,
  p_expected_version uuid default null,
  p_changes jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  owner_id uuid := auth.uid();
  task public.tasks%rowtype;
  receipt public.task_capture_receipts%rowtype;
  request jsonb := jsonb_build_object('operation',p_operation,'taskId',p_task_id,
    'version',p_expected_version,'changes',p_changes);
  outcome jsonb;
  occurrence_changes jsonb := '{}'::jsonb;
  destination public.projects%rowtype;
  initial_series_id uuid;
  initial_occurrence_id uuid;
begin
  if owner_id is null then
    return jsonb_build_object('status','not-found');
  end if;
  if p_operation_id is null or p_operation is null
    or p_operation not in ('create','edit','archive','unarchive')
    or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_changes) k
      where k not in ('title','estimate_minutes','due_date','project_id','expected_project_version'))
    or (p_operation in ('archive','unarchive') and p_changes <> '{}'::jsonb)
    or (p_operation = 'create' and (p_task_id is not null or p_expected_version is not null or not p_changes ? 'title'))
    or (p_operation <> 'create' and (p_task_id is null or p_expected_version is null)) then
    return jsonb_build_object('status','invalid-transition');
  end if;
  if (p_changes ? 'expected_project_version' and (not p_changes ? 'project_id' or p_changes->'project_id'='null'::jsonb))
    or (p_changes ? 'project_id' and p_changes->'project_id'<>'null'::jsonb and
      (jsonb_typeof(p_changes->'project_id')<>'string' or not p_changes ? 'expected_project_version'
       or jsonb_typeof(p_changes->'expected_project_version')<>'string')) then
    return jsonb_build_object('status','invalid-transition');
  end if;
  if p_changes ? 'title' and (jsonb_typeof(p_changes->'title') <> 'string'
    or length(btrim(p_changes->>'title')) = 0 or length(p_changes->>'title') > 100) then
    return jsonb_build_object('status','invalid-transition');
  end if;
  if p_changes ? 'estimate_minutes' and p_changes->'estimate_minutes' <> 'null'::jsonb
    and (jsonb_typeof(p_changes->'estimate_minutes') <> 'number'
      or (p_changes->>'estimate_minutes') !~ '^[0-9]+$'
      or (p_changes->>'estimate_minutes')::numeric < 1
      or (p_changes->>'estimate_minutes')::numeric > 2147483647) then
    return jsonb_build_object('status','invalid-transition');
  end if;
  if p_changes ? 'due_date' and p_changes->'due_date' <> 'null'::jsonb then
    if jsonb_typeof(p_changes->'due_date') <> 'string'
      or (p_changes->>'due_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return jsonb_build_object('status','invalid-transition');
    end if;
    -- Cast also rejects impossible dates; the exception handler rolls back.
    perform (p_changes->>'due_date')::date;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':capture:' || p_operation_id::text,0));
  select * into receipt from public.task_capture_receipts
  where user_id = owner_id and operation_id = p_operation_id;
  if found then
    if receipt.request is distinct from request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;

  -- Lock the destination before lifecycle/task locks, after replay lookup.
  if p_changes ? 'project_id' and p_changes->'project_id'<>'null'::jsonb then
    select * into destination from public.projects
    where id=(p_changes->>'project_id')::uuid and user_id=owner_id for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if destination.version::text is distinct from p_changes->>'expected_project_version' then
      return jsonb_build_object('status','conflict');
    end if;
    if destination.status<>'active' then return jsonb_build_object('status','invalid-transition'); end if;
  end if;
  if p_operation = 'create' then
    insert into public.tasks(user_id,title,estimate_minutes,due_date,project_id)
    values(owner_id,p_changes->>'title',(p_changes->>'estimate_minutes')::integer,
      (p_changes->>'due_date')::date,(p_changes->>'project_id')::uuid) returning * into task;
  else
    -- Match lifecycle lock order (series, occurrence, task). Never edit a
    -- recurring projection without updating its authoritative overrides.
    select recurring_series_id,recurring_occurrence_id into initial_series_id,initial_occurrence_id
    from public.tasks where id=p_task_id and user_id=owner_id;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if initial_series_id is not null then
      perform 1 from public.recurring_task_series where id=initial_series_id and user_id=owner_id for update;
      if not found then return jsonb_build_object('status','not-found'); end if;
      perform 1 from public.recurring_task_occurrences
      where id=initial_occurrence_id and series_id=initial_series_id and task_id=p_task_id for update;
      if not found then return jsonb_build_object('status','not-found'); end if;
    end if;
    select * into task from public.tasks where id=p_task_id and user_id=owner_id for update;
    if not found then return jsonb_build_object('status','not-found'); end if;
    if task.version <> p_expected_version
      or task.recurring_series_id is distinct from initial_series_id
      or task.recurring_occurrence_id is distinct from initial_occurrence_id then
      return jsonb_build_object('status','conflict');
    end if;
    if (task.recurring_series_id is null) <> (task.recurring_occurrence_id is null) then
      return jsonb_build_object('status','invalid-transition');
    end if;
    -- Authorize only the narrowly validated task metadata changes below.
    -- Title/date still go through the occurrence override transaction.
    perform set_config('betterr.recurring_lifecycle','on',true);
    if p_operation = 'edit' then
      if task.recurring_series_id is not null then
        if p_changes ? 'title' then occurrence_changes := occurrence_changes || jsonb_build_object('title',p_changes->'title'); end if;
        if p_changes ? 'project_id' then occurrence_changes := occurrence_changes || jsonb_build_object('projectId',p_changes->'project_id'); end if;
        if p_changes ? 'due_date' then occurrence_changes := occurrence_changes || jsonb_build_object('dueDate',p_changes->'due_date'); end if;
        if occurrence_changes <> '{}'::jsonb then
          outcome := public.recurring_task_lifecycle('edit-occurrence',jsonb_build_object(
            'userId',owner_id,'taskId',task.id,'seriesId',task.recurring_series_id,
            'occurrenceId',task.recurring_occurrence_id,'scope','this',
            'updates',occurrence_changes,'idempotencyKey','capture:' || p_operation_id::text));
          if outcome->>'status' not in ('complete','already-applied') then return outcome; end if;
        end if;
      end if;
      update public.tasks set
        project_id = case when p_changes ? 'project_id' then (p_changes->>'project_id')::uuid else project_id end,
        title = case when p_changes ? 'title' then p_changes->>'title' else title end,
        estimate_minutes = case when p_changes ? 'estimate_minutes' then (p_changes->>'estimate_minutes')::integer else estimate_minutes end,
        due_date = case when p_changes ? 'due_date' then (p_changes->>'due_date')::date else due_date end
      where id=task.id and user_id=owner_id returning * into task;
    else
      update public.tasks set archived_at = case when p_operation='archive' then coalesce(archived_at,now()) else null end
      where id=task.id and user_id=owner_id returning * into task;
    end if;
  end if;
  outcome := jsonb_build_object('status','complete','task',to_jsonb(task));
  insert into public.task_capture_receipts(user_id,operation_id,request,outcome)
  values(owner_id,p_operation_id,request,outcome);
  return outcome;
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  return jsonb_build_object('status','invalid-transition');
end $$;
revoke all on function public.task_capture_command(text,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.task_capture_command(text,uuid,uuid,uuid,jsonb) to authenticated;


notify pgrst, 'reload schema';
