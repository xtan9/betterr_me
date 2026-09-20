-- Additive persistence. No changes to proposal acceptance, planner revisions or Undo.
create table public.assistant_conversations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 title text, version uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_message_at timestamptz not null default now(),
 unique(id,user_id)
);
create table public.assistant_messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null, user_id uuid not null, request_id uuid,
 sequence bigint generated always as identity unique, role text not null check(role in ('user','assistant')),
 content text not null check(length(content) between 1 and 8000), created_at timestamptz not null default now(),
 foreign key(conversation_id,user_id) references public.assistant_conversations(id,user_id) on delete cascade,
 unique(id,user_id)
);
create table public.user_memories (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('fact','preference','routine','goal','current_state','inference')),
 key text not null check(length(key) between 1 and 100), content text not null check(length(content) between 1 and 1000), value jsonb,
 confidence numeric not null check(confidence between 0 and 1), status text not null default 'active' check(status in ('active','superseded','deleted')),
 temporality text not null check(temporality in ('durable','temporary')), source_message_id uuid,
 effective_from timestamptz not null default now(), effective_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(source_message_id,user_id) references public.assistant_messages(id,user_id)
);
create unique index assistant_active_memory_key on public.user_memories(user_id,key) where status='active';
create index assistant_memory_context on public.user_memories(user_id,status,updated_at desc);
create table public.planning_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, conversation_id uuid not null unique,
 status text not null check(status in ('discovering','ready','drafted','applied','cancelled')),
 start_date date, end_date date, timezone text,
 facts jsonb not null default '{}', readiness jsonb not null default '{}', assumptions jsonb not null default '[]',
 version uuid not null default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(conversation_id,user_id) references public.assistant_conversations(id,user_id) on delete cascade,
 check((start_date is null and end_date is null) or (start_date is not null and end_date is not null and end_date>=start_date and end_date-start_date<=90))
);
create table public.assistant_turns (
 id uuid not null, user_id uuid not null, conversation_id uuid not null, source_message_id uuid not null,
 request_fingerprint text not null, conversation_version uuid not null, response jsonb,
 created_at timestamptz not null default now(), primary key(user_id,id),
 foreign key(conversation_id,user_id) references public.assistant_conversations(id,user_id) on delete cascade,
 foreign key(source_message_id,user_id) references public.assistant_messages(id,user_id) on delete cascade
);
create index assistant_conversation_recent on public.assistant_conversations(user_id,last_message_at desc);
create index assistant_message_history on public.assistant_messages(user_id,conversation_id,sequence desc);
create index assistant_turn_history on public.assistant_turns(user_id,conversation_id,created_at desc);
-- Direct writes are deliberately unavailable. Owner-scoped RPCs assign identity and timestamps.
do $$ declare t text; begin
 foreach t in array array['assistant_conversations','assistant_messages','user_memories','planning_sessions','assistant_turns'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy assistant_owner on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 end loop;
end $$;

create function planner_private.assistant_begin_turn(p_id uuid,p_conversation_id uuid,p_new boolean,p_fingerprint text,p_messages jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); c public.assistant_conversations; t public.assistant_turns; m jsonb; source_id uuid; v uuid; history jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found');end if;
 if p_id is null or p_conversation_id is null or p_new is null or length(coalesce(p_fingerprint,''))<>64 or jsonb_typeof(p_messages) is distinct from 'array' then return jsonb_build_object('status','invalid');end if;
 if jsonb_array_length(p_messages) not between 1 and 40 or octet_length(p_messages::text)>65536 or p_messages->-1->>'role' is distinct from 'user' then return jsonb_build_object('status','invalid');end if;
 for m in select value from jsonb_array_elements(p_messages) loop
  if jsonb_typeof(m) is distinct from 'object' or coalesce(m->>'role','') not in ('user','assistant') or jsonb_typeof(m->'content') is distinct from 'string' or length(m->>'content') not between 1 and 8000
   or exists(select 1 from jsonb_object_keys(m) k where k not in ('role','content')) then return jsonb_build_object('status','invalid');end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':assistant',0));
 select * into t from public.assistant_turns where user_id=owner_id and id=p_id;
 if found then
  if t.request_fingerprint<>p_fingerprint or t.conversation_id<>p_conversation_id then return jsonb_build_object('status','conflict');end if;
  if t.response is not null then return jsonb_build_object('status','complete','response',t.response);end if;
  select * into c from public.assistant_conversations where id=t.conversation_id and user_id=owner_id;
  if c.version<>t.conversation_version then return jsonb_build_object('status','conflict');end if;
 else
  select * into c from public.assistant_conversations where id=p_conversation_id and user_id=owner_id for update;
  if not found then
   if not p_new or exists(select 1 from public.assistant_conversations where id=p_conversation_id) then return jsonb_build_object('status','not-found');end if;
   insert into public.assistant_conversations(id,user_id) values(p_conversation_id,owner_id) returning * into c;
   -- Import legacy history once; subsequent turns trust only persisted history plus the latest user message.
   for m in select value from jsonb_array_elements(p_messages) loop
    insert into public.assistant_messages(conversation_id,user_id,role,content) values(c.id,owner_id,m->>'role',m->>'content') returning id into source_id;
   end loop;
  else
   if p_new then return jsonb_build_object('status','conflict');end if;
   insert into public.assistant_messages(conversation_id,user_id,role,content) values(c.id,owner_id,'user',p_messages->-1->>'content') returning id into source_id;
  end if;
  update public.assistant_messages set request_id=p_id where id=source_id and user_id=owner_id;
  v:=gen_random_uuid();
  update public.assistant_conversations set version=v,updated_at=now(),last_message_at=now() where id=c.id;
  insert into public.assistant_turns(id,user_id,conversation_id,source_message_id,request_fingerprint,conversation_version)
   values(p_id,owner_id,c.id,source_id,p_fingerprint,v) returning * into t;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('role',h.role,'content',h.content) order by h.sequence),'[]') into history
  from (select role,content,sequence from public.assistant_messages where conversation_id=t.conversation_id and user_id=owner_id order by sequence desc limit 40) h;
 return jsonb_build_object('status','prepared','conversationId',t.conversation_id,'messages',history);
