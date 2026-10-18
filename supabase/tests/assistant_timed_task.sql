-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('61800000-0000-0000-0000-000000000001','timed-task-owner@example.test');
select public.sql_fixture_create_auth_user('61800000-0000-0000-0000-000000000002','timed-task-other@example.test');
select set_config('request.jwt.claims','{"sub":"61800000-0000-0000-0000-000000000001","role":"authenticated"}',true);

create function pg_temp.timed_task_body(title text, schedule_changes jsonb default '{}', task_changes jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('message',title,'contextVersion',public.planner_schedule_context('2026-10-18')->>'version',
  'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','task-create','changes',jsonb_build_object('title',title)||task_changes,
  'schedule','{"startDate":"2026-10-18","startTime":"22:00","endDate":"2026-10-18","endTime":"22:30","timezone":"America/Los_Angeles","durationSource":"default"}'::jsonb||schedule_changes)));
$$;
create function pg_temp.fail_timed_reservation() returns trigger language plpgsql as $$
begin if new.title='Fail reservation' then raise exception using errcode='23514',message='simulated calendar storage failure';end if;return new;end $$;
create trigger timed_fixture_failure before insert on public.calendar_events for each row execute function pg_temp.fail_timed_reservation();
create function pg_temp.expire_timed_proposal() returns trigger language plpgsql as $$
begin if new.body->>'message'='Expired preview' then new.expires_at:=statement_timestamp()-interval '1 minute';end if;return new;end $$;
create trigger timed_fixture_expiry before insert on public.planner_ai_proposals for each row execute function pg_temp.expire_timed_proposal();

do $$
declare body jsonb; stored jsonb; proposal jsonb; accepted jsonb; command jsonb; snapshot jsonb; task jsonb; event jsonb;
begin
 set local role authenticated;
 body:=jsonb_build_object('message','Check doors and windows at 21:00. Default duration: 30 minutes.',
  'contextVersion',public.planner_schedule_context('2026-10-18')->>'version',
  'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','task-create','changes',jsonb_build_object('title','Check doors and windows'),
   'schedule',jsonb_build_object('startDate','2026-10-18','startTime','21:00','endDate','2026-10-18','endTime','21:30','timezone','America/Los_Angeles','durationSource','default'))));
 stored:=public.planner_ai_store_proposal(gen_random_uuid(),'timed-task',body);
 if stored->>'status'<>'complete' then raise exception 'Timed task preview rejected: %',stored;end if;
 proposal:=stored->'proposal';
 snapshot:=public.planner_schedule_context('2026-10-18');
 if jsonb_array_length(snapshot->'tasks')<>0 or jsonb_array_length(snapshot->'events')<>0 then raise exception 'Preview wrote records';end if;
 if public.planner_ai_store_proposal((proposal->>'id')::uuid,'timed-task',body)<>stored then raise exception 'Preview retry changed';end if;
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version');
 if public.planner_ai_proposal_command(command)->>'status'<>'invalid' then raise exception 'Legacy client accepted a hidden reservation';end if;
 if jsonb_array_length(public.planner_schedule_context('2026-10-18')->'tasks')<>0 then raise exception 'Legacy accept created task';end if;
 command:=command||'{"supportsTimedTasks":true}';
 accepted:=public.planner_ai_proposal_command(command);
 if accepted->>'status'<>'complete' then raise exception 'Timed task acceptance failed: %',accepted;end if;
 snapshot:=public.planner_schedule_context('2026-10-18');
 if jsonb_array_length(snapshot->'tasks')<>1 or jsonb_array_length(snapshot->'events')<>1 then raise exception 'Missing task or work block: %',snapshot;end if;
 task:=snapshot->'tasks'->0;event:=snapshot->'events'->0;
 if task->>'title'<>'Check doors and windows' or task->>'estimate_minutes' is not null or task->>'due_date' is not null
  or task->>'planned_date' is not null or task->>'planned_period' is not null then raise exception 'Reservation changed task meaning: %',task;end if;
 if event->>'task_id'<>task->>'id' or event->>'start_date'<>'2026-10-18' or event->>'start_time'<>'21:00:00'
  or event->>'end_date'<>'2026-10-18' or event->>'end_time'<>'21:30:00' or event->>'timezone'<>'America/Los_Angeles'
  or event->>'is_protected'<>'true' then raise exception 'Incorrect linked reservation: %',event;end if;
 if public.planner_ai_proposal_command(command)->>'status'<>'already-applied'
  or jsonb_array_length(public.planner_schedule_context('2026-10-18')->'events')<>1 then raise exception 'Acceptance retry duplicated work';end if;
 body:=jsonb_set(body,'{contextVersion}',public.planner_schedule_context('2026-10-18')->'version');
 if public.planner_ai_store_proposal(gen_random_uuid(),'protected-overlap',body)->>'status'<>'conflict' then raise exception 'Protected event overlap was accepted';end if;
 body:=jsonb_set(body,'{items,0,schedule,startTime}','"22:00"');
 body:=jsonb_set(body,'{items,0,schedule,endTime}','"22:30"');
 body:=jsonb_set(body,'{items}',body->'items'||jsonb_build_array(jsonb_set(body->'items'->0,'{id}',to_jsonb(gen_random_uuid()))));
 if public.planner_ai_store_proposal(gen_random_uuid(),'proposal-overlap',body)->>'status'<>'conflict' then raise exception 'Overlapping proposed reservations were accepted';end if;
 reset role;
