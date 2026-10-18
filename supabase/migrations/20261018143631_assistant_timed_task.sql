-- A task's reservation is accepted with its task in the existing capture transaction.
-- Duration provenance belongs to the immutable preview, not the task estimate.
create function planner_private.timed_task_schedule_valid(schedule jsonb, changes jsonb)
returns boolean language plpgsql stable set search_path=pg_catalog,public as $$
declare starts timestamp; ends timestamp; first_instant timestamptz; last_instant timestamptz;
 zone text; wall timestamp; matches integer; minutes numeric;
begin
 if jsonb_typeof(schedule) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(schedule) k where k not in('startDate','startTime','endDate','endTime','timezone','durationSource'))
  or exists(select 1 from unnest(array['startDate','startTime','endDate','endTime','timezone','durationSource']) k where jsonb_typeof(schedule->k) is distinct from 'string')
  or schedule->>'startDate' !~ '^\d{4}-\d{2}-\d{2}$' or schedule->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$'
  or schedule->>'startTime' !~ '^([01]\d|2[0-3]):[0-5]\d$' or schedule->>'endTime' !~ '^([01]\d|2[0-3]):[0-5]\d$'
  or schedule->>'durationSource' not in('explicit','estimate','default') then return false;end if;
 zone:=schedule->>'timezone';
 if not exists(select 1 from pg_timezone_names where name=zone) then return false;end if;
 starts:=(schedule->>'startDate')::date+(schedule->>'startTime')::time;
 ends:=(schedule->>'endDate')::date+(schedule->>'endTime')::time;
 -- Count valid instants using offsets on either side of a possible transition.
 -- Zero is a gap; more than one is a fold. Both require clarification.
 foreach wall in array array[starts,ends] loop
  select count(distinct instant) into matches from (
   select (wall-((probe at time zone zone)-(probe at time zone 'UTC'))) at time zone 'UTC' instant
   from (select (wall at time zone 'UTC')+n*interval '36 hours' probe from generate_series(-1,1) n) probes
  ) candidates where instant at time zone zone=wall;
  if matches<>1 then return false;end if;
 end loop;
 first_instant:=starts at time zone zone;last_instant:=ends at time zone zone;
 minutes:=extract(epoch from last_instant-first_instant)/60;
 if minutes<=0 or minutes>10080 then return false;end if;
 if schedule->>'durationSource'='default' and (minutes<>30 or changes->>'estimate_minutes' is not null) then return false;end if;
 if schedule->>'durationSource'='estimate' and (changes->>'estimate_minutes' is null or minutes<>(changes->>'estimate_minutes')::numeric) then return false;end if;
 return true;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or invalid_parameter_value then return false;
end $$;
revoke all on function planner_private.timed_task_schedule_valid(jsonb,jsonb) from public,anon,authenticated;

-- Reuse the recurrence date calculation, including replacement exceptions. The
-- global planner revision lock keeps this occupancy stable through acceptance.
create function planner_private.timed_task_slot_available(schedule jsonb)
returns boolean language plpgsql stable set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); event public.calendar_events; zone text; starts timestamptz; ends timestamptz;
 first_day date; last_day date; occurrence record; event_start timestamptz; event_end timestamptz; days integer;
begin
 if owner_id is null then return false;end if;
 starts:=((schedule->>'startDate')::date+(schedule->>'startTime')::time) at time zone (schedule->>'timezone');
 ends:=((schedule->>'endDate')::date+(schedule->>'endTime')::time) at time zone (schedule->>'timezone');
 if not coalesce((public.planner_horizon_context((schedule->>'startDate')::date,(schedule->>'endDate')::date)->>'coverageComplete')::boolean,false) then return false;end if;
 for event in select * from public.calendar_events where user_id=owner_id loop
  zone:=coalesce(event.timezone,(select timezone from public.profiles where id=owner_id),'UTC');
  first_day:=(starts at time zone zone)::date;last_day:=(ends at time zone zone)::date;
  if event.start_date>last_day or (not event.is_recurring and event.end_date<first_day) then continue;end if;
  if event.is_recurring then
   days:=event.end_date-event.start_date;
   for occurrence in select scheduled_date,row_number() over(order by scheduled_date) n from public.recurring_task_scheduled_dates(
    event.recurrence_rule,event.start_date,event.start_date,
    case when event.end_type='after_count' then event.start_date else first_day-days end,
    case when event.end_type='on_date' then least(last_day,event.end_date_recurrence) else last_day end)
   loop
    if occurrence.scheduled_date<first_day-days or (event.end_type='after_count' and occurrence.n>coalesce(event.end_count,0))
     or exists(select 1 from public.calendar_events e where e.user_id=owner_id and e.is_exception and e.recurring_event_id=event.id and e.original_date=occurrence.scheduled_date) then continue;end if;
    event_start:=(occurrence.scheduled_date+coalesce(event.start_time,time '00:00')) at time zone zone;
    event_end:=(occurrence.scheduled_date+days+case when event.start_time is null then 1 else 0 end+coalesce(event.end_time,time '00:00')) at time zone zone;
    if event_start<ends and event_end>starts then return false;end if;
   end loop;
  else
   event_start:=(event.start_date+coalesce(event.start_time,time '00:00')) at time zone zone;
   event_end:=coalesce(event.session_ended_at,(event.end_date+case when event.start_time is null then 1 else 0 end+coalesce(event.end_time,time '00:00')) at time zone zone);
   if event_start<ends and event_end>starts then return false;end if;
  end if;
 end loop;
 return true;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or invalid_parameter_value then return false;
