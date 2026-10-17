begin;
-- Admin setup is limited to registering a synthetic account and aging fixtures.
-- Every API assertion below runs with the ordinary authenticated/anon roles.
select public.sql_fixture_create_auth_user('70170000-0000-0000-0000-000000000001','monitor@example.test');
select public.sql_fixture_create_auth_user('70170000-0000-0000-0000-000000000002','ordinary@example.test');
insert into planner_private.assistant_monitor_accounts(user_id) values ('70170000-0000-0000-0000-000000000001');

do $$
declare
 monitor_id uuid := '70170000-0000-0000-0000-000000000001';
 ordinary_id uuid := '70170000-0000-0000-0000-000000000002';
 old_conversation uuid := gen_random_uuid(); fresh_conversation uuid := gen_random_uuid(); other_conversation uuid := gen_random_uuid();
 old_message uuid := gen_random_uuid(); old_request uuid := gen_random_uuid();
 sequence_value bigint; sequence_called boolean; quota record; result jsonb;
begin
 select last_value,is_called into sequence_value,sequence_called from public.assistant_messages_sequence_seq;
 insert into public.assistant_conversations(id,user_id,created_at) values
  (old_conversation,monitor_id,now()-interval '25 hours'),(fresh_conversation,monitor_id,now()),(other_conversation,ordinary_id,now()-interval '25 hours');
 insert into public.assistant_messages(id,conversation_id,user_id,role,content) values(old_message,old_conversation,monitor_id,'user','synthetic');
 insert into public.assistant_turns(id,user_id,conversation_id,source_message_id,request_fingerprint,conversation_version)
  values(old_request,monitor_id,old_conversation,old_message,repeat('a',64),gen_random_uuid());
 insert into public.user_memories(user_id,kind,key,content,confidence,temporality,source_message_id) values
  (monitor_id,'fact','synthetic','synthetic',1,'durable',old_message);
 insert into public.planning_sessions(user_id,conversation_id,status) values(monitor_id,old_conversation,'discovering');
 -- A proposal created late for an expired turn must also be removed.
 insert into public.planner_ai_proposals(id,user_id,request_fingerprint,body) values(old_request,monitor_id,'synthetic','{}');
 insert into public.planner_ai_proposals(id,user_id,request_fingerprint,body,created_at) values(gen_random_uuid(),monitor_id,'orphan','{}',now()-interval '25 hours');
 insert into public.planner_ai_proposals(id,user_id,request_fingerprint,body,created_at) values(gen_random_uuid(),ordinary_id,'other','{}',now()-interval '25 hours');

 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_id,'role','authenticated','user_metadata',jsonb_build_object('assistant_monitor',true))::text,true);
 set local role authenticated;
 begin perform public.cleanup_assistant_monitor(); raise exception 'ordinary cleanup allowed'; exception when insufficient_privilege then null; end;
 begin insert into planner_private.assistant_monitor_accounts(user_id) values(ordinary_id); raise exception 'self registration allowed'; exception when insufficient_privilege then null; end;
 begin perform public.check_ai_chat_rate_limit(monitor_id); raise exception 'foreign quota allowed'; exception when insufficient_privilege then null; end;
 select * into quota from public.check_ai_chat_rate_limit(ordinary_id);
 if not quota.allowed or quota.minute_remaining<>9 or quota.day_remaining<>99 then raise exception 'ordinary quota changed or metadata bypass'; end if;
 reset role;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',monitor_id,'role','authenticated')::text,true);
 set local role authenticated;
 select * into quota from public.check_ai_chat_rate_limit(monitor_id);
 if not quota.allowed or quota.minute_remaining<>1 or quota.day_remaining<>599 then raise exception 'monitor quota incorrect'; end if;
 select * into quota from public.check_ai_chat_rate_limit(monitor_id);
 if not quota.allowed or quota.minute_remaining<>0 or quota.day_remaining<>598 then raise exception 'retry allowance missing'; end if;
 select * into quota from public.check_ai_chat_rate_limit(monitor_id);
 if quota.allowed then raise exception 'minute cap not enforced'; end if;
 result:=public.cleanup_assistant_monitor();
 if result->>'monitor'<>'true' then raise exception 'monitor cleanup rejected'; end if;
 if exists(select 1 from public.assistant_conversations where id=old_conversation)
  or exists(select 1 from public.assistant_turns where id=old_request)
  or exists(select 1 from public.assistant_messages where id=old_message)
  or exists(select 1 from public.user_memories where source_message_id=old_message)
  or exists(select 1 from public.planning_sessions where conversation_id=old_conversation)
  or exists(select 1 from public.planner_ai_proposals) then raise exception 'dependent synthetic history leaked'; end if;
 if not exists(select 1 from public.assistant_conversations where id=fresh_conversation) then raise exception 'fresh history removed'; end if;
 if exists(select 1 from public.tasks) or exists(select 1 from public.calendar_events) then raise exception 'cleanup created real work'; end if;
 reset role;
 if (select request_count from public.ai_chat_usage_windows where user_id=monitor_id and window_kind='day')<>3 then raise exception 'cleanup reset quota or rejected request not counted'; end if;
 if not exists(select 1 from public.assistant_conversations where id=other_conversation)
  or not exists(select 1 from public.planner_ai_proposals where user_id=ordinary_id) then raise exception 'other user data removed'; end if;
 update public.ai_chat_usage_windows set request_count=599 where user_id=monitor_id and window_kind='day';
 update public.ai_chat_usage_windows set request_count=0 where user_id=monitor_id and window_kind='minute';
 set local role authenticated;
 select * into quota from public.check_ai_chat_rate_limit(monitor_id);
 if not quota.allowed or quota.day_remaining<>0 then raise exception '600th probe rejected'; end if;
 select * into quota from public.check_ai_chat_rate_limit(monitor_id);
 if quota.allowed then raise exception 'daily cap not enforced'; end if;
 reset role;
 perform set_config('request.jwt.claims','{}',true);
 set local role anon;
 begin perform public.cleanup_assistant_monitor(); raise exception 'anonymous cleanup allowed'; exception when insufficient_privilege then null; end;
 reset role;
 perform setval('public.assistant_messages_sequence_seq',sequence_value,sequence_called);
end $$;
rollback;