end $$;

do $$
declare body jsonb; proposal jsonb; command jsonb; result jsonb; before_snapshot jsonb; schedule jsonb;
begin
 set local role authenticated;
 before_snapshot:=public.planner_schedule_context('2026-10-18');
 body:=pg_temp.timed_task_body('Fail reservation');
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'atomic-calendar-failure',body)->'proposal';
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTimedTasks',true);
 result:=public.planner_ai_proposal_command(command);
 if result->>'status'<>'conflict' or public.planner_schedule_context('2026-10-18')<>before_snapshot then raise exception 'Failed reservation left a task or changed plan version: %',result;end if;
 if not exists(select 1 from public.planner_ai_proposals where id=(proposal->>'id')::uuid and state='pending')
  or exists(select 1 from public.planner_command_receipts where operation_id=(command->>'operationId')::uuid) then raise exception 'Failed acceptance cannot retry';end if;
 if public.planner_ai_proposal_command(command)->>'status'<>'conflict' then raise exception 'Failed acceptance left a receipt';end if;
 if public.planner_ai_store_proposal((proposal->>'id')::uuid,'different-fingerprint',body)->>'status'<>'conflict' then raise exception 'Changed fingerprint reused preview';end if;
 -- Ownership is checked at the command and owner-scoped read boundaries.
 perform set_config('request.jwt.claims','{"sub":"61800000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 if public.planner_ai_proposal_command(command)->>'status'<>'not-found'
  or exists(select 1 from public.planner_ai_proposals where id=(proposal->>'id')::uuid)
  or jsonb_array_length(public.planner_schedule_context('2026-10-18')->'events')<>0 then raise exception 'Other owner accessed timed task';end if;
 perform set_config('request.jwt.claims','{"sub":"61800000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 -- Rejection remains possible from an old client and never writes task/event data.
 command:=jsonb_set(command-'supportsTimedTasks','{operation}','"reject"');
 if public.planner_ai_proposal_command(command)->>'status'<>'complete' or public.planner_schedule_context('2026-10-18')<>before_snapshot then raise exception 'Rejection changed the plan';end if;
 body:=pg_temp.timed_task_body('Expired preview');
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'expired',body)->'proposal';
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTimedTasks',true);
 if public.planner_ai_proposal_command(command)->>'status'<>'conflict' then raise exception 'Expired preview accepted';end if;
 body:=pg_temp.timed_task_body('Stale preview');
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'stale-planner',body)->'proposal';
 perform public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Later manual change"}');
 before_snapshot:=public.planner_schedule_context('2026-10-18');
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTimedTasks',true);
 if public.planner_ai_proposal_command(command)->>'status'<>'conflict' or public.planner_schedule_context('2026-10-18')<>before_snapshot then raise exception 'Stale preview changed plan';end if;
 if public.planner_ai_store_proposal(gen_random_uuid(),'stale-store',body)->>'status'<>'conflict' then raise exception 'Stale generation stored';end if;
 -- Unambiguous dates, duration provenance and an explicit revision are mandatory.
 body:=pg_temp.timed_task_body('Invalid schedule');
 for schedule in select value from jsonb_array_elements('[
  {"startDate":"2026-03-08","startTime":"02:00","endDate":"2026-03-08","endTime":"02:30"},
  {"startDate":"2026-11-01","startTime":"01:00","endDate":"2026-11-01","endTime":"01:30"},
  {"timezone":"Invalid/Timezone"},{"endTime":"22:00"},{"endTime":"23:00"},{"startDate":"2026-02-31"},
  {"durationSource":"estimate"},{"task_id":"61800000-0000-0000-0000-000000000002"}
 ]') loop
  if public.planner_ai_store_proposal(gen_random_uuid(),'invalid-schedule',jsonb_set(body,'{items,0,schedule}',body->'items'->0->'schedule'||schedule))->>'status'<>'invalid' then raise exception 'Invalid schedule accepted: %',schedule;end if;
 end loop;
 if public.planner_ai_store_proposal(gen_random_uuid(),'no-revision',body-'contextVersion')->>'status'<>'invalid'
  or public.planner_ai_store_proposal(gen_random_uuid(),'default-is-not-estimate',pg_temp.timed_task_body('Invalid default','{}','{"estimate_minutes":30}'))->>'status'<>'invalid' then raise exception 'Timed contract weakened';end if;
 body:=jsonb_set(body,'{items}',body->'items'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','routine-create',
  'changes','{"title":"Mixed recurring routine","date":"2026-10-18","startTime":"22:00","endTime":"22:30","timezone":"America/Los_Angeles","protected":true,"rule":{"frequency":"daily","interval":1}}'::jsonb)));
 if public.planner_ai_store_proposal(gen_random_uuid(),'mixed-recurring-capture',body)->>'status'<>'invalid' then raise exception 'Timed task accepted mixed recurring capture';end if;
 reset role;