end $$;
revoke all on function planner_private.timed_task_slot_available(jsonb) from public,anon,authenticated;

do $$ declare source text; anchor text;begin
 source:=pg_get_functiondef('planner_private.ai_store_proposal(uuid,text,jsonb)'::regprocedure);
 anchor:=$a$('message','items')$a$;
 if position(anchor in source)=0 then raise exception 'Capture body contract missing';end if;
 source:=replace(source,anchor,$a$('message','items','contextVersion')$a$);
 anchor:=$a$('id','kind','targetId','expectedVersion','projectId','projectVersion','projectItemId','changes','before')$a$;
 if position(anchor in source)=0 then raise exception 'Capture item contract missing';end if;
 source:=replace(source,anchor,$a$('id','kind','targetId','expectedVersion','projectId','projectVersion','projectItemId','changes','before','schedule')$a$);
 anchor:=$a$for item in select value from jsonb_array_elements(p_body->'items') loop$a$;
 if position(anchor in source)=0 then raise exception 'Capture validation missing';end if;
 source:=replace(source,anchor,$a$
 if exists(select 1 from jsonb_array_elements(p_body->'items') i where i ? 'schedule') then
  if exists(select 1 from jsonb_array_elements(p_body->'items') i where i->>'kind'='routine-create') then return jsonb_build_object('status','invalid');end if;
  if jsonb_typeof(p_body->'contextVersion') is distinct from 'string' or (p_body->>'contextVersion')::uuid is null then return jsonb_build_object('status','invalid');end if;
  perform 1 from public.planner_state_versions where user_id=owner_id for update;
  if not exists(select 1 from public.planner_state_versions where user_id=owner_id and version=(p_body->>'contextVersion')::uuid) then return jsonb_build_object('status','conflict');end if;
 elsif p_body ? 'contextVersion' then return jsonb_build_object('status','invalid');end if;
 for item in select value from jsonb_array_elements(p_body->'items') loop
  if item ? 'schedule' and (item->>'kind' is distinct from 'task-create' or not planner_private.timed_task_schedule_valid(item->'schedule',item->'changes')) then return jsonb_build_object('status','invalid');end if;
  if item ? 'schedule' and not planner_private.timed_task_slot_available(item->'schedule') then return jsonb_build_object('status','conflict');end if;
 $a$);
 anchor:=$a$insert into public.planner_ai_proposals(id,user_id,request_fingerprint,body)$a$;
 if position(anchor in source)=0 then raise exception 'Capture persistence missing';end if;
 source:=replace(source,anchor,$a$
 if exists(
  select 1 from jsonb_array_elements(p_body->'items') a cross join jsonb_array_elements(p_body->'items') b
  where a->>'id'<b->>'id' and a ? 'schedule' and b ? 'schedule'
   and ((a->'schedule'->>'startDate')::date+(a->'schedule'->>'startTime')::time) at time zone (a->'schedule'->>'timezone')
       <((b->'schedule'->>'endDate')::date+(b->'schedule'->>'endTime')::time) at time zone (b->'schedule'->>'timezone')
   and ((b->'schedule'->>'startDate')::date+(b->'schedule'->>'startTime')::time) at time zone (b->'schedule'->>'timezone')
       <((a->'schedule'->>'endDate')::date+(a->'schedule'->>'endTime')::time) at time zone (a->'schedule'->>'timezone')
 ) then return jsonb_build_object('status','conflict');end if;
 $a$||anchor);
 execute source;

 source:=pg_get_functiondef('planner_private.ai_proposal_command(jsonb)'::regprocedure);
 anchor:=$a$('operation','operationId','proposalId','expectedVersion')$a$;
 if position(anchor in source)=0 then raise exception 'Capture command contract missing';end if;
 source:=replace(source,anchor,$a$('operation','operationId','proposalId','expectedVersion','supportsTimedTasks')$a$);
 anchor:=$a$project_id uuid; project_version uuid; task public.tasks;$a$;
 if position(anchor in source)=0 then raise exception 'Capture declarations missing';end if;
 source:=replace(source,anchor,anchor||$a$ token uuid; reservation jsonb; event_result jsonb;$a$);
 anchor:=$a$select * into proposal from public.planner_ai_proposals where id=(p_request->>'proposalId')::uuid and user_id=owner_id for update;$a$;
 if position(anchor in source)=0 then raise exception 'Capture locking missing';end if;
 source:=replace(source,anchor,$a$
 -- Match the planner's lock order before taking the proposal/record locks.
 if exists(select 1 from public.planner_ai_proposals p where p.id=(p_request->>'proposalId')::uuid and p.user_id=owner_id and p.body ? 'contextVersion') then
  select version into token from public.planner_state_versions where user_id=owner_id for update;
 end if;
 $a$||anchor);
 anchor:=$a$-- Lock existing parents before children; verify the entire preview before writes.$a$;
 if position(anchor in source)=0 then raise exception 'Capture preflight missing';end if;
 source:=replace(source,anchor,$a$
 if proposal.body ? 'contextVersion' and p_request->'supportsTimedTasks' is distinct from 'true'::jsonb then return jsonb_build_object('status','invalid');end if;
 if proposal.body ? 'contextVersion' and token is distinct from (proposal.body->>'contextVersion')::uuid then return jsonb_build_object('status','conflict');end if;
 $a$||anchor);
 anchor:=$a$outcome:=jsonb_build_object('status','complete','proposalId',proposal.id,'results',results);$a$;
 if position(anchor in source)=0 then raise exception 'Capture finalization missing';end if;
 source:=replace(source,anchor,$a$
 -- Reserve after all task/project captures. Any failure rolls back every write.
 if p_request->>'operation'='accept' then
 for item in select value from jsonb_array_elements(proposal.body->'items') where value ? 'schedule' loop
  reservation:=item->'schedule';
  if not planner_private.timed_task_slot_available(reservation) then raise exception using errcode='PT409',message='Task reservation overlaps existing work';end if;
  select * into task from public.tasks where user_id=owner_id and id=(select (r->>'recordId')::uuid from jsonb_array_elements(results) r where r->>'itemId'=item->>'id');
  event_result:=public.calendar_capture_command('create',(item->>'id')::uuid,null,null,jsonb_build_object(
   'title',task.title,'task_id',task.id,'is_protected',true,
   'start_date',reservation->>'startDate','start_time',reservation->>'startTime',
   'end_date',reservation->>'endDate','end_time',reservation->>'endTime','timezone',reservation->>'timezone'));
  if event_result->>'status' is distinct from 'complete' then raise exception using errcode='PT409',message='Task reservation changed';end if;
 end loop;
 end if;
 $a$||anchor);
 execute source;
