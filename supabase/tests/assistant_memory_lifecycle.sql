-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('61500000-0000-0000-0000-000000000001','memory-one@example.test');
select public.sql_fixture_create_auth_user('61500000-0000-0000-0000-000000000002','memory-two@example.test');
select set_config('request.jwt.claims','{"sub":"61500000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare
 conversation_a uuid:=gen_random_uuid(); conversation_b uuid:=gen_random_uuid(); correction uuid:=gen_random_uuid();
 conversation_c uuid:=gen_random_uuid(); other_conversation uuid:=gen_random_uuid(); bad_turn uuid:=gen_random_uuid();
 gym_id uuid; family_id uuid; result jsonb; sequence_value bigint; sequence_called boolean;
 output jsonb:='{"message":"I will use your preferences when we plan.","intent":"conversation","planning":null,"missing":[],"ui":{"quickReplies":[]},"capture":{"message":"I will use your preferences when we plan.","items":[]},"memoryUpdates":[{"operation":"upsert","kind":"routine","key":"gym-frequency","content":"Gym is important; Monday–Saturday, rest Sunday.","confidence":1,"temporality":"durable"},{"operation":"upsert","kind":"preference","key":"family-boundary","content":"After pickup is family time.","confidence":1,"temporality":"durable"},{"operation":"upsert","kind":"preference","key":"decision-friction","content":"Long unordered lists increase procrastination; offer one clear next action.","confidence":1,"temporality":"durable"}]}';
begin
 select last_value,is_called into sequence_value,sequence_called from public.assistant_messages_sequence_seq;
 set local role authenticated;
 perform public.assistant_begin_turn(conversation_a,conversation_a,true,repeat('a',64),'[{"role":"user","content":"Gym matters; I go Monday–Saturday. After pickup is family time. Long unordered lists increase procrastination."}]');
 result:=public.assistant_finish_turn(conversation_a,repeat('a',64),output);
 if result->>'status'<>'complete' then raise exception 'conversation A failed';end if;
 select id into gym_id from public.user_memories where key='gym-frequency';
 select id into family_id from public.user_memories where key='family-boundary';
 perform public.assistant_begin_turn(conversation_b,conversation_b,true,repeat('b',64),'[{"role":"user","content":"Help me plan next week."}]');
 if (select count(*) from public.user_memories where status='active' and temporality='durable')<>3 then raise exception 'new conversation lost durable preferences';end if;
 output:=jsonb_set(output,'{memoryUpdates}','[]');
 output:=jsonb_set(output,'{intent}','"planning"');
 output:=jsonb_set(output,'{planning}','{"status":"discovering","horizon":null,"facts":{},"readiness":{"horizon":"missing"},"assumptions":[]}');
 if public.assistant_finish_turn(conversation_b,repeat('b',64),output)->>'status'<>'complete' then raise exception 'conversation B failed';end if;

 perform public.assistant_begin_turn(correction,conversation_b,false,repeat('c',64),'[{"role":"user","content":"For the next month I only want to go to the gym four days a week."}]');
 output:=jsonb_set(output,'{memoryUpdates}',jsonb_build_array(jsonb_build_object('operation','supersede','memoryId',gym_id,'replacement',jsonb_build_object('kind','routine','key','gym-frequency','content','Gym four days a week for the next month.','confidence',1,'temporality','temporary','validFor',jsonb_build_object('amount',1,'unit','months')))));
 result:=public.assistant_finish_turn(correction,repeat('c',64),output);
 if result->>'status'<>'complete' then raise exception 'temporary correction failed';end if;
 if public.assistant_finish_turn(correction,repeat('c',64),output)<>result then raise exception 'correction replay changed';end if;
 if not exists(select 1 from public.user_memories where id=gym_id and status='active' and temporality='durable' and content='Gym is important; Monday–Saturday, rest Sunday.' and effective_until is null) then raise exception 'temporary exception corrupted durable routine';end if;
 if (select count(*) from public.user_memories where key='gym-frequency' and temporality='temporary' and status='active' and effective_until=effective_from+interval '1 month')<>1 then raise exception 'temporary period or idempotency incorrect';end if;
 perform public.assistant_begin_turn(conversation_c,conversation_c,true,repeat('d',64),'[{"role":"user","content":"Help me plan next week."}]');
 if (select count(*) from public.user_memories where key='gym-frequency' and status='active')<>2 then raise exception 'later conversation lost baseline or override';end if;
 output:=jsonb_set(output,'{memoryUpdates}','[]');
 if public.assistant_finish_turn(conversation_c,repeat('d',64),output)->>'status'<>'complete' then raise exception 'conversation C failed';end if;

 -- A later invalid update must roll back an earlier durable correction too.
 perform public.assistant_begin_turn(bad_turn,conversation_c,false,repeat('e',64),'[{"role":"user","content":"Change my preferences."}]');
 output:=jsonb_set(output,'{memoryUpdates}','[{"operation":"upsert","kind":"preference","key":"family-boundary","content":"Must roll back","confidence":1,"temporality":"durable"},{"operation":"upsert","kind":"current_state","key":"current-energy","content":"Tired today","confidence":1,"temporality":"durable"}]');
 if public.assistant_finish_turn(bad_turn,repeat('e',64),output)->>'status'<>'invalid' then raise exception 'durable current-state accepted';end if;
 if not exists(select 1 from public.user_memories where id=family_id and status='active' and content='After pickup is family time.') then raise exception 'failed turn corrupted durable memory';end if;
 if exists(select 1 from public.planner_ai_proposals where id=bad_turn) then raise exception 'invalid memory stored proposal';end if;
 output:=jsonb_set(output,'{memoryUpdates}','[{"operation":"upsert","kind":"routine","key":"gym-frequency","content":"Invalid duration","confidence":1,"temporality":"temporary","validFor":{"amount":13,"unit":"months"}}]');
 if public.assistant_finish_turn(bad_turn,repeat('e',64),output)->>'status'<>'invalid' then raise exception 'unbounded duration accepted';end if;
 if exists(select 1 from public.tasks) or exists(select 1 from public.calendar_events) then raise exception 'planning changed tasks/calendar before accept';end if;

 reset role;
 perform set_config('request.jwt.claims','{"sub":"61500000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 set local role authenticated;
 if exists(select 1 from public.assistant_conversations) or exists(select 1 from public.assistant_messages) or exists(select 1 from public.user_memories) or exists(select 1 from public.planning_sessions) then raise exception 'user two can read user one';end if;
 if public.assistant_begin_turn(gen_random_uuid(),conversation_a,false,repeat('f',64),'[{"role":"user","content":"Intrusion"}]')->>'status'<>'not-found' then raise exception 'foreign conversation accepted';end if;
 perform public.assistant_begin_turn(other_conversation,other_conversation,true,repeat('f',64),'[{"role":"user","content":"My private plan"}]');
 output:=jsonb_set(output,'{memoryUpdates}',jsonb_build_array(jsonb_build_object('operation','supersede','memoryId',gym_id,'replacement',null)));
 if public.assistant_finish_turn(other_conversation,repeat('f',64),output)->>'status'<>'conflict' then raise exception 'foreign memory correction accepted';end if;
 output:=jsonb_set(output,'{memoryUpdates}','[{"operation":"upsert","kind":"preference","key":"private","content":"User two only","confidence":1,"temporality":"durable"}]');
 if public.assistant_finish_turn(other_conversation,repeat('f',64),output)->>'status'<>'complete' then raise exception 'user two own plan failed';end if;
 reset role;
 perform set_config('request.jwt.claims','{"sub":"61500000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 set local role authenticated;
 if exists(select 1 from public.assistant_conversations where id=other_conversation) or exists(select 1 from public.assistant_messages where conversation_id=other_conversation) or exists(select 1 from public.user_memories where key='private') or exists(select 1 from public.planning_sessions where conversation_id=other_conversation) then raise exception 'user one can read user two';end if;
 reset role;
 perform setval('public.assistant_messages_sequence_seq',sequence_value,sequence_called);
end $$;
rollback;
