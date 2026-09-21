alter table public.planning_sessions add column travel_minutes integer check(travel_minutes between 1 and 1440);

-- A horizon is one snapshot and one accepted transaction, never a chain of day accepts.
create function public.planner_horizon_context(p_start date,p_end date) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare snapshot jsonb; daily jsonb; day date; coverage boolean:=true;
begin
 if auth.uid() is null or p_start is null or p_end is null or p_end<p_start or p_end-p_start>90 then return null;end if;
 snapshot:=public.planner_schedule_context(p_start);
 for day in select p_start+n from generate_series(0,p_end-p_start) n loop
  daily:=public.planner_schedule_context(day);
  coverage:=coverage and coalesce((daily->>'coverageComplete')::boolean,false);
 end loop;
 return snapshot||jsonb_build_object('coverageComplete',coverage);
end $$;
revoke all on function public.planner_horizon_context(date,date) from public,anon;
grant execute on function public.planner_horizon_context(date,date) to authenticated;

create or replace function planner_private.schedule_store(p_id uuid,p_fingerprint text,p_body jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); token uuid; proposal public.planner_ai_proposals; item jsonb; normalized jsonb:='[]'; captures jsonb:='[]'; child jsonb:=null; result jsonb; c jsonb; event public.calendar_events; task public.tasks; candidate public.calendar_events; starts timestamptz; ends timestamptz; day date; last_day date; zone text; planning public.planning_sessions; before_priority jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found');end if;
 if p_id is null or length(coalesce(p_fingerprint,'')) not between 1 and 128 or jsonb_typeof(p_body) is distinct from 'object' or octet_length(p_body::text)>131072 then return jsonb_build_object('status','invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':ai-preview:'||p_id::text,0));
 select * into proposal from public.planner_ai_proposals where id=p_id and user_id=owner_id;
 if found then if proposal.request_fingerprint<>p_fingerprint or proposal.proposal_type<>'schedule' then return jsonb_build_object('status','conflict');end if;return jsonb_build_object('status','complete','proposal',to_jsonb(proposal));end if;
 select version into token from public.planner_state_versions where user_id=owner_id for update;
 if token is distinct from (p_body->>'contextVersion')::uuid then return jsonb_build_object('status','conflict');end if;
 if exists(select 1 from jsonb_object_keys(p_body) k where k not in('date','timezone','contextVersion','message','questions','assumptions','freeTime','capture','events','priorities','horizon','planningSession'))
  or jsonb_typeof(p_body->'message') is distinct from 'string' or jsonb_typeof(p_body->'events') is distinct from 'array' or jsonb_typeof(p_body->'capture'->'items') is distinct from 'array'
  or jsonb_typeof(p_body->'questions') is distinct from 'array' or jsonb_typeof(p_body->'assumptions') is distinct from 'array' or jsonb_typeof(p_body->'freeTime') is distinct from 'array'
  or exists(select 1 from jsonb_array_elements(p_body->'questions') q where jsonb_typeof(q) is distinct from 'string')
  or exists(select 1 from jsonb_array_elements(p_body->'assumptions') a where jsonb_typeof(a) is distinct from 'string') then return jsonb_build_object('status','invalid');end if;
 if jsonb_array_length(p_body->'events')>(case when p_body ? 'horizon' then 200 else 20 end) or jsonb_array_length(p_body->'capture'->'items')>10 then return jsonb_build_object('status','invalid');end if;
 day:=(p_body->>'date')::date;zone:=p_body->>'timezone';if day is null or not exists(select 1 from pg_timezone_names where name=zone) then return jsonb_build_object('status','invalid');end if;
 last_day:=day;
 if p_body ? 'horizon' then
  if jsonb_typeof(p_body->'horizon') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_body->'horizon') k where k not in('startDate','endDate','timezone'))
   or p_body->'horizon'->>'startDate' is distinct from p_body->>'date' or p_body->'horizon'->>'timezone' is distinct from zone then return jsonb_build_object('status','invalid');end if;
  last_day:=(p_body->'horizon'->>'endDate')::date;
  if last_day is null or last_day<day or last_day-day>90 or p_body->'priorities' is distinct from 'null'::jsonb
   or exists(select 1 from jsonb_array_elements(p_body->'capture'->'items') i where i->>'kind'='routine-create')
   then return jsonb_build_object('status','invalid');end if;
  if coalesce((public.planner_horizon_context(day,last_day)->>'coverageComplete')::boolean,false)=false then return jsonb_build_object('status','conflict');end if;
 end if;
 if p_body ? 'planningSession' then
  if not (p_body ? 'horizon') or jsonb_typeof(p_body->'planningSession') is distinct from 'object' then return jsonb_build_object('status','invalid');end if;
  select * into planning from public.planning_sessions where id=(p_body->'planningSession'->>'id')::uuid and user_id=owner_id for update;
  if not found or planning.version is distinct from (p_body->'planningSession'->>'version')::uuid or planning.status not in('ready','drafted')
   or planning.start_date is distinct from day or planning.end_date is distinct from last_day or planning.timezone is distinct from zone then return jsonb_build_object('status','conflict');end if;
 end if;
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
   if p_body ? 'horizon' and ((event.start_date+coalesce(event.start_time,time '00:00')) at time zone coalesce(event.timezone,zone)<day::timestamp at time zone zone or (event.end_date+(case when event.start_time is null then 1 else 0 end)+coalesce(event.end_time,time '00:00')) at time zone coalesce(event.timezone,zone)>(last_day+1)::timestamp at time zone zone) then return jsonb_build_object('status','invalid');end if;
   item:=item||jsonb_build_object('before',to_jsonb(event));
  elsif item ? 'targetId' or item ? 'expectedVersion' then return jsonb_build_object('status','invalid');end if;
  if item->>'kind'='event-remove' then if c<>'{}'::jsonb then return jsonb_build_object('status','invalid');end if;
  else
   candidate:=jsonb_populate_record(event,c);
   if candidate.title is null or length(btrim(candidate.title)) not between 1 and 200 or candidate.start_date is null or candidate.end_date is null or candidate.start_time is null or candidate.end_time is null or candidate.is_protected is null
    or not exists(select 1 from pg_timezone_names where name=candidate.timezone) then return jsonb_build_object('status','invalid');end if;
   starts:=(candidate.start_date+candidate.start_time) at time zone candidate.timezone;ends:=(candidate.end_date+candidate.end_time) at time zone candidate.timezone;
   if ends<=starts or starts<day::timestamp at time zone zone or ends>(last_day+1)::timestamp at time zone zone
    or starts at time zone candidate.timezone<>candidate.start_date+candidate.start_time or ends at time zone candidate.timezone<>candidate.end_date+candidate.end_time then return jsonb_build_object('status','invalid');end if;
   if candidate.task_id is not null and not exists(select 1 from public.tasks where id=candidate.task_id and user_id=owner_id and not is_completed and archived_at is null) then return jsonb_build_object('status','not-found');end if;
   if item->>'taskItemId' is not null and (candidate.task_id is not null or not exists(select 1 from jsonb_array_elements(captures) v where v->>'id'=item->>'taskItemId' and v->>'kind'='task-create')) then return jsonb_build_object('status','invalid');end if;
  end if;
  normalized:=normalized||jsonb_build_array(item);
 end loop;
 -- Removals have no changes. Their owner-validated immutable before snapshot
 -- determines the civil day; never trust a caller-supplied before value.
 if p_body ? 'horizon' and exists(select 1 from jsonb_array_elements(normalized) e group by
  case when e->>'kind'='event-remove' then ((((e->'before'->>'start_date')::date+coalesce((e->'before'->>'start_time')::time,time '00:00')) at time zone coalesce(e->'before'->>'timezone',zone)) at time zone zone)::date else (e->'changes'->>'start_date')::date end having count(*)>20)
  then return jsonb_build_object('status','invalid');end if;
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

