create table public.planner_state_versions(user_id uuid primary key references public.profiles(id) on delete cascade,version uuid not null default gen_random_uuid());
alter table public.planner_state_versions enable row level security;
revoke all on public.planner_state_versions from public,anon,authenticated;
grant select on public.planner_state_versions to authenticated;
create policy planner_state_owner on public.planner_state_versions for select to authenticated using((select auth.uid())=user_id);
insert into public.planner_state_versions(user_id) select id from public.profiles;
create function planner_private.touch_plan_state() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare row_data jsonb; owner_id uuid;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_name='profiles' then owner_id:=(row_data->>'id')::uuid;
 elsif row_data ? 'user_id' then owner_id:=(row_data->>'user_id')::uuid;
 else select user_id into owner_id from public.recurring_task_series where id=(row_data->>'series_id')::uuid;end if;
 if owner_id is not null and exists(select 1 from public.profiles where id=owner_id) then
  insert into public.planner_state_versions(user_id) values(owner_id) on conflict(user_id) do update set version=gen_random_uuid();
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function planner_private.touch_plan_state() from public,anon,authenticated;
create trigger planner_profile_state after insert or update on public.profiles for each row execute function planner_private.touch_plan_state();
do $$ declare target text;begin
 foreach target in array array['tasks','projects','calendar_events','daily_priority_state','action_queue_state','task_action_rules','planner_routine_schedules','recurring_task_series','recurring_task_series_revisions','recurring_task_occurrences','recurring_task_intentional_absences','reminders','work_sessions'] loop
 execute format('create trigger planner_state_change before insert or update or delete on public.%I for each row execute function planner_private.touch_plan_state()',target);
 end loop;
end $$;
alter table public.planner_ai_proposals add column proposal_type text not null default 'capture' check(proposal_type in('capture','schedule'));
-- Capture acceptance cannot treat a schedule envelope as an empty capture.
do $$ declare source text;begin
 source:=pg_get_functiondef('planner_private.ai_proposal_command(jsonb)'::regprocedure);
 if position('if proposal.version' in source)=0 then raise exception 'Capture version guard missing';end if;
 source:=replace(source,'if proposal.version','if proposal.proposal_type<>''capture'' then return jsonb_build_object(''status'',''unsupported'');end if; if proposal.version');
 execute source;
end $$;
create function public.planner_schedule_context(p_date date) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('version',(select version from public.planner_state_versions where user_id=auth.uid()),
  'timezone',coalesce((select timezone from public.profiles where id=auth.uid()),'UTC'),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by id) from public.tasks t where user_id=auth.uid() and not is_completed and archived_at is null),'[]'),
  'events',coalesce((select jsonb_agg(to_jsonb(e) order by id) from public.calendar_events e where user_id=auth.uid()),'[]'),
  'coverageComplete',not exists(select 1 from public.recurring_task_series s where s.user_id=auth.uid() and s.status='active' and s.activation_date<=p_date+1 and (s.coverage_horizon is null or s.coverage_horizon<least(p_date+1,coalesce(s.last_scheduled_date,p_date+1))))
   and not exists(select 1 from public.tasks t join public.planner_routine_schedules s on s.series_id=t.recurring_series_id where t.user_id=auth.uid() and t.scheduled_date between p_date-1 and p_date+1 and not t.is_completed and coalesce(t.recurrence_occurrence_state,'') not in('skipped','withdrawn','completed') and not exists(select 1 from public.calendar_events e where e.user_id=auth.uid() and e.routine_occurrence_id=t.recurring_occurrence_id)),
  'priorities',public.priority_snapshot(p_date))
$$;
revoke all on function public.planner_schedule_context(date) from public,anon;
grant execute on function public.planner_schedule_context(date) to authenticated;

