-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('69300000-0000-0000-0000-000000000001','execution-one@example.test');
select public.sql_fixture_create_auth_user('69300000-0000-0000-0000-000000000002','execution-two@example.test');
select set_config('request.jwt.claims','{"sub":"69300000-0000-0000-0000-000000000001","role":"authenticated","session_id":"69300000-0000-0000-0000-000000000009"}',true);
set local role authenticated;
do $$
declare task jsonb; request jsonb; result jsonb; settings jsonb; version uuid;
begin
 task:=public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Execution fixture","estimate_minutes":10}')->'task';
 request:=jsonb_build_object('operation','start','operationId',gen_random_uuid(),'taskId',task->>'id','expectedVersion',task->>'version','until',now()+interval '10 minutes');
 if public.assistant_execution_command(request)->>'status'<>'complete' then raise exception 'start failed';end if;
 if public.assistant_execution_command(request)->>'status'<>'already-applied' then raise exception 'retry duplicated start';end if;
 if public.assistant_execution_command(request||'{"operation":"later"}')->>'status'<>'conflict' then raise exception 'changed retry accepted';end if;
 if (select count(*) from public.assistant_execution_events)<>1 then raise exception 'duplicate event';end if;
 if exists(select 1 from public.calendar_events) or exists(select 1 from public.tasks where is_completed) then raise exception 'start mutated plan';end if;
 if public.assistant_execution_command(request||jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',gen_random_uuid()))->>'status'<>'conflict' then raise exception 'stale task accepted';end if;
 if public.assistant_execution_command(request||jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',null))->>'status'<>'conflict' then raise exception 'missing version accepted';end if;
 settings:='{"enabled":true,"timezone":"UTC","startMinute":0,"endMinute":1440,"locale":"en","expectedVersion":null,"token":"ExpoPushToken[fixture-one]"}';
 request:=request||jsonb_build_object('operation','later','operationId',gen_random_uuid(),'until',now()+interval '2 hours');
 if public.assistant_execution_command(request)->>'status'<>'complete' then raise exception 'later before opt-in failed';end if;
 if public.assistant_reminder_settings_command(settings)->>'status'<>'complete' then raise exception 'settings failed';end if;
 if not exists(select 1 from public.assistant_reminder_settings where snoozed_until>=now()+interval '2 hours') then raise exception 'enabling reminders lost earlier Later';end if;
 select s.version into version from public.assistant_reminder_settings s;
 if public.assistant_reminder_settings_command(settings)->>'status'<>'conflict' then raise exception 'stale settings accepted';end if;
 request:=request||jsonb_build_object('operation','later','operationId',gen_random_uuid(),'until',now()+interval '2 hours');
 if public.assistant_execution_command(request)->>'status'<>'complete' then raise exception 'later failed';end if;
 if not exists(select 1 from public.assistant_reminder_settings where snoozed_until>=now()+interval '2 hours') then raise exception 'later did not suppress reminders';end if;
 begin
  perform public.assistant_claim_reminder('69300000-0000-0000-0000-000000000001',version);
  raise exception 'user could claim sends';
 exception when insufficient_privilege then null;end;
 begin
  perform public.assistant_dispatch_snapshot('69300000-0000-0000-0000-000000000002',now(),now()+interval '1 hour');
  raise exception 'user could read another dispatch snapshot';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims','{"sub":"69300000-0000-0000-0000-000000000002","role":"authenticated","session_id":"69300000-0000-0000-0000-000000000009"}',true);
 if exists(select 1 from public.assistant_execution_events) or exists(select 1 from public.assistant_reminder_settings) then raise exception 'private history leaked';end if;
 if public.assistant_execution_command(request||jsonb_build_object('operationId',gen_random_uuid()))->>'status'<>'not-found' then raise exception 'foreign task accepted';end if;
 if public.assistant_reminder_settings_command(settings)->>'status'<>'conflict' then raise exception 'foreign token reassigned';end if;
end $$;
rollback;

