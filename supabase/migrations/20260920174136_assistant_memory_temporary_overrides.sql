-- Keep one durable baseline and one temporary exception per semantic key.
-- Existing rows, owner RLS, privileges, and proposal/apply/Undo functions are unchanged.
drop index public.assistant_active_memory_key;
create unique index assistant_active_memory_key on public.user_memories(user_id,key,temporality) where status='active';

create or replace function planner_private.assistant_finish_turn(p_id uuid,p_fingerprint text,p_output jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); t public.assistant_turns; c public.assistant_conversations; session_id uuid;
 m jsonb; replacement jsonb; old public.user_memories; plan jsonb; proposal jsonb; result_response jsonb; field text;
begin
 if owner_id is null then return jsonb_build_object('status','not-found');end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':assistant',0));
 select * into t from public.assistant_turns where user_id=owner_id and id=p_id for update;
 if not found then return jsonb_build_object('status','not-found');end if;
 if t.request_fingerprint is distinct from p_fingerprint then return jsonb_build_object('status','conflict');end if;
 if t.response is not null then return jsonb_build_object('status','complete','response',t.response);end if;
 select * into c from public.assistant_conversations where id=t.conversation_id and user_id=owner_id for update;
 if c.version<>t.conversation_version then return jsonb_build_object('status','conflict');end if;
 if jsonb_typeof(p_output) is distinct from 'object' or octet_length(p_output::text)>65536 then return jsonb_build_object('status','invalid');end if;
 if exists(select 1 from jsonb_object_keys(p_output) k where k not in ('message','intent','planning','missing','ui','capture','memoryUpdates'))
  or jsonb_typeof(p_output->'message') is distinct from 'string' or length(p_output->>'message') not between 1 and 8000
  or coalesce(p_output->>'intent','') not in ('conversation','capture','planning','next_action','clarification')
  or jsonb_typeof(p_output->'memoryUpdates') is distinct from 'array' or jsonb_typeof(p_output->'missing') is distinct from 'array'
  or jsonb_typeof(p_output->'ui'->'quickReplies') is distinct from 'array' then return jsonb_build_object('status','invalid');end if;
 if jsonb_array_length(p_output->'memoryUpdates')>10 or jsonb_array_length(p_output->'ui'->'quickReplies')>3 then return jsonb_build_object('status','invalid');end if;
 if p_output->'capture'->>'message' is distinct from p_output->>'message' or jsonb_typeof(p_output->'capture'->'items') is distinct from 'array' then return jsonb_build_object('status','invalid');end if;
 if p_output->>'intent'<>'capture' and jsonb_array_length(p_output->'capture'->'items')<>0 then return jsonb_build_object('status','invalid');end if;
 plan:=p_output->'planning';
 if plan is not null and plan<>'null'::jsonb then
  if p_output->>'intent'='capture' or jsonb_typeof(plan) is distinct from 'object' or coalesce(plan->>'status','') not in ('discovering','ready','drafted')
   or jsonb_typeof(plan->'facts') is distinct from 'object' or jsonb_typeof(plan->'readiness') is distinct from 'object' or jsonb_typeof(plan->'assumptions') is distinct from 'array'
   or exists(select 1 from jsonb_object_keys(plan) k where k not in ('status','horizon','readiness','facts','assumptions')) then return jsonb_build_object('status','invalid');end if;
  for field in select jsonb_object_keys(plan->'readiness') loop
   if field not in ('horizon','sleep','caregiving','fixedCommitments','workBoundaries','meals','exercise','deadlines','priorities') or coalesce(plan->'readiness'->>field,'') not in ('known','partial','missing','not_relevant') then return jsonb_build_object('status','invalid');end if;
  end loop;
  if plan->'horizon'<>'null'::jsonb and (coalesce(plan->'horizon'->>'startDate','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(plan->'horizon'->>'endDate','')!~'^\d{4}-\d{2}-\d{2}$'
   or not exists(select 1 from pg_timezone_names where name=plan->'horizon'->>'timezone')) then return jsonb_build_object('status','invalid');end if;
 end if;
 -- All writes below roll back together on validation, ownership or conflict failures.
 for m in select value from jsonb_array_elements(p_output->'memoryUpdates') loop
  if jsonb_typeof(m) is distinct from 'object' or coalesce(m->>'operation','') not in ('upsert','supersede') then raise exception using errcode='22023',message='Invalid memory';end if;
  if m->>'operation'='supersede' then
   if exists(select 1 from jsonb_object_keys(m) k where k not in ('operation','memoryId','replacement')) then raise exception using errcode='22023',message='Invalid memory';end if;
   select * into old from public.user_memories where id=(m->>'memoryId')::uuid and user_id=owner_id and status='active' for update;
   if not found or old.updated_at>t.created_at then raise exception using errcode='PT409',message='Memory changed';end if;
   replacement:=m->'replacement';
   -- A time-limited exception overlays a durable routine; it must not erase it.
   if replacement->>'temporality'='temporary' and old.temporality='durable' then
    if replacement->>'key' is distinct from old.key then raise exception using errcode='22023',message='Invalid memory';end if;
   else
    update public.user_memories set status='superseded',updated_at=now() where id=old.id;
   end if;
  else
   replacement:=m-'operation';
  end if;
  if replacement is not null and replacement<>'null'::jsonb then
   if jsonb_typeof(replacement) is distinct from 'object' or exists(select 1 from jsonb_object_keys(replacement) k where k not in ('kind','key','content','confidence','temporality','validFor'))
    or coalesce(replacement->>'kind','') not in ('fact','preference','routine','goal','current_state','inference')
    or jsonb_typeof(replacement->'key') is distinct from 'string' or length(replacement->>'key') not between 1 and 100
    or jsonb_typeof(replacement->'content') is distinct from 'string' or length(replacement->>'content') not between 1 and 1000
    or jsonb_typeof(replacement->'confidence') is distinct from 'number' or (replacement->>'confidence')::numeric not between 0 and 1
    or coalesce(replacement->>'temporality','') not in ('durable','temporary') then raise exception using errcode='22023',message='Invalid memory';end if;
   if replacement->>'kind'='current_state' and replacement->>'temporality'<>'temporary' then raise exception using errcode='22023',message='Invalid memory';end if;
   if replacement->'validFor' is not null and replacement->'validFor'<>'null'::jsonb then
    if replacement->>'temporality'<>'temporary' or jsonb_typeof(replacement->'validFor') is distinct from 'object'
     or exists(select 1 from jsonb_object_keys(replacement->'validFor') k where k not in ('amount','unit'))
     or coalesce(replacement->'validFor'->>'unit','') not in ('days','weeks','months')
     or jsonb_typeof(replacement->'validFor'->'amount') is distinct from 'number'
     or (replacement->'validFor'->>'amount')::numeric<>trunc((replacement->'validFor'->>'amount')::numeric)
     or (replacement->'validFor'->>'amount')::numeric not between 1 and
      (case replacement->'validFor'->>'unit' when 'months' then 12 when 'weeks' then 52 else 366 end)
     then raise exception using errcode='22023',message='Invalid memory';end if;
   end if;
   -- Corrections share one semantic key across durable/temporary layers.
   if exists(select 1 from public.user_memories where user_id=owner_id and key=replacement->>'key'
    and status='active' and updated_at>t.created_at) then raise exception using errcode='PT409',message='Memory changed';end if;
   select * into old from public.user_memories where user_id=owner_id and key=replacement->>'key'
    and temporality=replacement->>'temporality' and status='active' for update;
   if found then
    if old.updated_at>t.created_at then raise exception using errcode='PT409',message='Memory changed';end if;
    update public.user_memories set status='superseded',updated_at=now() where id=old.id;
   end if;
   insert into public.user_memories(user_id,kind,key,content,confidence,temporality,source_message_id,effective_until)
    values(owner_id,replacement->>'kind',replacement->>'key',replacement->>'content',(replacement->>'confidence')::numeric,replacement->>'temporality',t.source_message_id,
     case when replacement->>'temporality'='temporary' then now()+
      case replacement->'validFor'->>'unit'
       when 'months' then make_interval(months=>(replacement->'validFor'->>'amount')::int)
       when 'weeks' then make_interval(weeks=>(replacement->'validFor'->>'amount')::int)
       when 'days' then make_interval(days=>(replacement->'validFor'->>'amount')::int)
       else interval '7 days' end
     else null end);
  end if;
 end loop;
 if plan is not null and plan<>'null'::jsonb then
  insert into public.planning_sessions(user_id,conversation_id,status,start_date,end_date,timezone,facts,readiness,assumptions)
   values(owner_id,c.id,plan->>'status',(plan->'horizon'->>'startDate')::date,(plan->'horizon'->>'endDate')::date,plan->'horizon'->>'timezone',plan->'facts',plan->'readiness',plan->'assumptions')
   on conflict(conversation_id) do update set status=excluded.status,start_date=excluded.start_date,end_date=excluded.end_date,timezone=excluded.timezone,
    facts=excluded.facts,readiness=excluded.readiness,assumptions=excluded.assumptions,version=gen_random_uuid(),updated_at=now() returning id into session_id;
 end if;
 proposal:=planner_private.ai_store_proposal(p_id,p_fingerprint,p_output->'capture');
 if proposal->>'status' is distinct from 'complete' then raise exception using errcode='PT409',message='Proposal unavailable';end if;
 result_response:=jsonb_build_object('message',p_output->>'message','conversationId',c.id,'intent',p_output->>'intent','ui',p_output->'ui','proposal',proposal->'proposal');
 if session_id is not null then result_response:=result_response||jsonb_build_object('planning',jsonb_build_object('sessionId',session_id,'status',plan->>'status','missing',p_output->'missing','assumptions',plan->'assumptions'));end if;
 insert into public.assistant_messages(conversation_id,user_id,role,content,request_id) values(c.id,owner_id,'assistant',p_output->>'message',p_id);
 update public.assistant_turns set response=result_response where user_id=owner_id and id=p_id;
 update public.assistant_conversations set version=gen_random_uuid(),updated_at=now(),last_message_at=now() where id=c.id;
 return jsonb_build_object('status','complete','response',result_response);
exception
 when sqlstate 'PT409' or unique_violation then return jsonb_build_object('status','conflict');
 when invalid_text_representation or invalid_parameter_value or check_violation or datetime_field_overflow or foreign_key_violation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.assistant_finish_turn(uuid,text,jsonb) from public,anon;
grant execute on function planner_private.assistant_finish_turn(uuid,text,jsonb) to authenticated;
create or replace function public.assistant_finish_turn(p_id uuid,p_fingerprint text,p_output jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.assistant_finish_turn(p_id,p_fingerprint,p_output) $$;
revoke all on function public.assistant_finish_turn(uuid,text,jsonb) from public,anon;
grant execute on function public.assistant_finish_turn(uuid,text,jsonb) to authenticated;
