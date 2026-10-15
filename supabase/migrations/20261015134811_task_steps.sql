-- Checklist state is part of the task snapshot, so existing completion and Undo
-- transactions retain exact partial progress. Recurrence owns its definitions.
alter table public.tasks add column steps jsonb not null default '[]'::jsonb;

create function planner_private.valid_steps(p_steps jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare item jsonb; identities text[]:='{}';
begin
  if p_steps is null or jsonb_typeof(p_steps)<>'array' then return false; end if;
  if jsonb_array_length(p_steps)>100 then return false; end if;
  for item in select value from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(item)<>'object' then return false; end if;
    if coalesce(item->>'id','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(item->'title') is distinct from 'string'
      or length(btrim(coalesce(item->>'title','')))=0 or length(item->>'title')>100
      or jsonb_typeof(item->'checked') is distinct from 'boolean'
      or item-'id'-'title'-'checked'<>'{}'::jsonb or item->>'id'=any(identities) then return false; end if;
    identities:=array_append(identities,item->>'id');
  end loop;
  return true;
end $$;
revoke all on function planner_private.valid_steps(jsonb) from public,anon,authenticated;

create function planner_private.normalize_task_steps() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and new.steps is distinct from old.steps
    and current_setting('role',true)='authenticated'
    and coalesce(current_setting('betterr.steps_write',true),'')<>'on'
    and coalesce(current_setting('betterr.recurring_lifecycle',true),'')<>'on' then
    raise exception using errcode='23514',message='Use a versioned Steps command';
  end if;
  if not planner_private.valid_steps(new.steps) then
    raise exception using errcode='23514',message='Invalid task steps';
  end if;
  if new.is_completed and (tg_op='INSERT' or not old.is_completed) then
    select coalesce(jsonb_agg(s||jsonb_build_object('checked',true) order by ord),'[]')
      into new.steps from jsonb_array_elements(new.steps) with ordinality e(s,ord);
  end if;
  return new;
end $$;
revoke all on function planner_private.normalize_task_steps() from public,anon,authenticated;
create trigger aaab_normalize_task_steps before insert or update on public.tasks
for each row execute function planner_private.normalize_task_steps();

do $capture$
declare definition text;
begin
  select pg_get_functiondef('public.task_capture_command(text,uuid,uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('''project_id'',''expected_project_version''' in definition)=0 then raise exception 'Unexpected task capture shape'; end if;
  definition:=replace(definition,'''project_id'',''expected_project_version''','''project_id'',''expected_project_version'',''steps''');
  definition:=replace(definition,'if p_changes ? ''title'' and',
    'if p_changes ? ''steps'' and not planner_private.valid_steps(p_changes->''steps'') then return jsonb_build_object(''status'',''invalid-transition''); end if;
  if p_changes ? ''title'' and');
  if position('insert into public.tasks(user_id,title,estimate_minutes,due_date,planned_date,project_id)' in definition)=0 then raise exception 'Unexpected task insert shape'; end if;
  definition:=replace(definition,'insert into public.tasks(user_id,title,estimate_minutes,due_date,planned_date,project_id)',
    'insert into public.tasks(user_id,title,estimate_minutes,due_date,planned_date,project_id,steps)');
  definition:=replace(definition,'(p_changes->>''project_id'')::uuid) returning * into task;',
    '(p_changes->>''project_id'')::uuid,(select coalesce(jsonb_agg(s||jsonb_build_object(''checked'',false) order by ord),''[]''::jsonb)
      from jsonb_array_elements(coalesce(p_changes->''steps'',''[]''::jsonb)) with ordinality e(s,ord))) returning * into task;');
  execute definition;
end $capture$;

-- Called only after the owning command has locked and version-checked its task.
create function planner_private.change_task_steps(p_task uuid,p_steps jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); prior public.tasks; saved public.tasks;
  occurrence public.recurring_task_occurrences; saved_occurrence public.recurring_task_occurrences;
  series public.recurring_task_series; result jsonb; preview jsonb; before_value jsonb; after_value jsonb;
  transition text; change_id uuid; internal_id uuid:=gen_random_uuid();
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if not planner_private.valid_steps(p_steps) then return jsonb_build_object('status','invalid'); end if;
  select * into prior from public.tasks where id=p_task and user_id=owner_id and archived_at is null;
  if not found then return jsonb_build_object('status','not-found'); end if;
  if prior.recurring_series_id is not null then
    select * into series from public.recurring_task_series where id=prior.recurring_series_id and user_id=owner_id for update;
    select * into occurrence from public.recurring_task_occurrences where id=prior.recurring_occurrence_id and series_id=series.id for update;
    if not found or occurrence.state not in ('open','extra','completed') then return jsonb_build_object('status','unsupported'); end if;
  end if;
  select * into prior from public.tasks where id=p_task and user_id=owner_id for update;
  if prior.is_completed and exists(select 1 from jsonb_array_elements(p_steps) s where not (s->>'checked')::boolean) then
    transition:='reopen';
  elsif not prior.is_completed and jsonb_array_length(p_steps)>0
    and not exists(select 1 from jsonb_array_elements(p_steps) s where not (s->>'checked')::boolean)
    and exists(select 1 from jsonb_array_elements(p_steps) s join jsonb_array_elements(prior.steps) old on old->>'id'=s->>'id'
      where (s->>'checked')::boolean and not (old->>'checked')::boolean) then
    transition:='complete';
  end if;
  before_value:=jsonb_build_object('task',to_jsonb(prior));
  if occurrence.id is not null then before_value:=before_value||jsonb_build_object('occurrence',to_jsonb(occurrence)); end if;
  if transition is not null then
    preview:=planner_private.completion_preview(prior.id);
    result:=planner_private.planner_command(jsonb_build_object('operation',transition,'operationId',internal_id,
      'taskId',prior.id,'expectedVersion',prior.version)
      ||case when transition='complete' then jsonb_build_object('plan',preview->'plan') else '{}'::jsonb end
      ||case when occurrence.id is not null then jsonb_build_object('occurrenceVersion',occurrence.version,'seriesToken',series.revision_token) else '{}'::jsonb end);
    if result->>'status'<>'complete' then raise exception using errcode='PT409',message='Step parent transition rejected'; end if;
    change_id:=(result->>'changeId')::uuid;
  end if;
  perform set_config('betterr.steps_write','on',true);
  if occurrence.id is not null then
    result:=public.recurring_task_lifecycle('edit-occurrence',jsonb_build_object('userId',owner_id,'seriesId',series.id,
      'occurrenceId',occurrence.id,'taskId',prior.id,'scope','this','updates',jsonb_build_object('steps',p_steps),
      'idempotencyKey',gen_random_uuid()));
    if result->>'status'<>'complete' then raise exception using errcode='PT409',message='Occurrence steps rejected'; end if;
  else
    update public.tasks set steps=p_steps where id=prior.id and user_id=owner_id;
  end if;
  select * into saved from public.tasks where id=prior.id and user_id=owner_id;
  after_value:=jsonb_build_object('task',to_jsonb(saved));
  if occurrence.id is not null then
    select * into saved_occurrence from public.recurring_task_occurrences where id=occurrence.id;
    after_value:=after_value||jsonb_build_object('occurrence',to_jsonb(saved_occurrence),'seriesId',series.id,'seriesToken',series.revision_token);
  end if;
  if change_id is null then
    insert into public.planner_changes(user_id,kind,before_state,after_state)
      values(owner_id,'steps',before_value,after_value) returning id into change_id;
  else
    update public.planner_changes set before_state=before_state||before_value,after_state=after_state||after_value
      where id=change_id and user_id=owner_id;
  end if;
  return jsonb_build_object('status','complete','task',to_jsonb(saved),'changeId',change_id,'transition',transition);
end $$;
revoke all on function planner_private.change_task_steps(uuid,jsonb) from public,anon,authenticated;

create function planner_private.steps_planner_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); request_id uuid:=(p_request->>'operationId')::uuid;
  receipt public.planner_command_receipts; task public.tasks; occurrence public.recurring_task_occurrences;
  series public.recurring_task_series; change public.planner_changes; desired jsonb; result jsonb;
  event public.calendar_events; item jsonb;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if p_request->>'operation'='undo' then
    select * into change from public.planner_changes where id=(p_request->>'changeId')::uuid and user_id=owner_id;
  end if;
  if p_request->>'operation' is distinct from 'check-step' and change.kind is distinct from 'steps' then
    if p_request->>'operation'='undo' then perform set_config('betterr.steps_write','on',true); end if;
    return planner_private.planner_command(p_request);
  end if;
  if request_id is null or p_request->>'expectedVersion' is null then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
  select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
  if found then
    if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  if p_request->>'operation'='check-step' then
    if jsonb_typeof(p_request->'checked') is distinct from 'boolean' or p_request->>'stepId' is null
      or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','taskId','expectedVersion','stepId','checked'))
      then return jsonb_build_object('status','invalid'); end if;
    select * into task from public.tasks where id=(p_request->>'taskId')::uuid and user_id=owner_id and archived_at is null;
    if not found then return jsonb_build_object('status','not-found'); end if;
  else
    if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','changeId','expectedVersion'))
      then return jsonb_build_object('status','invalid'); end if;
    select * into change from public.planner_changes where id=change.id and user_id=owner_id for update;
    if change.version::text is distinct from p_request->>'expectedVersion' or change.undone_at is not null then return jsonb_build_object('status','conflict'); end if;
    select * into task from public.tasks where id=(change.after_state->'task'->>'id')::uuid and user_id=owner_id and archived_at is null;
    if not found then return jsonb_build_object('status','conflict'); end if;
  end if;
  if task.recurring_series_id is not null then
    select * into series from public.recurring_task_series where id=task.recurring_series_id and user_id=owner_id for update;
    select * into occurrence from public.recurring_task_occurrences where id=task.recurring_occurrence_id and series_id=series.id for update;
    if occurrence.task_id is distinct from task.id then return jsonb_build_object('status','conflict'); end if;
  end if;
  select * into task from public.tasks where id=task.id and user_id=owner_id for update;
  if p_request->>'operation'='check-step' then
    if task.version::text is distinct from p_request->>'expectedVersion' then return jsonb_build_object('status','conflict'); end if;
    if not exists(select 1 from jsonb_array_elements(task.steps) s where s->>'id'=p_request->>'stepId') then return jsonb_build_object('status','not-found'); end if;
    select jsonb_agg(case when s->>'id'=p_request->>'stepId' then s||jsonb_build_object('checked',p_request->'checked') else s end order by ord)
      into desired from jsonb_array_elements(task.steps) with ordinality e(s,ord);
    result:=planner_private.change_task_steps(task.id,desired);
    if result->>'status'<>'complete' then return result; end if;
  else
    if task.version::text is distinct from change.after_state->'task'->>'version' then return jsonb_build_object('status','conflict'); end if;
    for item in select value from jsonb_array_elements(coalesce(change.after_state->'events','[]')) order by value->>'id' loop
      select * into event from public.calendar_events where id=(item->>'id')::uuid and user_id=owner_id for update;
      if not found or event.version::text is distinct from item->>'version' then return jsonb_build_object('status','conflict'); end if;
    end loop;
    if occurrence.id is not null then
      if occurrence.version::text is distinct from change.after_state->'occurrence'->>'version'
        or series.revision_token::text is distinct from change.after_state->>'seriesToken' then return jsonb_build_object('status','conflict'); end if;
      perform set_config('betterr.recurring_lifecycle','on',true);
      update public.recurring_task_occurrences set state=change.before_state->'occurrence'->>'state',
        completed_at=(change.before_state->'occurrence'->>'completed_at')::timestamptz,
        due_date=(change.before_state->'occurrence'->>'due_date')::date,details=change.before_state->'occurrence'->'details',
        overrides=change.before_state->'occurrence'->'overrides' where id=occurrence.id;
    end if;
    perform set_config('betterr.steps_write','on',true);
    perform planner_private.restore_snapshot('tasks',change.before_state->'task',owner_id);
    for item in select value from jsonb_array_elements(coalesce(change.before_state->'events','[]')) order by value->>'id' loop
      perform planner_private.restore_snapshot('calendar_events',item,owner_id);
    end loop;
    for item in select value from jsonb_array_elements(coalesce(change.after_state->'createdEvents','[]')) loop
      perform public.delete_calendar_event_with_reminders(owner_id,(item->>'id')::uuid);
    end loop;
    update public.planner_changes set undone_at=statement_timestamp() where id=change.id and user_id=owner_id;
    result:=jsonb_build_object('status','complete','changeId',change.id);
  end if;
  insert into public.planner_command_receipts values(owner_id,request_id,p_request,result);
  return result;
exception when sqlstate 'PT409' or integrity_constraint_violation or serialization_failure or deadlock_detected then return jsonb_build_object('status','conflict');
  when invalid_text_representation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.steps_planner_command(jsonb) from public,anon;
grant execute on function planner_private.steps_planner_command(jsonb) to authenticated;
create or replace function public.planner_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.steps_planner_command(p_request) $$;

-- Extend the lifecycle's authoritative definition/projection path. Keeping the
-- Steps override on its occurrence also protects started checklists on revision.
do $recurrence_steps$
declare definition text;
begin
  select replace(pg_get_functiondef('public.recurring_task_materialize_locked_target(uuid,date,date)'::regprocedure),chr(13),'') into definition;
  if position('recurrence_occurrence_state, occurrence_overrides' in definition)=0 then raise exception 'Unexpected materialization shape'; end if;
  definition:=replace(definition,'recurrence_occurrence_state, occurrence_overrides','recurrence_occurrence_state, occurrence_overrides, steps');
  if position('''{}''::JSONB'||chr(10)||'      );' in definition)=0 then raise exception 'Unexpected materialized task values'; end if;
  definition:=replace(definition,'''{}''::JSONB'||chr(10)||'      );',
    '''{}''::JSONB, coalesce(v_revision.defaults->''steps'',''[]''::jsonb)'||chr(10)||'      );');
  definition:=replace(definition,'SET title = COALESCE((v_revision.defaults || v_occurrence.overrides)->>''title'', title),',
    'SET steps = coalesce((v_revision.defaults || v_occurrence.overrides)->''steps'',''[]''::jsonb),
          title = COALESCE((v_revision.defaults || v_occurrence.overrides)->>''title'', title),');
  execute definition;

  select pg_get_functiondef('planner_private.recurring_task_edit_occurrence_overrides_atomic(jsonb)'::regprocedure) into definition;
  if position('set title = case when v_updates ? ''title''' in definition)=0 then raise exception 'Unexpected occurrence edit shape'; end if;
  definition:=replace(definition,'set title = case when v_updates ? ''title''',
    'set steps = case when v_updates ? ''steps'' then v_updates->''steps'' else steps end,
        title = case when v_updates ? ''title''');
  definition:=replace(definition,'  if v_occurrence.state = ''completed''',
    '  if v_updates ? ''steps'' and coalesce(current_setting(''betterr.steps_write'',true),'''')<>''on''
      and v_updates->''steps'' is distinct from (select steps from public.tasks where id=v_occurrence.task_id and user_id=v_user_id) then
      return jsonb_build_object(''status'',''invalid-transition'',''type'',''invalid-transition'',''reason'',''Use a versioned Steps command'');
    end if;
  if v_occurrence.state = ''completed''');
  definition:=replace(definition,'when v_occurrence.state = ''extra'' then ''extra''',
    'when v_occurrence.state = ''completed'' and not (v_updates ? ''status'') then ''completed''
          when v_occurrence.state = ''extra'' then ''extra''');
  execute definition;

  -- All parent completion channels (including web/AI lifecycle callers) capture
  -- checked Steps in both the task and occurrence snapshots.
  select pg_get_functiondef('planner_private.recurring_linked_command(text,jsonb)'::regprocedure) into definition;
  if position('if not prior_task.is_completed and after_task.is_completed then' in definition)=0 then raise exception 'Unexpected linked completion shape'; end if;
  definition:=replace(definition,'if not prior_task.is_completed and after_task.is_completed then',
    'if not prior_task.is_completed and after_task.is_completed then
    if jsonb_array_length(after_task.steps)>0 then
      update public.recurring_task_occurrences set details=details||jsonb_build_object(''steps'',after_task.steps),
        overrides=overrides||jsonb_build_object(''steps'',after_task.steps) where id=occurrence.id;
    end if;');
  execute definition;
end $recurrence_steps$;

create function planner_private.validate_series_steps() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.defaults ? 'steps' then
    if not planner_private.valid_steps(new.defaults->'steps') then raise exception using errcode='23514',message='Invalid routine steps'; end if;
    if exists(select 1 from jsonb_array_elements(new.defaults->'steps') s where (s->>'checked')::boolean) then
      raise exception using errcode='23514',message='Routine step definitions must start unchecked';
    end if;
  end if;
  return new;
end $$;
revoke all on function planner_private.validate_series_steps() from public,anon,authenticated;
create trigger validate_series_steps before insert or update of defaults on public.recurring_task_series_revisions
for each row execute function planner_private.validate_series_steps();

do $routine_steps$
declare definition text;
begin
  select pg_get_functiondef('planner_private.routine_command(jsonb)'::regprocedure) into definition;
  if position('''protected'',''rule''' in definition)=0 then raise exception 'Unexpected routine capture shape'; end if;
  definition:=replace(definition,'''protected'',''rule''','''protected'',''rule'',''steps''');
  definition:=replace(definition,'''title'',''date'',''startTime'',''endTime''','''title'',''date'',''startTime'',''endTime'',''steps''');
  definition:=replace(definition,'event public.calendar_events;', 'event public.calendar_events; step_event public.calendar_events;');
  definition:=replace(definition,'''dueTime'',null)', '''dueTime'',null,''steps'',coalesce(p_request->''steps'',''[]''::jsonb))');
  definition:=replace(definition,'if request_id is null or',
    'if p_request ? ''steps'' and not planner_private.valid_steps(p_request->''steps'') then return jsonb_build_object(''status'',''invalid''); end if;
  if request_id is null or');
  definition:=replace(definition,'outcome:=jsonb_build_object(''status'',''complete'',''seriesId'',series.id,''changeId'',change_id);',
    'outcome:=jsonb_build_object(''status'',''complete'',''seriesId'',series.id,''changeId'',change_id);
    if p_request->>''operation''=''edit'' and p_request ? ''steps'' then
      select * into step_event from public.calendar_events where routine_occurrence_id=occurrence.id and user_id=owner_id;
      result:=planner_private.change_task_steps(task.id,p_request->''steps'');
      if result->>''status''<>''complete'' then raise exception using errcode=''23514'',message=''Routine step edit rejected''; end if;
      update public.planner_changes set before_state=before_state||jsonb_build_object(''task'',to_jsonb(task),''occurrence'',to_jsonb(occurrence),
        ''events'',(select coalesce(jsonb_agg(e),''[]''::jsonb) from jsonb_array_elements(coalesce(before_state->''events'',''[]'')) e where e->>''id'' is distinct from step_event.id::text)
          ||case when event.id is null then ''[]''::jsonb else jsonb_build_array(to_jsonb(event)) end),
        after_state=case when result->>''transition'' is null then after_state||jsonb_build_object(''events'',
          case when step_event.id is null then ''[]''::jsonb else jsonb_build_array(to_jsonb(step_event)) end,
          ''createdEvents'',case when event.id is null and step_event.id is not null then jsonb_build_array(to_jsonb(step_event)) else ''[]''::jsonb end)
          else after_state end
        where id=(result->>''changeId'')::uuid and user_id=owner_id;
      outcome:=outcome||result;
    end if;');
  execute definition;

  select pg_get_functiondef('planner_private.routine_series_preview(jsonb)'::regprocedure) into definition;
  if position('''protected'',''rule''' in definition)=0 then raise exception 'Unexpected series preview shape'; end if;
  definition:=replace(definition,'''protected'',''rule''','''protected'',''rule'',''steps''');
  definition:=replace(definition,'if p_request->>''operation''=''revise'' then',
    'if p_request->>''operation''=''revise'' then
   if p_request ? ''steps'' then
     if not planner_private.valid_steps(p_request->''steps'') then return jsonb_build_object(''status'',''invalid''); end if;
     if exists(select 1 from jsonb_array_elements(p_request->''steps'') s where (s->>''checked'')::boolean) then return jsonb_build_object(''status'',''invalid''); end if;
   end if;');
  execute definition;

  select pg_get_functiondef('planner_private.routine_series_command(jsonb)'::regprocedure) into definition;
  if position('''defaults'',jsonb_build_object(''title'',btrim(p_request->>''title''))' in definition)=0 then raise exception 'Unexpected series command shape'; end if;
  definition:=replace(definition,'''defaults'',jsonb_build_object(''title'',btrim(p_request->>''title''))',
    '''defaults'',jsonb_build_object(''title'',btrim(p_request->>''title''))||case when p_request ? ''steps'' then jsonb_build_object(''steps'',p_request->''steps'') else ''{}''::jsonb end');
  execute definition;

  select pg_get_functiondef('planner_private.routine_series_snapshot()'::regprocedure) into definition;
  if position('''id'',s.id,''title'',v.defaults->>''title''' in definition)=0 then raise exception 'Unexpected series snapshot shape'; end if;
  definition:=replace(definition,'''id'',s.id,''title'',v.defaults->>''title''',
    '''id'',s.id,''steps'',coalesce(v.defaults->''steps'',''[]''::jsonb),''title'',v.defaults->>''title''');
  execute definition;
end $routine_steps$;

-- Capture edits keep metadata and checklist changes in the same transaction and
-- preserve the full pre-save task in the recoverable change.
do $capture_edits$
declare definition text;
begin
  select pg_get_functiondef('public.task_capture_command(text,uuid,uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('outcome := jsonb_build_object(''status'',''complete'',''task'',to_jsonb(task));' in definition)=0 then raise exception 'Unexpected capture result shape'; end if;
  definition:=replace(definition,'occurrence_changes jsonb :=', 'before_task public.tasks; steps_result jsonb;
  before_occurrence public.recurring_task_occurrences;
  occurrence_changes jsonb :=');
  definition:=replace(definition,'if p_operation = ''edit'' then', 'if p_operation = ''edit'' then
      before_task:=task;
      select * into before_occurrence from public.recurring_task_occurrences where id=task.recurring_occurrence_id;');
  definition:=replace(definition,'outcome := jsonb_build_object(''status'',''complete'',''task'',to_jsonb(task));',
    'outcome := jsonb_build_object(''status'',''complete'',''task'',to_jsonb(task));
  if p_operation=''create'' and exists(select 1 from jsonb_array_elements(coalesce(p_changes->''steps'',''[]'')) s where (s->>''checked'')::boolean) then
    steps_result:=planner_private.change_task_steps(task.id,p_changes->''steps'');
    if steps_result->>''status''<>''complete'' then raise exception using errcode=''23514'',message=''Initial step progress rejected''; end if;
    outcome:=steps_result;
  end if;
  if p_operation=''edit'' and p_changes ? ''steps'' and before_task.steps is distinct from p_changes->''steps'' then
    steps_result:=planner_private.change_task_steps(task.id,p_changes->''steps'');
    if steps_result->>''status''<>''complete'' then raise exception using errcode=''23514'',message=''Step edit rejected''; end if;
    update public.planner_changes set before_state=jsonb_set(before_state,''{task}'',to_jsonb(before_task))
      where id=(steps_result->>''changeId'')::uuid and user_id=owner_id;
    if before_occurrence.id is not null then
      update public.planner_changes set before_state=jsonb_set(before_state,''{occurrence}'',to_jsonb(before_occurrence))
        where id=(steps_result->>''changeId'')::uuid and user_id=owner_id;
    end if;
    outcome:=steps_result;
  end if;');
  execute definition;
end $capture_edits$;

notify pgrst,'reload schema';