create function planner_private.schedule_store(p_id uuid,p_fingerprint text,p_body jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); token uuid; proposal public.planner_ai_proposals; item jsonb; normalized jsonb:='[]'; captures jsonb:='[]'; child jsonb:=null; result jsonb; c jsonb; event public.calendar_events; task public.tasks; candidate public.calendar_events; starts timestamptz; ends timestamptz; day date; zone text; before_priority jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found');end if;
 if p_id is null or length(coalesce(p_fingerprint,'')) not between 1 and 128 or jsonb_typeof(p_body) is distinct from 'object' or octet_length(p_body::text)>131072 then return jsonb_build_object('status','invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':ai-preview:'||p_id::text,0));
 select * into proposal from public.planner_ai_proposals where id=p_id and user_id=owner_id;
 if found then if proposal.request_fingerprint<>p_fingerprint or proposal.proposal_type<>'schedule' then return jsonb_build_object('status','conflict');end if;return jsonb_build_object('status','complete','proposal',to_jsonb(proposal));end if;
 select version into token from public.planner_state_versions where user_id=owner_id for update;
 if token is distinct from (p_body->>'contextVersion')::uuid then return jsonb_build_object('status','conflict');end if;
 if exists(select 1 from jsonb_object_keys(p_body) k where k not in('date','timezone','contextVersion','message','questions','assumptions','freeTime','capture','events','priorities'))
  or jsonb_typeof(p_body->'message') is distinct from 'string' or jsonb_typeof(p_body->'events') is distinct from 'array' or jsonb_typeof(p_body->'capture'->'items') is distinct from 'array'
  or jsonb_typeof(p_body->'questions') is distinct from 'array' or jsonb_typeof(p_body->'assumptions') is distinct from 'array' or jsonb_typeof(p_body->'freeTime') is distinct from 'array'
  or exists(select 1 from jsonb_array_elements(p_body->'questions') q where jsonb_typeof(q) is distinct from 'string')
  or exists(select 1 from jsonb_array_elements(p_body->'assumptions') a where jsonb_typeof(a) is distinct from 'string') then return jsonb_build_object('status','invalid');end if;
 if jsonb_array_length(p_body->'events')>20 or jsonb_array_length(p_body->'capture'->'items')>10 then return jsonb_build_object('status','invalid');end if;
 day:=(p_body->>'date')::date;zone:=p_body->>'timezone';if day is null or not exists(select 1 from pg_timezone_names where name=zone) then return jsonb_build_object('status','invalid');end if;
 if jsonb_array_length(p_body->'questions')>0 and (jsonb_array_length(p_body->'events')>0 or jsonb_array_length(p_body->'capture'->'items')>0 or p_body->'priorities'<>'null'::jsonb) then return jsonb_build_object('status','invalid');end if;
 for item in select value from jsonb_array_elements(p_body->'capture'->'items') loop
  if coalesce(item->>'kind','') not in('task-create','task-edit','routine-create') or item ? 'projectId' or item ? 'projectItemId' then return jsonb_build_object('status','unsupported');end if;
  if item->>'kind'='task-edit' then
   select * into task from public.tasks where id=(item->>'targetId')::uuid and user_id=owner_id;
   if not found or task.version is distinct from (item->>'expectedVersion')::uuid then return jsonb_build_object('status','conflict');end if;
   if task.recurring_series_id is not null then return jsonb_build_object('status','unsupported');end if;
   item:=item||jsonb_build_object('before',to_jsonb(task));
  end if;
  captures:=captures||jsonb_build_array(item);
 end loop;
 for item in select value from jsonb_array_elements(p_body->'events') loop
  if jsonb_typeof(item) is distinct from 'object' or (item->>'id')::uuid is null or coalesce(item->>'kind','') not in('event-create','event-edit','event-remove')
   or exists(select 1 from jsonb_object_keys(item) k where k not in('id','kind','targetId','expectedVersion','changes','taskItemId','before','category')) then return jsonb_build_object('status','invalid');end if;
  event:=null;c:=item->'changes';
  if jsonb_typeof(c) is distinct from 'object' or exists(select 1 from jsonb_object_keys(c) k where k not in('title','start_date','end_date','start_time','end_time','timezone','task_id','is_protected')) then return jsonb_build_object('status','invalid');end if;
  if item->>'kind'<>'event-create' then
   select * into event from public.calendar_events where id=(item->>'targetId')::uuid and user_id=owner_id;
   if not found or event.version is distinct from (item->>'expectedVersion')::uuid then return jsonb_build_object('status','conflict');end if;
   if event.is_protected or not event.app_owned or event.is_recurring or event.is_exception or event.routine_occurrence_id is not null or event.recurring_event_id is not null or event.session_ended_at is not null then return jsonb_build_object('status','unsupported');end if;
   item:=item||jsonb_build_object('before',to_jsonb(event));
  elsif item ? 'targetId' or item ? 'expectedVersion' then return jsonb_build_object('status','invalid');end if;
  if item->>'kind'='event-remove' then if c<>'{}'::jsonb then return jsonb_build_object('status','invalid');end if;
  else
   candidate:=jsonb_populate_record(event,c);
   if candidate.title is null or length(btrim(candidate.title)) not between 1 and 200 or candidate.start_date is null or candidate.end_date is null or candidate.start_time is null or candidate.end_time is null or candidate.is_protected is null
    or not exists(select 1 from pg_timezone_names where name=candidate.timezone) then return jsonb_build_object('status','invalid');end if;
   starts:=(candidate.start_date+candidate.start_time) at time zone candidate.timezone;ends:=(candidate.end_date+candidate.end_time) at time zone candidate.timezone;
   if ends<=starts or starts<day::timestamp at time zone zone or ends>(day+1)::timestamp at time zone zone
    or starts at time zone candidate.timezone<>candidate.start_date+candidate.start_time or ends at time zone candidate.timezone<>candidate.end_date+candidate.end_time then return jsonb_build_object('status','invalid');end if;
   if candidate.task_id is not null and not exists(select 1 from public.tasks where id=candidate.task_id and user_id=owner_id and not is_completed and archived_at is null) then return jsonb_build_object('status','not-found');end if;
   if item->>'taskItemId' is not null and (candidate.task_id is not null or not exists(select 1 from jsonb_array_elements(captures) v where v->>'id'=item->>'taskItemId' and v->>'kind'='task-create')) then return jsonb_build_object('status','invalid');end if;
  end if;
  normalized:=normalized||jsonb_build_array(item);
 end loop;
 if (select count(*) from jsonb_array_elements(normalized||captures))<>(select count(distinct value->>'id') from jsonb_array_elements(normalized||captures)) then return jsonb_build_object('status','invalid');end if;
 if exists(select value->>'targetId' from jsonb_array_elements(normalized) where value ? 'targetId' group by value->>'targetId' having count(*)>1) then return jsonb_build_object('status','invalid');end if;
 before_priority:=public.priority_snapshot(day);
 if p_body->'priorities' is not null and p_body->'priorities'<>'null'::jsonb then
  if jsonb_typeof(p_body->'priorities'->'taskIds') is distinct from 'array' or before_priority->'version' is distinct from p_body->'priorities'->'expectedVersion'
   or exists(select 1 from jsonb_array_elements_text(p_body->'priorities'->'taskIds') v where not exists(select 1 from public.tasks where id=v::uuid and user_id=owner_id and not is_completed and archived_at is null)) then return jsonb_build_object('status','conflict');end if;
 end if;
 if jsonb_array_length(captures)>0 then
  result:=planner_private.ai_store_proposal(gen_random_uuid(),p_fingerprint,jsonb_build_object('message',p_body->>'message','items',captures));
  if result->>'status'<>'complete' then return result;end if;child:=result->'proposal';
 end if;
 insert into public.planner_ai_proposals(id,user_id,request_fingerprint,proposal_type,body) values(p_id,owner_id,p_fingerprint,'schedule',p_body||jsonb_build_object('capture',jsonb_build_object('message',p_body->>'message','items',captures),'events',normalized,'captureProposal',case when child is null then null else jsonb_build_object('id',child->>'id','version',child->>'version') end,'beforePriorities',before_priority)) returning * into proposal;
 return jsonb_build_object('status','complete','proposal',to_jsonb(proposal));
exception when invalid_text_representation or datetime_field_overflow or invalid_parameter_value then return jsonb_build_object('status','invalid');when unique_violation then return jsonb_build_object('status','conflict');
end $$;
revoke all on function planner_private.schedule_store(uuid,text,jsonb) from public,anon;
grant execute on function planner_private.schedule_store(uuid,text,jsonb) to authenticated;
create function public.planner_schedule_store_proposal(p_id uuid,p_fingerprint text,p_body jsonb) returns jsonb language sql security invoker set search_path=pg_catalog as $$select planner_private.schedule_store(p_id,p_fingerprint,p_body)$$;
revoke all on function public.planner_schedule_store_proposal(uuid,text,jsonb) from public,anon;
grant execute on function public.planner_schedule_store_proposal(uuid,text,jsonb) to authenticated;

create function planner_private.schedule_command(p_request jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
<<command>>
declare owner_id uuid:=auth.uid(); request_id uuid; token uuid; receipt public.planner_command_receipts; proposal public.planner_ai_proposals; change public.planner_changes;
 item jsonb; result jsonb; child jsonb; captures jsonb:='[]'; events_result jsonb:='[]'; mapping jsonb:='{}'; before_data jsonb; after_data jsonb; outcome jsonb;
 event public.calendar_events; task public.tasks; changes jsonb; ids uuid[]; priority_version uuid; series public.recurring_task_series; starts timestamptz; ends timestamptz; facts jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found');end if;
 if jsonb_typeof(p_request) is distinct from 'object' or coalesce(p_request->>'operation','') not in('accept','reject','undo') or exists(select 1 from jsonb_object_keys(p_request) k where k not in('operation','operationId','proposalId','changeId','expectedVersion')) then return jsonb_build_object('status','invalid');end if;
 request_id:=(p_request->>'operationId')::uuid;if request_id is null then return jsonb_build_object('status','invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
 select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
 if found then if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict');end if;return jsonb_set(receipt.outcome,'{status}','"already-applied"');end if;
 select version into token from public.planner_state_versions where user_id=owner_id for update;
 if p_request->>'operation'='undo' then
  select * into change from public.planner_changes where id=(p_request->>'changeId')::uuid and user_id=owner_id for update;
  if not found or change.kind<>'ai-plan' then return jsonb_build_object('status','not-found');end if;
  if change.version is distinct from (p_request->>'expectedVersion')::uuid or change.undone_at is not null or token is distinct from (change.after_state->>'stateVersion')::uuid then return jsonb_build_object('status','conflict');end if;
  before_data:=change.before_state;after_data:=change.after_state;
  for item in select value from jsonb_array_elements(after_data->'events') where value->>'kind'='event-create' loop
   select * into event from public.calendar_events where id=(item->'event'->>'id')::uuid and user_id=owner_id;
   result:=public.calendar_capture_command('remove',gen_random_uuid(),event.id,event.version,'{}');
   if result->>'status'<>'complete' then raise exception using errcode='PT409',message='Created event changed';end if;
  end loop;
  for item in select value from jsonb_array_elements(after_data->'captures') where value->>'kind'='routine-create' loop
   select * into series from public.recurring_task_series where id=(item->>'recordId')::uuid and user_id=owner_id;
   result:=public.recurring_task_delete_series('delete-series',jsonb_build_object('userId',owner_id,'seriesId',series.id,'effectiveDate',series.activation_date,'expectedRevisionToken',series.revision_token,'idempotencyKey',gen_random_uuid()));
   if result->>'status'<>'complete' then raise exception using errcode='PT409',message='Created routine changed';end if;
  end loop;
  for item in select value from jsonb_array_elements(before_data->'tasks') loop perform planner_private.restore_snapshot('tasks',item,owner_id);end loop;
  for item in select value from jsonb_array_elements(before_data->'events') loop
   if exists(select 1 from public.calendar_events where id=(item->>'id')::uuid and user_id=owner_id) then perform planner_private.restore_snapshot('calendar_events',item,owner_id);
   else perform planner_private.insert_snapshot('calendar_events',item||jsonb_build_object('version',gen_random_uuid(),'updated_at',statement_timestamp()),owner_id);end if;
  end loop;
  if before_data->'priorities'<>'null'::jsonb then
   insert into public.daily_priority_state(user_id,date,task_ids) values(owner_id,(before_data->'priorities'->>'date')::date,array(select jsonb_array_elements_text(before_data->'priorities'->'taskIds')::uuid))
    on conflict(user_id,date) do update set task_ids=excluded.task_ids,version=gen_random_uuid();
   if before_data->'priorities'->'version'='null'::jsonb then delete from public.daily_priority_state where user_id=owner_id and date=(before_data->'priorities'->>'date')::date;end if;
  end if;
  for item in select value from jsonb_array_elements(after_data->'captures') where value->>'kind'='task-create' loop
   delete from public.tasks where id=(item->>'recordId')::uuid and user_id=owner_id;
  end loop;
  -- Reminder snapshots are server-owned and the global revision proves no later reminder edit is overwritten.
  delete from public.reminders r where r.user_id=owner_id and (
   r.source_type='calendar_event' and r.source_id in(select (value->>'id')::uuid from jsonb_array_elements(before_data->'events'))
   or r.source_type='task' and r.source_id in(select (value->>'id')::uuid from jsonb_array_elements(before_data->'tasks')));
  for item in select value from jsonb_array_elements(before_data->'reminders') loop perform planner_private.insert_snapshot('reminders',item,owner_id);end loop;
  update public.planner_changes set undone_at=statement_timestamp() where id=change.id and user_id=owner_id;
  outcome:=jsonb_build_object('status','complete','changeId',change.id);
 else
  select * into proposal from public.planner_ai_proposals where id=(p_request->>'proposalId')::uuid and user_id=owner_id and proposal_type='schedule' for update;
  if not found then return jsonb_build_object('status','not-found');end if;
  if proposal.version is distinct from (p_request->>'expectedVersion')::uuid or proposal.state<>'pending' then return jsonb_build_object('status','conflict');end if;
  child:=proposal.body->'captureProposal';
  if p_request->>'operation'='accept' then
   if token is distinct from (proposal.body->>'contextVersion')::uuid or proposal.expires_at<=statement_timestamp() or jsonb_array_length(proposal.body->'questions')>0
    or (jsonb_array_length(proposal.body->'events')=0 and jsonb_array_length(proposal.body->'capture'->'items')=0 and proposal.body->'priorities'='null'::jsonb) then return jsonb_build_object('status','conflict');end if;
   before_data:=jsonb_build_object('planDate',proposal.body->>'date',
    'tasks',coalesce((select jsonb_agg(to_jsonb(t)) from public.tasks t where user_id=owner_id and id in(select (value->>'targetId')::uuid from jsonb_array_elements(proposal.body->'capture'->'items') where value->>'kind'='task-edit')),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)) from public.calendar_events e where user_id=owner_id and id in(select (value->>'targetId')::uuid from jsonb_array_elements(proposal.body->'events'))),'[]'::jsonb),
    'priorities',case when proposal.body->'priorities'='null'::jsonb then null else proposal.body->'beforePriorities' end);
   before_data:=before_data||jsonb_build_object('reminders',coalesce((select jsonb_agg(to_jsonb(r)) from public.reminders r where user_id=owner_id and (
    source_type='calendar_event' and source_id in(select (value->>'id')::uuid from jsonb_array_elements(before_data->'events')) or source_type='task' and source_id in(select (value->>'id')::uuid from jsonb_array_elements(before_data->'tasks')))),'[]'::jsonb));
   if child is not null and child<>'null'::jsonb then
    result:=planner_private.ai_proposal_command(jsonb_build_object('operation','accept','operationId',child->>'id','proposalId',child->>'id','expectedVersion',child->>'version'));
    if result->>'status'<>'complete' then raise exception using errcode='PT409',message='Capture changed';end if;captures:=result->'results';
    for item in select value from jsonb_array_elements(captures) loop mapping:=mapping||jsonb_build_object(item->>'itemId',item->>'recordId');end loop;
   end if;
   -- Remove/move existing reservations before adding replacements. All writes remain one transaction.
   for item in select value from jsonb_array_elements(proposal.body->'events') with ordinality x(value,n) order by case when value->>'kind'='event-remove' then 0 else 1 end,n loop
    select * into event from public.calendar_events where id=(item->>'targetId')::uuid and user_id=owner_id;
    if item->>'kind'<>'event-create' and (event.id is null or event.is_protected or event.is_recurring or event.is_exception or event.routine_occurrence_id is not null) then raise exception using errcode='PT409',message='Commitment changed';end if;
    changes:=item->'changes';if item->>'taskItemId' is not null then changes:=changes||jsonb_build_object('task_id',mapping->>(item->>'taskItemId'));end if;
    if item->>'kind'<>'event-remove' then
     changes:=case when item->>'kind'='event-edit' then to_jsonb(event)||changes else changes end;
     if changes->>'task_id' is not null then
      starts:=((changes->>'start_date')::date+(changes->>'start_time')::time) at time zone (changes->>'timezone');ends:=((changes->>'end_date')::date+(changes->>'end_time')::time) at time zone (changes->>'timezone');
      select value->'facts' into facts from jsonb_array_elements(public.action_queue_snapshot(starts,floor(extract(epoch from ends-starts)/60)::integer)->'tasks') where value->>'id'=changes->>'task_id';
      if not coalesce((facts->>'actionable')::boolean,false) or not coalesce((facts->>'fitsGap')::boolean,false) then raise exception using errcode='PT409',message='Task is no longer feasible';end if;
     end if;
     changes:=(select jsonb_object_agg(key,value) from jsonb_each(changes) where key in('title','start_date','end_date','start_time','end_time','timezone','task_id','is_protected'));
    end if;
    result:=public.calendar_capture_command(replace(item->>'kind','event-',''),(item->>'id')::uuid,event.id,event.version,changes);
    if result->>'status'<>'complete' then raise exception using errcode='PT409',message='Schedule event changed';end if;
    events_result:=events_result||jsonb_build_array(jsonb_build_object('itemId',item->>'id','kind',item->>'kind','event',result->'event'));
   end loop;
   if proposal.body->'priorities'<>'null'::jsonb then
    result:=planner_private.priority_command(jsonb_build_object('operation','set','operationId',gen_random_uuid(),'date',proposal.body->>'date','expectedVersion',proposal.body->'priorities'->'expectedVersion','taskIds',proposal.body->'priorities'->'taskIds'));
    if result->>'status'<>'complete' then raise exception using errcode='PT409',message='Priorities changed';end if;
   end if;
   select version into token from public.planner_state_versions where user_id=owner_id;
   after_data:=jsonb_build_object('stateVersion',token,'events',events_result,'captures',captures);
   insert into public.planner_changes(user_id,kind,before_state,after_state) values(owner_id,'ai-plan',before_data,after_data) returning * into change;
   outcome:=jsonb_build_object('status','complete','proposalId',proposal.id,'changeId',change.id,'changeVersion',change.version);
  else
   if child is not null and child<>'null'::jsonb then
    result:=planner_private.ai_proposal_command(jsonb_build_object('operation','reject','operationId',child->>'id','proposalId',child->>'id','expectedVersion',child->>'version'));
    if result->>'status'<>'complete' then raise exception using errcode='PT409',message='Capture changed';end if;
   end if;
   outcome:=jsonb_build_object('status','complete','proposalId',proposal.id);
  end if;
  update public.planner_ai_proposals set state=case when p_request->>'operation'='accept' then 'accepted' else 'rejected' end,version=gen_random_uuid(),outcome=command.outcome where id=proposal.id and user_id=owner_id;
 end if;
 insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
 return outcome;
