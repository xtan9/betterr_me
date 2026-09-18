-- Reuse the exact accepted ordinary completion transaction for concrete
-- recurring task occurrences. Never modify virtual calendar templates.
do $extract$
declare definition text;
begin
  select pg_get_functiondef('planner_private.complete_linked_work()'::regprocedure) into definition;
  if position('if new.recurring_series_id is not null or new.recurring_occurrence_id is not null then return new; end if;' in definition)=0 then raise exception 'Unexpected completion function shape'; end if;
  definition:=replace(definition,'planner_private.complete_linked_work()','planner_private.complete_task_effects(p_before public.tasks, p_after public.tasks)');
  definition:=replace(definition,'RETURNS trigger','RETURNS uuid');
  definition:=replace(definition,'if new.recurring_series_id is not null or new.recurring_occurrence_id is not null then return new; end if;','');
  definition:=replace(replace(definition,'new.','p_after.'),'old.','p_before.');
  definition:=replace(replace(definition,'to_jsonb(new)','to_jsonb(p_after)'),'to_jsonb(old)','to_jsonb(p_before)');
  definition:=replace(definition,'token uuid;','token uuid; change_id uuid;');
  definition:=replace(definition,'''released'',released));','''released'',released)) returning id into change_id;');
  definition:=replace(definition,'return new;','return change_id;');
  execute definition;
end $extract$;
revoke all on function planner_private.complete_task_effects(public.tasks,public.tasks) from public,anon,authenticated;
create or replace function planner_private.complete_linked_work() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.recurring_series_id is not null or new.recurring_occurrence_id is not null then return new; end if;
  perform planner_private.complete_task_effects(old,new); return new;
end $$;

