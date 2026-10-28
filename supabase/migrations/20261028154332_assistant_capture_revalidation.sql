-- Opt-in native acceptance validates the same immutable proposal without an
-- extra model turn. Existing clients retain their strict expiry behavior.
create function planner_private.capture_has_newly_past_start(p_body jsonb,p_created_at timestamptz)
returns boolean language sql stable set search_path=pg_catalog as $$
 select exists(select 1 from (
  select case when item ? 'schedule' then
   ((item->'schedule'->>'startDate')::date+(item->'schedule'->>'startTime')::time) at time zone (item->'schedule'->>'timezone')
   when item->>'kind'='routine-create' then
   ((item->'changes'->>'date')::date+(item->'changes'->>'startTime')::time) at time zone (item->'changes'->>'timezone')
  end as starts_at
  from jsonb_array_elements(p_body->'items') item
 ) starts where starts_at>=p_created_at and starts_at<statement_timestamp())
$$;
revoke all on function planner_private.capture_has_newly_past_start(jsonb,timestamptz) from public,anon,authenticated;

do $$ declare source text; anchor text; begin
 source:=pg_get_functiondef('planner_private.ai_proposal_command(jsonb)'::regprocedure);
 anchor:=$a$('operation','operationId','proposalId','expectedVersion','supportsTimedTasks')$a$;
 if position(anchor in source)=0 then raise exception 'Capture command contract missing';end if;
 source:=replace(source,anchor,$a$('operation','operationId','proposalId','expectedVersion','supportsTimedTasks','revalidate')$a$);
 anchor:=$a$perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));$a$;
 if position(anchor in source)=0 then raise exception 'Capture command identity lock missing';end if;
 source:=replace(source,anchor,$a$
 if p_request ? 'revalidate' and (p_request->'revalidate' is distinct from 'true'::jsonb or p_request->>'operation'<>'accept') then return jsonb_build_object('status','invalid');end if;
 $a$||anchor);
 anchor:=$a$proposal.expires_at<=statement_timestamp() or jsonb_array_length(proposal.body->'items')=0$a$;
 if position(anchor in source)=0 then raise exception 'Capture expiry guard missing';end if;
 source:=replace(source,anchor,$a$(proposal.expires_at<=statement_timestamp() and p_request->'revalidate' is distinct from 'true'::jsonb) or jsonb_array_length(proposal.body->'items')=0$a$);
 anchor:=$a$-- Lock existing parents before children; verify the entire preview before writes.$a$;
 if position(anchor in source)=0 then raise exception 'Capture preflight missing';end if;
 source:=replace(source,anchor,$a$
 if p_request->'revalidate'='true'::jsonb and planner_private.capture_has_newly_past_start(proposal.body,least(proposal.created_at,(select t.created_at from public.assistant_turns t where t.id=proposal.id and t.user_id=owner_id))) then return jsonb_build_object('status','past-time');end if;
 $a$||anchor);
 anchor:=$a$if proposal.body ? 'contextVersion' and token is distinct from (proposal.body->>'contextVersion')::uuid then return jsonb_build_object('status','conflict');end if;$a$;
 if position(anchor in source)=0 then raise exception 'Capture context check missing';end if;
 source:=replace(source,anchor,$a$
 if proposal.body ? 'contextVersion' and (token is null or (token is distinct from (proposal.body->>'contextVersion')::uuid and p_request->'revalidate' is distinct from 'true'::jsonb)) then return jsonb_build_object('status','conflict');end if;
 -- The current planner revision remains locked. Revalidate the exact slots,
 -- including recurrence coverage, instead of accepting a model replacement.
 if p_request->'revalidate'='true'::jsonb then
  for item in select value from jsonb_array_elements(proposal.body->'items') where value ? 'schedule' loop
   if not planner_private.timed_task_slot_available(item->'schedule') then return jsonb_build_object('status','conflict');end if;
  end loop;
 end if;
 $a$);
 execute source;
end $$;
-- Native editing is a deterministic new turn. Source retirement, replacement,
-- and its history are committed together, with no task/calendar writes.
create function planner_private.ai_revise_capture(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); request_id uuid; conversation_key uuid; source_id uuid;
 fingerprint text; source public.planner_ai_proposals; prior public.assistant_turns;
 item jsonb; body jsonb; changes jsonb; stored jsonb; begun jsonb; finished jsonb; token uuid;
 message text; user_message text;