end $$;
revoke all on function planner_private.assistant_begin_turn(uuid,uuid,boolean,text,jsonb) from public,anon;
grant execute on function planner_private.assistant_begin_turn(uuid,uuid,boolean,text,jsonb) to authenticated;
create function public.assistant_begin_turn(p_id uuid,p_conversation_id uuid,p_new boolean,p_fingerprint text,p_messages jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.assistant_begin_turn(p_id,p_conversation_id,p_new,p_fingerprint,p_messages) $$;
revoke all on function public.assistant_begin_turn(uuid,uuid,boolean,text,jsonb) from public,anon;
grant execute on function public.assistant_begin_turn(uuid,uuid,boolean,text,jsonb) to authenticated;

create function planner_private.assistant_finish_turn(p_id uuid,p_fingerprint text,p_output jsonb) returns jsonb
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
   update public.user_memories set status='superseded',updated_at=now() where id=old.id;
  else
   replacement:=m-'operation';
  end if;
  if replacement is not null and replacement<>'null'::jsonb then
   if jsonb_typeof(replacement) is distinct from 'object' or exists(select 1 from jsonb_object_keys(replacement) k where k not in ('kind','key','content','confidence','temporality'))
    or coalesce(replacement->>'kind','') not in ('fact','preference','routine','goal','current_state','inference')
    or jsonb_typeof(replacement->'key') is distinct from 'string' or length(replacement->>'key') not between 1 and 100
    or jsonb_typeof(replacement->'content') is distinct from 'string' or length(replacement->>'content') not between 1 and 1000
    or jsonb_typeof(replacement->'confidence') is distinct from 'number' or (replacement->>'confidence')::numeric not between 0 and 1
    or coalesce(replacement->>'temporality','') not in ('durable','temporary') then raise exception using errcode='22023',message='Invalid memory';end if;
   select * into old from public.user_memories where user_id=owner_id and key=replacement->>'key' and status='active' for update;
   if found then
    if old.updated_at>t.created_at then raise exception using errcode='PT409',message='Memory changed';end if;
    update public.user_memories set status='superseded',updated_at=now() where id=old.id;
   end if;
   insert into public.user_memories(user_id,kind,key,content,confidence,temporality,source_message_id,effective_until)
    values(owner_id,replacement->>'kind',replacement->>'key',replacement->>'content',(replacement->>'confidence')::numeric,replacement->>'temporality',t.source_message_id,
     case when replacement->>'temporality'='temporary' then now()+interval '7 days' else null end);
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
create function public.assistant_finish_turn(p_id uuid,p_fingerprint text,p_output jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.assistant_finish_turn(p_id,p_fingerprint,p_output) $$;
revoke all on function public.assistant_finish_turn(uuid,text,jsonb) from public,anon;
grant execute on function public.assistant_finish_turn(uuid,text,jsonb) to authenticated;
