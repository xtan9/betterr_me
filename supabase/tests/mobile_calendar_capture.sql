-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('68500000-0000-0000-0000-000000000001','calendar-owner@example.test');
select public.sql_fixture_create_auth_user('68500000-0000-0000-0000-000000000002','calendar-other@example.test');
select set_config('request.jwt.claims','{"sub":"68500000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare task jsonb; result jsonb; replay jsonb; linked jsonb; current_event public.calendar_events;
  changes jsonb := '{"title":"Lunch","start_date":"2026-09-18","end_date":"2026-09-18","start_time":"12:30","end_time":"13:00","timezone":"America/Los_Angeles","is_protected":true}';
begin
  task := public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Keep task"}')->'task';
  result := public.calendar_capture_command('create','68500000-0000-0000-0000-000000000003',null,null,changes);
  if result->>'status'<>'complete' then raise exception 'create failed: %',result; end if;
  replay := public.calendar_capture_command('create','68500000-0000-0000-0000-000000000003',null,null,changes);
  if replay->>'status'<>'already-applied' or replay->'event'<>result->'event' then raise exception 'retry changed event'; end if;
  linked := public.calendar_capture_command('edit',gen_random_uuid(),(result->'event'->>'id')::uuid,
    (result->'event'->>'version')::uuid,jsonb_build_object('task_id',task->>'id','is_protected',false));
  if linked->>'status'<>'complete' or linked->'event'->>'task_id'<>task->>'id' then raise exception 'link failed: %',linked; end if;
  replay := public.calendar_capture_command('edit',gen_random_uuid(),(result->'event'->>'id')::uuid,
    (result->'event'->>'version')::uuid,'{"title":"stale"}');
  if replay->>'status'<>'conflict' then raise exception 'stale mobile accepted'; end if;
  begin
    perform public.update_calendar_event_with_reminders('68500000-0000-0000-0000-000000000001',
      (result->'event'->>'id')::uuid,jsonb_build_object('title','stale web','expected_version',result->'event'->>'version'));
    raise exception 'stale web accepted';
  exception when sqlstate 'PT409' then null;
  end;
  delete from public.tasks where id=(task->>'id')::uuid;
  select * into current_event from public.calendar_events where id=(result->'event'->>'id')::uuid;
  if current_event.task_id is not null or current_event.title<>'Lunch' or current_event.version=(linked->'event'->>'version')::uuid then
    raise exception 'legacy task deletion did not preserve event and version unlink';
  end if;
  perform set_config('request.jwt.claims','{"sub":"68500000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists(select 1 from public.calendar_events) or exists(select 1 from public.calendar_capture_receipts) then raise exception 'cross-owner read'; end if;
  replay := public.calendar_capture_command('remove',gen_random_uuid(),current_event.id,current_event.version);
  if replay->>'status'<>'not-found' then raise exception 'cross-owner remove'; end if;
  perform set_config('request.jwt.claims','{"sub":"68500000-0000-0000-0000-000000000001","role":"authenticated"}',true);
  replay := public.calendar_capture_command('remove',gen_random_uuid(),current_event.id,current_event.version);
  if replay->>'status'<>'complete' or exists(select 1 from public.calendar_events) then raise exception 'remove failed'; end if;
  if not exists(select 1 from public.calendar_capture_receipts where before_event->>'id'=current_event.id::text and outcome->>'removed'='true') then
    raise exception 'removal history missing';
  end if;
end $$;
rollback;