create or replace function planner_private.schedule_command(p_request jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
<<command>>
declare owner_id uuid:=auth.uid(); request_id uuid; token uuid; receipt public.planner_command_receipts; proposal public.planner_ai_proposals; change public.planner_changes;
 item jsonb; result jsonb; child jsonb; captures jsonb:='[]'; events_result jsonb:='[]'; mapping jsonb:='{}'; before_data jsonb; after_data jsonb; outcome jsonb;
 event public.calendar_events; task public.tasks; changes jsonb; ids uuid[]; priority_version uuid; series public.recurring_task_series; starts timestamptz; ends timestamptz; facts jsonb; planning public.planning_sessions;
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
  if after_data ? 'planningSession' then
   select * into planning from public.planning_sessions where id=(after_data->'planningSession'->>'id')::uuid and user_id=owner_id for update;
   if not found or planning.version is distinct from (after_data->'planningSession'->>'version')::uuid then return jsonb_build_object('status','conflict');end if;
  end if;
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
  if after_data ? 'planningSession' then
   update public.planning_sessions set status='drafted',version=gen_random_uuid(),updated_at=now() where id=planning.id and user_id=owner_id returning * into planning;
   outcome:=outcome||jsonb_build_object('planning',jsonb_build_object('sessionId',planning.id,'version',planning.version,'status',planning.status,'horizon',jsonb_build_object('startDate',planning.start_date,'endDate',planning.end_date,'timezone',planning.timezone),'missing','[]'::jsonb,'assumptions',planning.assumptions));
  end if;
 else
  select * into proposal from public.planner_ai_proposals where id=(p_request->>'proposalId')::uuid and user_id=owner_id and proposal_type='schedule' for update;
  if not found then return jsonb_build_object('status','not-found');end if;
  if proposal.version is distinct from (p_request->>'expectedVersion')::uuid or proposal.state<>'pending' then return jsonb_build_object('status','conflict');end if;
  child:=proposal.body->'captureProposal';
  if p_request->>'operation'='accept' then
   if proposal.body ? 'planningSession' then
    select * into planning from public.planning_sessions where id=(proposal.body->'planningSession'->>'id')::uuid and user_id=owner_id for update;
    if not found or planning.version is distinct from (proposal.body->'planningSession'->>'version')::uuid or planning.status not in('ready','drafted') then return jsonb_build_object('status','conflict');end if;
   end if;
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
   if proposal.body ? 'planningSession' then
    update public.planning_sessions set status='applied',version=gen_random_uuid(),updated_at=now() where id=(proposal.body->'planningSession'->>'id')::uuid and user_id=owner_id returning * into planning;
    after_data:=after_data||jsonb_build_object('planningSession',jsonb_build_object('id',planning.id,'version',planning.version));
   end if;
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

-- Expose a versioned planning handle; all actual facts remain server-owned.
do $$ declare source text;begin
 source:=pg_get_functiondef('planner_private.assistant_finish_turn(uuid,text,jsonb)'::regprocedure);
 if position('''sessionId'',session_id,''status''' in source)=0 then raise exception 'Planning response anchor missing';end if;
 source:=replace(source,'''sessionId'',session_id,''status''','''sessionId'',session_id,''version'',(select version from public.planning_sessions where id=session_id and user_id=owner_id),''horizon'',plan->''horizon'',''status''');
 if position($anchor$('status','horizon','readiness','facts','assumptions')$anchor$ in source)=0 then raise exception 'Travel contract anchor missing';end if;
 source:=replace(source,$anchor$('status','horizon','readiness','facts','assumptions')$anchor$,$replacement$('status','horizon','readiness','facts','assumptions','travelMinutes')$replacement$);
 if position($anchor$for field in select jsonb_object_keys(plan->'readiness') loop$anchor$ in source)=0 then raise exception 'Travel contract anchor missing';end if;
 source:=replace(source,$anchor$for field in select jsonb_object_keys(plan->'readiness') loop$anchor$,$replacement$if plan ? 'travelMinutes' and plan->'travelMinutes'<>'null'::jsonb and (jsonb_typeof(plan->'travelMinutes') is distinct from 'number' or (plan->>'travelMinutes')::numeric not between 1 and 1440 or (plan->>'travelMinutes')::numeric<>trunc((plan->>'travelMinutes')::numeric)) then return jsonb_build_object('status','invalid');end if;
  for field in select jsonb_object_keys(plan->'readiness') loop$replacement$);
 if position($anchor$planning_sessions(user_id,conversation_id,status,start_date,end_date,timezone,facts,readiness,assumptions)$anchor$ in source)=0 then raise exception 'Travel contract anchor missing';end if;
 source:=replace(source,$anchor$planning_sessions(user_id,conversation_id,status,start_date,end_date,timezone,facts,readiness,assumptions)$anchor$,$replacement$planning_sessions(user_id,conversation_id,status,start_date,end_date,timezone,facts,readiness,assumptions,travel_minutes)$replacement$);
 if position($anchor$plan->'facts',plan->'readiness',plan->'assumptions')$anchor$ in source)=0 then raise exception 'Travel contract anchor missing';end if;
 source:=replace(source,$anchor$plan->'facts',plan->'readiness',plan->'assumptions')$anchor$,$replacement$plan->'facts',plan->'readiness',plan->'assumptions',(plan->>'travelMinutes')::integer)$replacement$);
 if position($anchor$assumptions=excluded.assumptions,version=$anchor$ in source)=0 then raise exception 'Travel contract anchor missing';end if;
 source:=replace(source,$anchor$assumptions=excluded.assumptions,version=$anchor$,$replacement$assumptions=excluded.assumptions,travel_minutes=excluded.travel_minutes,version=$replacement$);
 execute source;
end $$;