end $$;

-- Keep relative-date interpretation attached to the original durable request.
-- Historic turns remain nullable until their next preparation. The original
-- account timezone cannot be recovered after the fact; freeze it on that retry.
alter table public.assistant_turns add column reference_timezone text;
do $$ declare source text;anchor text;begin
 source:=pg_get_functiondef('planner_private.assistant_begin_turn(uuid,uuid,boolean,text,jsonb)'::regprocedure);
 anchor:=$a$return jsonb_build_object('status','prepared'$a$;
 if position(anchor in source)=0 then raise exception 'Assistant preparation missing';end if;
 source:=replace(source,anchor,$a$
 -- The existing owner advisory lock serializes preparation and its retries.
 if t.reference_timezone is null then
  update public.assistant_turns set reference_timezone=coalesce(
   (select n.name from pg_timezone_names n join public.profiles p on p.timezone=n.name where p.id=owner_id),'UTC')
   where user_id=owner_id and id=p_id and reference_timezone is null returning * into t;
 end if;
 $a$||anchor);
 anchor:=$a$('status','prepared','conversationId',t.conversation_id,'messages',history)$a$;
 if position(anchor in source)=0 then raise exception 'Assistant prepared response missing';end if;
 source:=replace(source,anchor,$a$('status','prepared','conversationId',t.conversation_id,'messages',history,'referenceAt',t.created_at,'referenceTimezone',t.reference_timezone)$a$);
 execute source;
end $$;
notify pgrst,'reload schema';
