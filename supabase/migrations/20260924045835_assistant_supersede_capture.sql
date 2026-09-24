-- Retire the exact source preview and persist its replacement in one transaction.
-- The row update serializes with ai_proposal_command's FOR UPDATE acceptance.
do $$ declare source text; anchor text; begin
 source:=pg_get_functiondef('planner_private.assistant_finish_turn(uuid,text,jsonb)'::regprocedure);
 anchor:=$a$('message','intent','planning','missing','ui','capture','memoryUpdates','cancelPlanning')$a$;
 if position(anchor in source)=0 then raise exception 'Assistant output contract anchor missing';end if;
 source:=replace(source,anchor,$a$('message','intent','planning','missing','ui','capture','memoryUpdates','cancelPlanning','supersedeCapture')$a$);
 anchor:=$a$proposal:=planner_private.ai_store_proposal(p_id,p_fingerprint,p_output->'capture');$a$;
 if position(anchor in source)=0 then raise exception 'Assistant proposal anchor missing';end if;
 source:=replace(source,anchor,$a$
 if p_output ? 'supersedeCapture' then
  if jsonb_typeof(p_output->'supersedeCapture') is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(p_output->'supersedeCapture') k where k not in ('proposalId','version'))
   or jsonb_typeof(p_output->'supersedeCapture'->'proposalId') is distinct from 'string'
   or jsonb_typeof(p_output->'supersedeCapture'->'version') is distinct from 'string'
   or p_output->>'intent'<>'capture' or jsonb_array_length(p_output->'capture'->'items')=0
   or (p_output->'supersedeCapture'->>'proposalId')::uuid=p_id then
    raise exception using errcode='22023',message='Invalid preview replacement';
  end if;
  update public.planner_ai_proposals p set state='rejected',version=gen_random_uuid(),outcome=jsonb_build_object('status','complete','proposalId',p.id,'supersededBy',p_id)
   where p.id=(p_output->'supersedeCapture'->>'proposalId')::uuid and p.user_id=owner_id and p.proposal_type='capture'
    and p.version=(p_output->'supersedeCapture'->>'version')::uuid and p.state='pending'
    and exists(select 1 from public.assistant_turns prior where prior.id=p.id and prior.user_id=owner_id and prior.conversation_id=c.id and prior.response is not null);
  if not found then raise exception using errcode='PT409',message='Preview changed';end if;
 end if;
 proposal:=planner_private.ai_store_proposal(p_id,p_fingerprint,p_output->'capture');$a$);
 anchor:=$a$insert into public.assistant_messages(conversation_id,user_id,role,content,request_id) values(c.id,owner_id,'assistant',p_output->>'message',p_id);$a$;
 if position(anchor in source)=0 then raise exception 'Assistant response anchor missing';end if;
 source:=replace(source,anchor,$a$if p_output ? 'supersedeCapture' then result_response:=result_response||jsonb_build_object('supersededCaptureProposalId',p_output->'supersedeCapture'->>'proposalId');end if;
 insert into public.assistant_messages(conversation_id,user_id,role,content,request_id) values(c.id,owner_id,'assistant',p_output->>'message',p_id);$a$);
 execute source;
end $$;