exception when sqlstate 'PT409' or integrity_constraint_violation or serialization_failure or deadlock_detected then return jsonb_build_object('status','conflict');
 when invalid_text_representation or datetime_field_overflow or invalid_parameter_value then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.schedule_command(jsonb) from public,anon;
grant execute on function planner_private.schedule_command(jsonb) to authenticated;
create function public.planner_schedule_command(p_request jsonb) returns jsonb language sql security invoker set search_path=pg_catalog as $$select planner_private.schedule_command(p_request)$$;
revoke all on function public.planner_schedule_command(jsonb) from public,anon;
grant execute on function public.planner_schedule_command(jsonb) to authenticated;
alter function planner_private.planner_command(jsonb) rename to planner_before_schedule_command;
revoke all on function planner_private.planner_before_schedule_command(jsonb) from public,anon,authenticated;
create function planner_private.planner_command(p_request jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_request->>'operation'='undo' and exists(select 1 from public.planner_changes where id=(p_request->>'changeId')::uuid and user_id=auth.uid() and kind='ai-plan') then return planner_private.schedule_command(p_request);end if;
 return planner_private.planner_before_schedule_command(p_request);
end $$;
revoke all on function planner_private.planner_command(jsonb) from public,anon;
grant execute on function planner_private.planner_command(jsonb) to authenticated;
-- The public wrapper is recreated because SQL function dependencies follow a renamed function OID.
create or replace function public.planner_command(p_request jsonb) returns jsonb language sql security invoker set search_path=pg_catalog as $$select planner_private.planner_command(p_request)$$;

