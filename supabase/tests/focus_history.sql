-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('f0100000-0000-4000-8000-000000000001','focus-history-one@example.test');
select public.sql_fixture_create_auth_user('f0100000-0000-4000-8000-000000000002','focus-history-two@example.test');
select set_config('request.jwt.claims','{"sub":"f0100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare
  journal uuid := 'f0100000-0000-4000-8000-000000000010';
  event jsonb := '{"id":"f0100000-0000-4000-8000-000000000011","sequence":1,"kind":"focus-session-completed","observedAt":1790000060000,"appVersion":"0.1.0","session":{"id":"f0100000-0000-4000-8000-000000000012","startedAt":1790000000000,"endedAt":1790000060000,"completedRounds":0,"settings":{"preset":"open","focusMinutes":25,"shortBreakMinutes":5,"longBreakMinutes":20,"longBreakEvery":4},"link":{"kind":"task","id":"already-deleted-task","title":"Offline work","projectName":null},"segments":[{"start":1790000000000,"end":1790000030000}]}}';
  request jsonb; result jsonb; page jsonb; first_position bigint; later jsonb; middle jsonb;
begin
  request := jsonb_build_object('schemaVersion',1,'source',jsonb_build_object('id',journal,'label','iPhone','platform','ios'),'events',jsonb_build_array(event));
  result := public.focus_history_ingest(request);
  if result->>'status' <> 'complete' or result->>'acknowledgedThrough' <> '1' or result->'acceptedEventIds' <> jsonb_build_array(event->'id') then
    raise exception 'completed session not acknowledged: %', result; end if;
  page := public.focus_history_read(0,50);
  if jsonb_array_length(page->'items') <> 1 or page->'items'->0->'event' <> event then raise exception 'session snapshot not recoverable'; end if;
  first_position := (page->'items'->0->>'position')::bigint;
  if public.focus_history_ingest(request)->>'acknowledgedThrough' <> '1'
    or jsonb_array_length(public.focus_history_read(0,50)->'items') <> 1 then raise exception 'lost-ack replay duplicated history'; end if;
  if public.focus_history_ingest(jsonb_set(request,'{events,0,appVersion}','"changed"'))->>'status' <> 'conflict' then raise exception 'changed identity accepted'; end if;
  if public.focus_history_ingest(jsonb_set(request,'{events,0,id}',to_jsonb(gen_random_uuid())))->>'status' <> 'conflict' then raise exception 'sequence reuse accepted'; end if;
  if public.focus_history_ingest(request || '{"userId":"f0100000-0000-4000-8000-000000000002"}')->>'status' <> 'invalid' then raise exception 'owner field accepted'; end if;
  if public.focus_history_ingest(jsonb_set(request,'{events,0,session,settings,blocking}','{"selectionId":"private"}'))->>'status' <> 'invalid' then raise exception 'selection token accepted'; end if;
  if public.focus_history_ingest(jsonb_set(request,'{events,0,session,segments,0,end}','1790000090000'))->>'status' <> 'invalid' then raise exception 'invented duration accepted'; end if;

  later := jsonb_set(event || jsonb_build_object('id',gen_random_uuid(),'sequence',3),'{session,id}',to_jsonb(gen_random_uuid()));
  result := public.focus_history_ingest(request || jsonb_build_object('events',jsonb_build_array(later)));
  if result->>'status' <> 'complete' or result->>'acknowledgedThrough' <> '1' then raise exception 'gap falsely acknowledged: %',result; end if;
  middle := jsonb_set(event || jsonb_build_object('id',gen_random_uuid(),'sequence',2),'{session,id}',to_jsonb(gen_random_uuid()));
  result := public.focus_history_ingest(request || jsonb_build_object('events',jsonb_build_array(middle)));
  if result->>'acknowledgedThrough' <> '3' then raise exception 'filled gap did not advance contiguous checkpoint: %',result; end if;
  if public.focus_history_ingest(request)->>'acknowledgedThrough' <> '3' then raise exception 'delayed replay rolled checkpoint back'; end if;
  page := public.focus_history_read(first_position,1);
  if jsonb_array_length(page->'items') <> 1 or page->'items'->0->'event'->>'sequence' <> '3' then raise exception 'receipt order paging changed to observation order'; end if;
  if public.focus_history_read(0,102)->>'status' <> 'invalid' then raise exception 'unbounded read allowed'; end if;

  later := jsonb_set(event || jsonb_build_object('id',gen_random_uuid(),'sequence',4,'kind','focus-session-baseline'),'{session,id}',to_jsonb(gen_random_uuid()));
  result := public.focus_history_ingest(request || jsonb_build_object('events',jsonb_build_array(later,event || '{"appVersion":"conflicting"}')));
  if result->>'status' <> 'conflict' or jsonb_array_length(public.focus_history_read(0,50)->'items') <> 3 then
    raise exception 'conflicting batch partially committed'; end if;
  if public.focus_history_ingest(jsonb_set(request,'{source,label}','"different source metadata"'))->>'status' <> 'conflict' then raise exception 'source metadata silently replaced'; end if;
  result := public.focus_history_ingest(request || jsonb_build_object('events',jsonb_build_array(later)));
  if result->>'acknowledgedThrough' <> '4' then raise exception 'baseline not retained'; end if;
  if public.focus_history_ingest(request)->>'acknowledgedThrough' <> '4' then raise exception 'baseline replay moved checkpoint'; end if;

  begin
    update public.focus_history_events set event='{}';
    raise exception 'direct history update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.focus_history_sources;
    raise exception 'direct history deletion allowed';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims','{"sub":"f0100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  if jsonb_array_length(public.focus_history_read(0,50)->'items') <> 0 then raise exception 'foreign history exposed through RPC'; end if;
  if exists(select 1 from public.focus_history_events) or exists(select 1 from public.focus_history_sources) then raise exception 'foreign direct read exposed'; end if;
  -- A source ID is never authority: under another owner it creates an isolated journal.
  if public.focus_history_ingest(request)->>'acknowledgedThrough' <> '1' then raise exception 'owner-scoped source identity failed'; end if;
  if jsonb_array_length(public.focus_history_read(0,50)->'items') <> 1 then raise exception 'second owner cannot read own history'; end if;
  perform set_config('request.jwt.claims','{"sub":"f0100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  if jsonb_array_length(public.focus_history_read(0,50)->'items') <> 4 then raise exception 'other account replaced source history'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.focus_history_read(); raise exception 'anonymous read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.focus_history_ingest('{}'); raise exception 'anonymous upload allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