alter function public.recurring_task_occurrence_command_atomic(text,jsonb) set schema planner_private;
alter function public.recurring_task_edit_occurrence_overrides_atomic(jsonb) set schema planner_private;
create function planner_private.recurring_linked_command(p_operation text,p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
<<linked>>
declare owner_id uuid:=auth.uid(); series public.recurring_task_series; occurrence public.recurring_task_occurrences;
  prior_task public.tasks; after_task public.tasks; after_occurrence public.recurring_task_occurrences; outcome jsonb; change_id uuid;
begin
  if current_setting('role',true)='service_role' then owner_id:=(p_request->>'userId')::uuid; end if;
  if owner_id is null or owner_id::text is distinct from p_request->>'userId' then return jsonb_build_object('status','not-found','type','not-found'); end if;
  select * into series from public.recurring_task_series where id=(p_request->>'seriesId')::uuid and user_id=owner_id for update;
  if not found then return jsonb_build_object('status','not-found','type','not-found'); end if;
  select * into occurrence from public.recurring_task_occurrences where id=(p_request->>'occurrenceId')::uuid and series_id=series.id for update;
  if not found then return jsonb_build_object('status','not-found','type','not-found'); end if;
  select * into prior_task from public.tasks where id=occurrence.task_id and user_id=owner_id for update;
  if p_request ? 'expectedTaskVersion' and prior_task.version::text is distinct from p_request->>'expectedTaskVersion'
    and not exists(select 1 from public.recurring_task_idempotency where user_id=owner_id and operation_key=coalesce(p_request->>'idempotencyKey',p_request->>'operationKey')) then
    return jsonb_build_object('status','conflict','type','conflict');
  end if;
  if p_operation='edit-occurrence' then outcome:=planner_private.recurring_task_edit_occurrence_overrides_atomic(p_request);
  else outcome:=planner_private.recurring_task_occurrence_command_atomic(p_operation,p_request); end if;
  if outcome->>'status' not in ('complete','already-applied') then return outcome; end if;
  select * into after_task from public.tasks where id=prior_task.id and user_id=owner_id;
  if not prior_task.is_completed and after_task.is_completed then
    -- Legacy mixed status edits must also keep their occurrence ledger complete.
    update public.recurring_task_occurrences set state='completed',completed_at=after_task.completed_at
      where id=occurrence.id and state<>'completed';
    update public.tasks set recurrence_occurrence_state='completed' where id=after_task.id and recurrence_occurrence_state<>'completed' returning * into after_task;
    select * into after_task from public.tasks where id=prior_task.id and user_id=owner_id;
    select * into after_occurrence from public.recurring_task_occurrences where id=occurrence.id;
    change_id:=planner_private.complete_task_effects(prior_task,after_task);
    update public.planner_changes set kind='complete-occurrence',
      before_state=before_state||jsonb_build_object('occurrence',to_jsonb(occurrence)),
      after_state=after_state||jsonb_build_object('occurrence',to_jsonb(after_occurrence),'seriesId',series.id,'seriesToken',series.revision_token)
      where id=change_id;
  elsif prior_task.is_completed and not after_task.is_completed then
    insert into public.planner_changes(user_id,kind,before_state,after_state) values(owner_id,'reopen',
      jsonb_build_object('task',to_jsonb(prior_task)),jsonb_build_object('task',to_jsonb(after_task))) returning id into change_id;
  end if;
    outcome:=outcome||jsonb_build_object('changeId',coalesce(change_id::text,outcome->>'changeId'));
  update public.recurring_task_idempotency set outcome=linked.outcome
    where user_id=owner_id and operation_key=coalesce(p_request->>'idempotencyKey',p_request->>'operationKey');
  return outcome;
end $$;
revoke all on function planner_private.recurring_linked_command(text,jsonb) from public,anon,authenticated;
create function public.recurring_task_occurrence_command_atomic(p_operation text,p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.recurring_linked_command(p_operation,p_request) $$;
revoke all on function public.recurring_task_occurrence_command_atomic(text,jsonb) from public,anon,authenticated;
create function public.recurring_task_edit_occurrence_overrides_atomic(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.recurring_linked_command('edit-occurrence',p_request) $$;
revoke all on function public.recurring_task_edit_occurrence_overrides_atomic(jsonb) from public,anon,authenticated;

create or replace function planner_private.completion_preview(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare task public.tasks; occurrence public.recurring_task_occurrences; series public.recurring_task_series;
begin
  select * into task from public.tasks where id=p_task_id and user_id=auth.uid();
  if not found then return jsonb_build_object('status','not-found'); end if;
  if task.recurring_series_id is not null then
    select * into occurrence from public.recurring_task_occurrences where id=task.recurring_occurrence_id and task_id=task.id and series_id=task.recurring_series_id;
    select * into series from public.recurring_task_series where id=task.recurring_series_id and user_id=task.user_id;
    if occurrence.id is null or series.id is null then return jsonb_build_object('status','unsupported'); end if;
  end if;
  return jsonb_build_object('status','complete','task',to_jsonb(task),'plan',planner_private.completion_plan(task.user_id,task.id,date_trunc('second',statement_timestamp())),
    'occurrenceVersion',occurrence.version,'seriesToken',series.revision_token);
end $$;

-- Extend exact restoration under the existing transaction/receipt checks.
do $extend_undo$
declare definition text;
begin
  select pg_get_functiondef('planner_private.planner_command(jsonb)'::regprocedure) into definition;
  if position('change.kind not in (''stop'',''complete'',''complete-project'')' in definition)=0 then raise exception 'Unexpected Undo function shape'; end if;
  definition:=replace(definition,'change.kind not in (''stop'',''complete'',''complete-project'')','change.kind not in (''stop'',''complete'',''complete-project'',''complete-occurrence'')');
  definition:=replace(definition,'if change.kind=''complete-project'' then'||chr(10)||'    select',
    'if change.kind=''complete-occurrence'' then
      perform 1 from public.recurring_task_series where id=(change.after_state->>''seriesId'')::uuid and user_id=owner_id
        and revision_token=(change.after_state->>''seriesToken'')::integer for update;
      if not found then return jsonb_build_object(''status'',''conflict''); end if;
      perform 1 from public.recurring_task_occurrences where id=(change.after_state->''occurrence''->>''id'')::uuid
        and series_id=(change.after_state->>''seriesId'')::uuid and version=(change.after_state->''occurrence''->>''version'')::uuid for update;
      if not found then return jsonb_build_object(''status'',''conflict''); end if;
    end if;
    if change.kind=''complete-project'' then'||chr(10)||'    select');
  definition:=replace(definition,'elsif change.kind=''complete'' then','elsif change.kind in (''complete'',''complete-occurrence'') then
    if change.kind=''complete-occurrence'' then
      perform set_config(''betterr.recurring_lifecycle'',''on'',true);
      update public.recurring_task_occurrences set state=change.before_state->''occurrence''->>''state'',
        completed_at=(change.before_state->''occurrence''->>''completed_at'')::timestamptz,
        due_date=(change.before_state->''occurrence''->>''due_date'')::date,
        details=change.before_state->''occurrence''->''details'',overrides=change.before_state->''occurrence''->''overrides''
        where id=(change.before_state->''occurrence''->>''id'')::uuid;
    end if;');
  execute definition;
end $extend_undo$;
alter function planner_private.planner_command(jsonb) rename to planner_base_command;
revoke all on function planner_private.planner_base_command(jsonb) from authenticated;
create function planner_private.planner_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); request_id uuid:=(p_request->>'operationId')::uuid;
  task public.tasks; series public.recurring_task_series; occurrence public.recurring_task_occurrences;
  receipt public.planner_command_receipts; outcome jsonb; result jsonb; plan jsonb;
begin
  if p_request->>'operation' not in ('complete','reopen') then return planner_private.planner_base_command(p_request); end if;
  select * into task from public.tasks where id=(p_request->>'taskId')::uuid and user_id=owner_id;
  if task.recurring_series_id is null then return planner_private.planner_base_command(p_request); end if;
  if request_id is null then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
  select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
  if found then
    if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  select * into series from public.recurring_task_series where id=task.recurring_series_id and user_id=owner_id for update;
  select * into occurrence from public.recurring_task_occurrences where id=task.recurring_occurrence_id and series_id=series.id for update;
  select * into task from public.tasks where id=task.id and user_id=owner_id for update;
  if occurrence.task_id is distinct from task.id or occurrence.version::text is distinct from p_request->>'occurrenceVersion'
    or series.revision_token is distinct from (p_request->>'seriesToken')::integer or task.version::text is distinct from p_request->>'expectedVersion' then return jsonb_build_object('status','conflict'); end if;
  if p_request->>'operation'='complete' then
    perform 1 from public.calendar_events where task_id=task.id and user_id=owner_id order by id for update;
    plan:=planner_private.completion_plan(owner_id,task.id,date_trunc('second',statement_timestamp()));
    if p_request->'plan' is distinct from plan then return jsonb_build_object('status','conflict'); end if;
  end if;
  result:=public.recurring_task_lifecycle(case when p_request->>'operation'='complete' then 'complete-occurrence' else 'reopen-occurrence' end,
    jsonb_build_object('userId',owner_id,'seriesId',series.id,'occurrenceId',occurrence.id,'taskId',task.id,'scope','this','scheduledDate',occurrence.scheduled_date,
      'expectedRevisionToken',series.revision_token,'expectedRevisionId',occurrence.revision_id,'expectedTaskVersion',task.version,'idempotencyKey',request_id));
  if result->>'status' not in ('complete','already-applied') then return result; end if;
  if result->>'changeId' is null then raise exception 'Completion produced no history'; end if;
  outcome:=jsonb_build_object('status','complete','changeId',result->>'changeId');
  insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
  return outcome;
exception when invalid_text_representation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.planner_command(jsonb) from public,anon;
grant execute on function planner_private.planner_command(jsonb) to authenticated;
create or replace function public.planner_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.planner_command(p_request) $$;

-- Every shared task withdrawal removes its exact routine reservation, including
-- web skips and series revisions. Ordinary independent events remain untouched.
create function planner_private.withdraw_routine_reservation() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare event_id uuid;
begin
  for event_id in select id from public.calendar_events where user_id=old.user_id
    and routine_occurrence_id=old.recurring_occurrence_id and task_id=old.id order by id for update loop
    perform public.delete_calendar_event_with_reminders(old.user_id,event_id);
  end loop;
  return old;
end $$;
revoke all on function planner_private.withdraw_routine_reservation() from public,anon,authenticated;
create trigger planner_withdraw_routine_reservation before delete on public.tasks
for each row when (old.recurring_occurrence_id is not null) execute function planner_private.withdraw_routine_reservation();

do $stop$
declare definition text;
begin
 select pg_get_functiondef('planner_private.planner_stop_command(jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'task.is_completed or task.recurring_series_id is not null or task.recurring_occurrence_id is not null',
   'task.is_completed or (task.recurring_series_id is not null and task.recurring_occurrence_id is null)');
 execute definition;
end $stop$;