end $$;

do $$
declare body jsonb; proposal jsonb; result jsonb; event jsonb; recurring_id uuid; exception_id uuid;
begin
 set local role authenticated;
 -- Existing weekly commitments expand on the requested day, not just their anchor.
 insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone,is_recurring,recurrence_rule,end_type)
 values(auth.uid(),'Sunday commitment','2026-10-11','2026-10-11','22:00','22:30','America/Los_Angeles',true,'{"frequency":"weekly","interval":1,"days_of_week":[0]}','never') returning id into recurring_id;
 body:=pg_temp.timed_task_body('Recurring conflict');
 if public.planner_ai_store_proposal(gen_random_uuid(),'recurring-overlap',body)->>'status'<>'conflict' then raise exception 'Recurring commitment overlap accepted';end if;
 -- A moved exception frees the original occurrence and occupies its replacement.
 insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone,is_exception,recurring_event_id,original_date)
 values(auth.uid(),'Moved Sunday commitment','2026-10-18','2026-10-18','23:00','23:30','America/Los_Angeles',true,recurring_id,'2026-10-18') returning id into exception_id;
 body:=pg_temp.timed_task_body('Exception freed slot');
 if public.planner_ai_store_proposal(gen_random_uuid(),'freed-slot',body)->>'status'<>'complete' then raise exception 'Moved exception did not free original slot';end if;
 body:=pg_temp.timed_task_body('Exception conflict','{"startTime":"23:00","endTime":"23:30"}');
 if public.planner_ai_store_proposal(gen_random_uuid(),'exception-overlap',body)->>'status'<>'conflict' then raise exception 'Exception overlap accepted';end if;
 -- A reservation can cross midnight without changing its requested wall times.
 body:=pg_temp.timed_task_body('Overnight explicit','{"startTime":"23:45","endDate":"2026-10-19","endTime":"00:15","durationSource":"explicit"}');
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'overnight',body)->'proposal';
 result:=public.planner_ai_proposal_command(jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTimedTasks',true));
 if result->>'status'<>'complete' then raise exception 'Cross-midnight accept failed: %',result;end if;
 select e into event from jsonb_array_elements(public.planner_schedule_context('2026-10-19')->'events') e where e->>'title'='Overnight explicit';
 if event->>'start_date'<>'2026-10-18' or event->>'end_date'<>'2026-10-19' or event->>'end_time'<>'00:15:00' then raise exception 'Cross-midnight reservation changed';end if;
 body:=pg_temp.timed_task_body('Estimate','{"startDate":"2026-10-19","endDate":"2026-10-19","endTime":"22:45","durationSource":"estimate"}','{"estimate_minutes":45}');
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'known-estimate',body)->'proposal';
 if public.planner_ai_proposal_command(jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version','supportsTimedTasks',true))->>'status'<>'complete' then raise exception 'Known estimate could not reserve matching duration';end if;
 reset role;
end $$;

do $$
declare request_id uuid:=gen_random_uuid();conversation uuid:=gen_random_uuid(); first jsonb; replay jsonb; sequence_value bigint; sequence_called boolean;
begin
 select last_value,is_called into sequence_value,sequence_called from public.assistant_messages_sequence_seq;
 set local role authenticated;
 first:=public.assistant_begin_turn(request_id,conversation,true,repeat('f',64),'[{"role":"user","content":"Check doors at nine tonight"}]');
 if first->>'referenceAt' is null then raise exception 'Relative-date reference time missing';end if;
 replay:=public.assistant_begin_turn(request_id,conversation,true,repeat('f',64),'[{"role":"user","content":"Check doors at nine tonight"}]');
 if replay->>'referenceAt'<>first->>'referenceAt' then raise exception 'Retry reinterpreted relative-date reference';end if;
 reset role;
 perform setval('public.assistant_messages_sequence_seq',sequence_value,sequence_called);
end $$;
rollback;
