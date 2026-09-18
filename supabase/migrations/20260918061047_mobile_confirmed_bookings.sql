-- A confirmed booking outcome and its pending visit are distinct records.
alter table public.calendar_events add column booking_task_id uuid;
alter table public.calendar_events add column visit_status text check(visit_status is null or visit_status='pending');
alter table public.calendar_events add constraint calendar_booking_owner_fk foreign key(booking_task_id,user_id)
  references public.tasks(id,user_id) on delete set null (booking_task_id);
create index calendar_booking_task on public.calendar_events(booking_task_id,user_id) where booking_task_id is not null;

-- Reuse the existing exact Undo checks/restoration, adding the created visit.
do $undo$
declare definition text;
begin
 select pg_get_functiondef('planner_private.planner_base_command(jsonb)'::regprocedure) into definition;
 if position('change.kind not in (''stop'',''complete'',''complete-project'',''complete-occurrence'')' in definition)=0 then raise exception 'Unexpected Undo function shape'; end if;
 definition:=replace(definition,'change.kind not in (''stop'',''complete'',''complete-project'',''complete-occurrence'')',
   'change.kind not in (''stop'',''complete'',''complete-project'',''complete-occurrence'',''complete-booking'',''complete-booking-occurrence'')');
 definition:=replace(definition,'if change.kind=''complete-occurrence'' then','if change.kind in (''complete-occurrence'',''complete-booking-occurrence'') then');
 definition:=replace(definition,'elsif change.kind in (''complete'',''complete-occurrence'') then','elsif change.kind in (''complete'',''complete-occurrence'',''complete-booking'',''complete-booking-occurrence'') then');
 definition:=replace(definition,'if change.kind=''complete-project'' then'||chr(10)||'    perform',
   'if change.kind in (''complete-booking'',''complete-booking-occurrence'') then
     select version into token from public.planner_event_versions where event_id=(change.after_state->''createdVisit''->>''id'')::uuid and user_id=owner_id for update;
     if not found or token is distinct from (change.after_state->>''visitToken'')::uuid then return jsonb_build_object(''status'',''conflict''); end if;
     perform public.delete_calendar_event_with_reminders(owner_id,(change.after_state->''createdVisit''->>''id'')::uuid);
   end if;
   if change.kind=''complete-project'' then'||chr(10)||'    perform');
 execute definition;
end $undo$;

alter function planner_private.planner_command(jsonb) rename to planner_occurrence_command;
revoke all on function planner_private.planner_occurrence_command(jsonb) from authenticated;
create function planner_private.planner_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
<<booking>>
declare owner_id uuid:=auth.uid(); request_id uuid:=(p_request->>'operationId')::uuid;
  task public.tasks; receipt public.planner_command_receipts; visit public.calendar_events;
  details jsonb:=p_request->'visit'; starts time; ends time; day date; zone text;
  result jsonb; completion_request jsonb; outcome jsonb; token uuid;
begin
 if p_request->>'operation' is distinct from 'confirm-booking' then return planner_private.planner_occurrence_command(p_request); end if;
 if owner_id is null then return jsonb_build_object('status','not-found'); end if;
 if request_id is null then return jsonb_build_object('status','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
 select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
 if found then
  if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
  return jsonb_set(receipt.outcome,'{status}','"already-applied"');
 end if;
 select * into task from public.tasks where id=(p_request->>'taskId')::uuid and user_id=owner_id;
 if not found then return jsonb_build_object('status','not-found'); end if;
 if task.is_completed then return jsonb_build_object('status','conflict'); end if;
 if p_request->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(details) is distinct from 'object' then return jsonb_build_object('status','invalid'); end if;
 if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','taskId','expectedVersion','plan','occurrenceVersion','seriesToken','visit','confirmed'))
  or exists(select 1 from jsonb_object_keys(details) k where k not in ('title','date','startTime','endTime','timezone','location'))
  or length(btrim(coalesce(details->>'title',''))) not between 1 and 200
  or length(coalesce(details->>'location',''))>500
  or coalesce(details->>'date','')!~'^\d{4}-\d{2}-\d{2}$'
  or coalesce(details->>'startTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
  or coalesce(details->>'endTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' then return jsonb_build_object('status','invalid'); end if;
 starts:=(details->>'startTime')::time; ends:=(details->>'endTime')::time; day:=(details->>'date')::date; zone:=details->>'timezone';
 if not exists(select 1 from pg_timezone_names where name=zone) then return jsonb_build_object('status','invalid'); end if;
 if not planner_private.routine_time_valid(day,starts,ends,zone) then return jsonb_build_object('status','invalid'); end if;
 completion_request:=jsonb_build_object('operation','complete','operationId',request_id,'taskId',task.id,'expectedVersion',p_request->>'expectedVersion','plan',p_request->'plan');
 if task.recurring_series_id is not null then completion_request:=completion_request||jsonb_build_object('occurrenceVersion',p_request->>'occurrenceVersion','seriesToken',p_request->'seriesToken'); end if;
 result:=planner_private.planner_occurrence_command(completion_request);
 if result->>'status' is distinct from 'complete' then return result; end if;
 if result->>'changeId' is null then raise exception 'Booking completion produced no history'; end if;
 insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone,location,is_protected,app_owned,booking_task_id,visit_status)
  values(owner_id,btrim(details->>'title'),day,day,starts,ends,zone,nullif(btrim(details->>'location'),''),true,true,task.id,'pending') returning * into visit;
 select version into token from public.planner_event_versions where event_id=visit.id and user_id=owner_id;
 update public.planner_changes set kind=case when kind='complete-occurrence' then 'complete-booking-occurrence' else 'complete-booking' end,
  after_state=after_state||jsonb_build_object('createdVisit',to_jsonb(visit),'visitToken',token,'events',coalesce(after_state->'events','[]'::jsonb)||jsonb_build_array(to_jsonb(visit)))
  where id=(result->>'changeId')::uuid and user_id=owner_id;
 outcome:=jsonb_build_object('status','complete','changeId',result->>'changeId','visitId',visit.id);
 update public.planner_command_receipts set request=p_request,outcome=booking.outcome where user_id=owner_id and operation_id=request_id;
 return outcome;
exception when invalid_text_representation or datetime_field_overflow or check_violation or not_null_violation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.planner_command(jsonb) from public,anon;
grant execute on function planner_private.planner_command(jsonb) to authenticated;
create or replace function public.planner_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.planner_command(p_request) $$;
