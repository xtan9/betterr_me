-- Step progress never completes an open parent. Explicit parent completion still
-- checks every Step through normalize_task_steps; unchecking can still reopen it.
create or replace function planner_private.change_task_steps(p_task uuid,p_steps jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); prior public.tasks; saved public.tasks;
  occurrence public.recurring_task_occurrences; saved_occurrence public.recurring_task_occurrences;
  series public.recurring_task_series; result jsonb; before_value jsonb; after_value jsonb;
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
  end if;
  before_value:=jsonb_build_object('task',to_jsonb(prior));
  if occurrence.id is not null then before_value:=before_value||jsonb_build_object('occurrence',to_jsonb(occurrence)); end if;
  if transition is not null then
    result:=planner_private.planner_command(jsonb_build_object('operation',transition,'operationId',internal_id,
      'taskId',prior.id,'expectedVersion',prior.version)
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
