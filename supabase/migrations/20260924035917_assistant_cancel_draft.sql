-- Extend the existing atomic turn transaction; preserve memory and planning
-- behavior, owner checks, privileges and immutable request replay.
do $$ declare source text; anchor text; begin
 source:=pg_get_functiondef('planner_private.assistant_finish_turn(uuid,text,jsonb)'::regprocedure);
 anchor:=$a$('message','intent','planning','missing','ui','capture','memoryUpdates')$a$;
 if position(anchor in source)=0 then raise exception 'Assistant output contract anchor missing';end if;
 source:=replace(source,anchor,$a$('message','intent','planning','missing','ui','capture','memoryUpdates','cancelPlanning')$a$);
 anchor:=$a$proposal:=planner_private.ai_store_proposal(p_id,p_fingerprint,p_output->'capture');$a$;
 if position(anchor in source)=0 then raise exception 'Assistant proposal anchor missing';end if;
 source:=replace(source,anchor,$a$
 if p_output ? 'cancelPlanning' then
  if jsonb_typeof(p_output->'cancelPlanning') is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(p_output->'cancelPlanning') k where k not in ('sessionId','version'))
   or jsonb_typeof(p_output->'cancelPlanning'->'sessionId') is distinct from 'string'
   or jsonb_typeof(p_output->'cancelPlanning'->'version') is distinct from 'string'
   or p_output->>'intent'<>'conversation' or (plan is not null and plan<>'null'::jsonb)
   or jsonb_array_length(p_output->'ui'->'quickReplies')<>0 then
    raise exception using errcode='22023',message='Invalid draft cancellation';
  end if;
  update public.planning_sessions set status='cancelled',version=gen_random_uuid(),updated_at=now()
   where id=(p_output->'cancelPlanning'->>'sessionId')::uuid and user_id=owner_id and conversation_id=c.id
    and version=(p_output->'cancelPlanning'->>'version')::uuid and status in ('discovering','ready','drafted');
  if not found then raise exception using errcode='PT409',message='Draft changed';end if;
 end if;
 proposal:=planner_private.ai_store_proposal(p_id,p_fingerprint,p_output->'capture');$a$);
 anchor:=$a$insert into public.assistant_messages(conversation_id,user_id,role,content,request_id) values(c.id,owner_id,'assistant',p_output->>'message',p_id);$a$;
 if position(anchor in source)=0 then raise exception 'Assistant response anchor missing';end if;
 source:=replace(source,anchor,$a$if p_output ? 'cancelPlanning' then result_response:=result_response||jsonb_build_object('cancelledPlanningSessionId',p_output->'cancelPlanning'->>'sessionId');end if;
 insert into public.assistant_messages(conversation_id,user_id,role,content,request_id) values(c.id,owner_id,'assistant',p_output->>'message',p_id);$a$);
 execute source;
end $$;
