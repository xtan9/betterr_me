-- Service-only sleep writes require an admin fixture; all legacy bypass attempts run as authenticated.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('73000000-0000-0000-0000-000000000001','sleep-owner@example.test','{}'),
 ('73000000-0000-0000-0000-000000000002','sleep-other@example.test','{}');
select set_config('request.jwt.claims','{"sub":"73000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
create function pg_temp.fail_sleep_write() returns trigger language plpgsql as $$
begin
 if current_setting('test.sleep_failure',true)='yes' and new.sleep_schedule_id is not null then raise exception 'Injected projection failure'; end if;
 return new;
end $$;
create trigger sleep_fixture_failure after insert on public.calendar_events for each row execute function pg_temp.fail_sleep_write();
do $$
declare owner_id uuid:='73000000-0000-0000-0000-000000000001'; other_id uuid:='73000000-0000-0000-0000-000000000002';
 c jsonb; p jsonb; r jsonb; request jsonb; saved jsonb; first_day date; parent public.calendar_events; exception public.calendar_events; stable_exception public.calendar_events;
begin
 set local role authenticated;
 if public.planner_sleep_snapshot()->'schedule'<>'null'::jsonb then raise exception 'new account has default sleep'; end if;
 begin perform public.planner_sleep_prepare(owner_id,'{}'); raise exception 'client can bypass external preview'; exception when insufficient_privilege then null; end;
 reset role;
 c:=jsonb_build_object('operation','setup','expectedVersion',null,'timezone','UTC','startTime','23:00','endTime','07:00');
 p:=public.planner_sleep_prepare(owner_id,c);
 if p->>'status'<>'complete' then raise exception 'setup preview %',p; end if;
 first_day:=(p->>'effectiveDate')::date;
 if (p->'intervals'->0->>'start')::timestamptz<=statement_timestamp() then raise exception 'setup backfilled a started night'; end if;
 if p->'intervals'->0->>'endDate'<>(first_day+1)::text then raise exception 'overnight end wrong'; end if;
 request:=jsonb_build_object('action','save','operationId',gen_random_uuid(),'change',c,'previewToken','server-confirmation');
 r:=public.planner_sleep_commit(owner_id,request,p->>'token');
 if r->>'status'<>'complete' then raise exception 'setup save %',r; end if;
 if public.planner_sleep_commit(owner_id,request,'old-token')->>'status'<>'already-applied' then raise exception 'lost-response retry did not replay'; end if;
 set local role authenticated;
 saved:=public.planner_sleep_snapshot()->'schedule';
 if saved->>'startTime'<>'23:00' or (select count(*) from public.calendar_events where sleep_schedule_id is not null)<>1 then raise exception 'setup not persisted'; end if;
 if exists(select 1 from public.tasks) then raise exception 'sleep became a task'; end if;
 select * into parent from public.calendar_events where sleep_schedule_id=(saved->>'id')::uuid;
 begin update public.calendar_events set is_protected=false where id=parent.id; raise exception 'unprotect succeeded'; exception when insufficient_privilege then null; end;
 begin delete from public.calendar_events where id=parent.id; raise exception 'delete succeeded'; exception when insufficient_privilege then null; end;
 begin update public.calendar_events set sleep_schedule_id=null where id=parent.id; raise exception 'detach succeeded'; exception when insufficient_privilege then null; end;
 begin insert into public.calendar_events(user_id,title,start_date,end_date,is_exception,recurring_event_id,original_date)
  values(owner_id,'Skip sleep',first_day,first_day,true,parent.id,first_day); raise exception 'legacy exception succeeded'; exception when insufficient_privilege then null; end;
 reset role;
 -- The original night survives moving the start past midnight.
 c:=jsonb_build_object('operation','night','expectedVersion',saved->>'version','nightDate',first_day+2,'startDate',first_day+3,'startTime','00:30','endTime','08:30','eventId',parent.id,'expectedEventVersion',parent.version);
 p:=public.planner_sleep_prepare(owner_id,c);
 if p->>'status'<>'complete' then raise exception 'night preview %',p; end if;
 r:=public.planner_sleep_commit(owner_id,jsonb_build_object('action','save','operationId',gen_random_uuid(),'change',c,'previewToken','night'),p->>'token');
 if r->>'status'<>'complete' then raise exception 'night save %',r; end if;
 select * into exception from public.calendar_events where sleep_schedule_id=parent.sleep_schedule_id and is_exception;
 if exception.original_date<>first_day+2 or exception.start_date<>first_day+3 or exception.end_time<>time '08:30' then raise exception 'night identity lost'; end if;
 if (select count(*) from public.calendar_events where sleep_schedule_id=parent.sleep_schedule_id and is_exception)<>1 then raise exception 'duplicate night'; end if;
 c:=c||jsonb_build_object('expectedVersion',r->>'version','startTime','06:00','endTime','00:30','eventId',exception.id,'expectedEventVersion',exception.version);
 if public.planner_sleep_prepare(owner_id,c)->>'status'<>'overlap' then raise exception 'adjacent overlap accepted'; end if;
 -- Future revision preserves this exception and updates the daily target.
 c:=jsonb_build_object('operation','revise','expectedVersion',r->>'version','effectiveDate',first_day+1,'startTime','22:00','endTime','06:00');
 p:=public.planner_sleep_prepare(owner_id,c);
 if p->>'status'<>'complete' or p->>'preserved'<>'1' then raise exception 'future preview %',p; end if;
 if p->'intervals'->1->>'startTime'<>'00:30' then raise exception 'preview overwrote exception'; end if;
 stable_exception:=exception;
 r:=public.planner_sleep_commit(owner_id,jsonb_build_object('action','save','operationId',gen_random_uuid(),'change',c,'previewToken','revision'),p->>'token');
 if r->>'status'<>'complete' then raise exception 'future save %',r; end if;
 select * into exception from public.calendar_events where id=stable_exception.id;
 if exception.start_date<>stable_exception.start_date or exception.start_time<>stable_exception.start_time or exception.original_date<>stable_exception.original_date then raise exception 'future changed exception'; end if;
 -- Stale confirmation and stale multi-device version both reject.
 c:=c||jsonb_build_object('expectedVersion',r->>'version','startTime','21:00','effectiveDate',first_day+2);
 p:=public.planner_sleep_prepare(owner_id,c);
 insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone) values(owner_id,'New commitment',first_day+2,first_day+2,'21:30','22:00','UTC');
 if public.planner_sleep_commit(owner_id,jsonb_build_object('action','save','operationId',gen_random_uuid(),'change',c),p->>'token')->>'status'<>'conflict' then raise exception 'stale calendar preview accepted'; end if;
 if public.planner_sleep_prepare(owner_id,c||jsonb_build_object('expectedVersion',saved->>'version'))->>'status'<>'conflict' then raise exception 'stale device version accepted'; end if;
 if public.planner_sleep_prepare(owner_id,c||jsonb_build_object('endTime','21:00'))->>'status'<>'invalid' then raise exception 'equal clocks accepted'; end if;
 if public.planner_sleep_prepare(owner_id,c||jsonb_build_object('timezone','Asia/Shanghai'))->>'status'<>'invalid' then raise exception 'timezone changed'; end if;
 if public.planner_sleep_prepare(owner_id,c||jsonb_build_object('operation','end'))->>'status'<>'invalid' then raise exception 'end accepted'; end if;
 begin
  insert into public.planner_ai_proposals(id,user_id,request_fingerprint,proposal_type,body) values(gen_random_uuid(),owner_id,'sleep-overlap','schedule',jsonb_build_object('events',jsonb_build_array(jsonb_build_object('kind','event-create','changes',jsonb_build_object('start_date',first_day+1,'end_date',first_day+1,'start_time','23:15','end_time','23:45','timezone','UTC')))));
  raise exception 'AI bypassed sleep occupancy';
 exception when check_violation then null; end;
 insert into public.planner_ai_proposals(id,user_id,request_fingerprint,proposal_type,body) values(gen_random_uuid(),owner_id,'sleep-safe','schedule',jsonb_build_object('events',jsonb_build_array(jsonb_build_object('kind','event-create','changes',jsonb_build_object('start_date',first_day+1,'end_date',first_day+1,'start_time','12:00','end_time','13:00','timezone','UTC')))));
 -- Failure after projection insertion rolls back the schedule, event, and receipt together.
 c:=jsonb_build_object('operation','setup','expectedVersion',null,'timezone','America/Los_Angeles','startTime','23:00','endTime','07:00');
 p:=public.planner_sleep_prepare(other_id,c);
 request:=jsonb_build_object('action','save','operationId',gen_random_uuid(),'change',c);
 perform set_config('test.sleep_failure','yes',true);
 begin
  perform public.planner_sleep_commit(other_id,request,p->>'token');
  raise exception 'Failure injection did not run';
 exception when raise_exception then if sqlerrm<>'Injected projection failure' then raise; end if; end;
 perform set_config('test.sleep_failure','no',true);
 if exists(select 1 from public.sleep_schedules where user_id=other_id) or exists(select 1 from public.calendar_events where user_id=other_id)
   or exists(select 1 from public.planner_command_receipts where user_id=other_id) then raise exception 'partial sleep save survived failure'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
 set local role authenticated;
 if public.planner_sleep_snapshot()->'schedule'<>'null'::jsonb or exists(select 1 from public.calendar_events) then raise exception 'cross-owner read'; end if;
 begin perform public.planner_sleep_commit(owner_id,'{}',''); raise exception 'direct write bypass'; exception when insufficient_privilege then null; end;
 reset role;
 r:=public.planner_sleep_commit(other_id,request,p->>'token');
 if r->>'status'<>'complete' then raise exception 'atomic retry failed'; end if;
 -- Explicit gap/fold examples exercise the same resolver used by every sleep interval.
 if planner_private.routine_interval_valid('2027-03-14','02:30','08:30','America/Los_Angeles') then raise exception 'spring gap accepted'; end if;
 if ('2027-11-07 01:30'::timestamp at time zone 'America/Los_Angeles')<>'2027-11-07 09:30Z'::timestamptz then raise exception 'fold policy changed'; end if;
 if planner_private.routine_end_date('2028-02-29','23:00','07:00')<>'2028-03-01'::date or planner_private.routine_end_date('2026-12-31','23:00','07:00')<>'2027-01-01'::date then raise exception 'civil rollover changed'; end if;
 -- Account deletion, unlike a calendar action, still removes its private schedule.
 delete from public.profiles where id=owner_id;
 if exists(select 1 from public.sleep_schedules where user_id=owner_id) then raise exception 'account deletion blocked'; end if;
end $$;
rollback;