begin
 if owner_id is null then return jsonb_build_object('status','not-found');end if;
 if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>8192
  or exists(select 1 from jsonb_object_keys(p_request) k where k not in('requestId','conversationId','proposalId','expectedVersion','locale','changes','schedule'))
  or exists(select 1 from unnest(array['requestId','conversationId','proposalId','expectedVersion','locale']) k where jsonb_typeof(p_request->k) is distinct from 'string')
  or p_request->>'locale' not in('en','zh') or jsonb_typeof(p_request->'changes') is distinct from 'object' then return jsonb_build_object('status','invalid');end if;
 request_id:=(p_request->>'requestId')::uuid;conversation_key:=(p_request->>'conversationId')::uuid;source_id:=(p_request->>'proposalId')::uuid;
 if request_id=source_id or (p_request->>'expectedVersion')::uuid is null then return jsonb_build_object('status','invalid');end if;
 changes:=p_request->'changes';
 if exists(select 1 from jsonb_object_keys(changes) k where k not in('title','estimate_minutes','due_date'))
  or jsonb_typeof(changes->'title') is distinct from 'string' or length(btrim(changes->>'title')) not between 1 and 100
  or (p_request ? 'schedule' and p_request->'schedule'<>'null'::jsonb and jsonb_typeof(p_request->'schedule') is distinct from 'object') then return jsonb_build_object('status','invalid');end if;
 fingerprint:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':assistant',0));
 select * into prior from public.assistant_turns where user_id=owner_id and id=request_id;
 if found then
  if prior.request_fingerprint is distinct from fingerprint or prior.conversation_id<>conversation_key then return jsonb_build_object('status','conflict');end if;
  if prior.response is not null then return jsonb_build_object('status','complete','response',prior.response);end if;
 end if;
 -- Match timed acceptance's planner -> proposal lock order. Unrelated changes
 -- may be revalidated, but the exact source version may never be replaced.
 select version into token from public.planner_state_versions where user_id=owner_id for update;
 select * into source from public.planner_ai_proposals where id=source_id and user_id=owner_id for update;
 if not found then return jsonb_build_object('status','not-found');end if;
 if source.state<>'pending' or source.version is distinct from (p_request->>'expectedVersion')::uuid then return jsonb_build_object('status','conflict');end if;
 if source.proposal_type<>'capture' or jsonb_array_length(source.body->'items')<>1 or source.body->'items'->0->>'kind'<>'task-create' then return jsonb_build_object('status','unsupported');end if;
 if not exists(select 1 from public.assistant_turns t where t.id=source.id and t.user_id=owner_id and t.conversation_id=conversation_key and t.response is not null) then return jsonb_build_object('status','not-found');end if;
 item:=jsonb_set(source.body->'items'->0,'{changes}',(source.body->'items'->0->'changes')||changes);
 if p_request ? 'schedule' then
  if p_request->'schedule'='null'::jsonb then item:=item-'schedule';
  else item:=jsonb_set(item,'{schedule}',p_request->'schedule');end if;
 end if;
 message:=case when p_request->>'locale'='zh' then '请确认更新后的任务。' else 'Review the updated task.' end;
 user_message:=case when p_request->>'locale'='zh' then '修改任务详情。' else 'Edit the task details.' end;
 body:=jsonb_build_object('message',message,'items',jsonb_build_array(item));
 if item ? 'schedule' then
  if not planner_private.timed_task_schedule_valid(item->'schedule',item->'changes') then return jsonb_build_object('status','invalid');end if;
  body:=body||jsonb_build_object('contextVersion',token);
 end if;
 if planner_private.capture_has_newly_past_start(body,least(source.created_at,(select t.created_at from public.assistant_turns t where t.id=source.id and t.user_id=owner_id))) then return jsonb_build_object('status','past-time');end if;
 -- Reuse the complete capture validator before a turn is written. Any later
 -- failure raises and rolls this provisional proposal back with the turn.
 stored:=planner_private.ai_store_proposal(request_id,fingerprint,body);
 if stored->>'status'='invalid' then raise exception using errcode='22023',message='Invalid task revision';end if;
 if stored->>'status' is distinct from 'complete' then raise exception using errcode='PT409',message='Task revision changed';end if;
 begun:=planner_private.assistant_begin_turn(request_id,conversation_key,false,fingerprint,jsonb_build_array(jsonb_build_object('role','user','content',user_message)));
 if begun->>'status' is distinct from 'prepared' then raise exception using errcode='PT409',message='Conversation changed';end if;
 finished:=planner_private.assistant_finish_turn(request_id,fingerprint,jsonb_build_object(
  'message',message,'intent','capture','planning',null,'missing','[]'::jsonb,'ui','{"quickReplies":[]}'::jsonb,'memoryUpdates','[]'::jsonb,
  'capture',body,'supersedeCapture',jsonb_build_object('proposalId',source.id,'version',source.version)));
 if finished->>'status' is distinct from 'complete' then raise exception using errcode='PT409',message='Revision could not be recorded';end if;
 return finished;
exception when sqlstate 'PT409' or integrity_constraint_violation or serialization_failure or deadlock_detected then return jsonb_build_object('status','conflict');
 when invalid_text_representation or invalid_parameter_value or datetime_field_overflow or invalid_datetime_format then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.ai_revise_capture(jsonb) from public,anon;
grant execute on function planner_private.ai_revise_capture(jsonb) to authenticated;
create function public.planner_ai_revise_capture(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$select planner_private.ai_revise_capture(p_request)$$;
revoke all on function public.planner_ai_revise_capture(jsonb) from public,anon;
grant execute on function public.planner_ai_revise_capture(jsonb) to authenticated;
notify pgrst,'reload schema';
