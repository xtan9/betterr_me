-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('f0200000-0000-4000-8000-000000000001','app-limit-history-one@example.test');
select public.sql_fixture_create_auth_user('f0200000-0000-4000-8000-000000000002','app-limit-history-two@example.test');
select set_config('request.jwt.claims','{"sub":"f0200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare
  event jsonb := '{"schemaVersion":1,"id":"f0200000-0000-4000-8000-000000000011","sequence":1,"kind":"app-limit-baseline","observedAt":1790000060000,"appVersion":"0.1.0","ruleId":"f0200000-0000-4000-8000-000000000012","reason":"baseline","before":null,"after":{"label":null,"day":"2026-10-24","dailyUnlocks":3,"minutes":5,"current":2,"best":4,"status":"paused","usedToday":1,"overridesToday":0}}';
  request jsonb; result jsonb; page jsonb; later jsonb; middle jsonb; batch jsonb; seq integer; first_position bigint;
begin
  request := jsonb_build_object('schemaVersion',1,'source',jsonb_build_object('id','f0200000-0000-4000-8000-000000000010','label','Native iPhone journal','platform','ios'),'events',jsonb_build_array(event));
  result := public.app_limit_history_ingest(request);
  if result->>'status' <> 'complete' or result->>'acknowledgedThrough' <> '1' then raise exception 'baseline not acknowledged: %',result; end if;
  page := public.app_limit_history_read(0,50);
  if jsonb_array_length(page->'items') <> 1 or page->'items'->0->'event' <> event
    or page->'items'->0->>'acknowledgedThrough' <> '1' then raise exception 'baseline/checkpoint not recoverable'; end if;
  first_position := (page->'items'->0->>'position')::bigint;
  if public.app_limit_history_ingest(request)->>'acknowledgedThrough' <> '1'
    or jsonb_array_length(public.app_limit_history_read(0,50)->'items') <> 1 then raise exception 'lost receipt replay duplicated baseline'; end if;
  if public.app_limit_history_ingest(jsonb_set(request,'{events,0,appVersion}','"changed"'))->>'status' <> 'conflict' then raise exception 'changed identity accepted'; end if;
  if public.app_limit_history_ingest(jsonb_set(request,'{events,0,id}',to_jsonb(gen_random_uuid())))->>'status' <> 'conflict' then raise exception 'sequence reuse accepted'; end if;
  if public.app_limit_history_ingest(request || '{"userId":"f0200000-0000-4000-8000-000000000002"}')->>'status' <> 'invalid' then raise exception 'forged owner accepted'; end if;
  if public.app_limit_history_ingest(jsonb_set(request,'{events,0,after,selectionTokens}','["private"]'))->>'status' <> 'invalid' then raise exception 'native selection exported'; end if;
  if public.app_limit_history_ingest(jsonb_set(request,'{events,0,after,grant}','{}'))->>'status' <> 'invalid' then raise exception 'active grant exported'; end if;
  if public.app_limit_history_ingest(jsonb_set(request,'{events,0,after,day}','"2026-02-30"'))->>'status' <> 'invalid' then raise exception 'invalid civil date accepted'; end if;
  if public.app_limit_history_ingest(jsonb_set(request,'{events,0,after,best}','1'))->>'status' <> 'invalid' then raise exception 'invalid streak snapshot accepted'; end if;
  if public.app_limit_history_ingest(jsonb_set(request,'{events,0,schemaVersion}','2'))->>'status' <> 'invalid' then raise exception 'unsupported event version accepted'; end if;
  if public.app_limit_history_ingest(jsonb_set(request,'{events,0,reason}','"signedOut"'))->>'status' <> 'invalid' then raise exception 'invented baseline reason accepted'; end if;

  middle := event || jsonb_build_object('id',gen_random_uuid(),'sequence',2,'kind','app-limit-change','reason','dayAdvanced','before',event->'after',
    'after',(event->'after') || '{"current":3,"day":"2026-10-25","status":"counting","usedToday":0}');
  later := event || jsonb_build_object('id',gen_random_uuid(),'sequence',3,'kind','app-limit-change','reason','extraUnlock','before',middle->'after',
    'after',(middle->'after') || '{"current":0,"overridesToday":1}');
  result := public.app_limit_history_ingest(request || jsonb_build_object('events',jsonb_build_array(later)));
  if result->>'acknowledgedThrough' <> '1' then raise exception 'gap acknowledged'; end if;
  page := public.app_limit_history_read(first_position,1);
  if page->'items'->0->'event'->>'sequence' <> '3' or page->'items'->0->>'acknowledgedThrough' <> '1' then raise exception 'unconfirmed reset lost provenance'; end if;
  if public.app_limit_history_ingest(request || jsonb_build_object('events',jsonb_build_array(middle)))->>'acknowledgedThrough' <> '3' then raise exception 'gap did not close'; end if;
  if public.app_limit_history_ingest(request)->>'acknowledgedThrough' <> '3' then raise exception 'checkpoint moved backward'; end if;
  page := public.app_limit_history_read(0,50);
  if page->'items'->1->'event'->>'sequence' <> '3' or page->'items'->2->'event'->>'sequence' <> '2'
    or page->'items'->1->>'acknowledgedThrough' <> '3' then raise exception 'latest contiguous reset not inspectable'; end if;
  batch := jsonb_build_array(later || jsonb_build_object('id',gen_random_uuid(),'sequence',4),event || '{"appVersion":"conflict"}');
  if public.app_limit_history_ingest(request || jsonb_build_object('events',batch))->>'status' <> 'conflict'
    or jsonb_array_length(public.app_limit_history_read(0,50)->'items') <> 3 then raise exception 'conflicting batch partly committed'; end if;
  if public.app_limit_history_ingest(jsonb_set(request,'{source,label}','"replaced"'))->>'status' <> 'conflict' then raise exception 'source provenance replaced'; end if;
  -- The display cap must not become cloud retention; many changes can affect one rule.
  for seq in 4..130 loop
    result := public.app_limit_history_ingest(request || jsonb_build_object('events',jsonb_build_array(
      later || jsonb_build_object('id',gen_random_uuid(),'sequence',seq,'reason','labelChanged','before',later->'after','after',(later->'after') || '{"label":"Video apps"}')
    )));
    if result->>'acknowledgedThrough' <> seq::text then raise exception 'journal truncated at %',seq; end if;
  end loop;
  if jsonb_array_length(public.app_limit_history_read(0,100)->'items') <> 100
    or jsonb_array_length(public.app_limit_history_read(100,100)->'items') <> 30 then raise exception 'over 100 records not recoverable'; end if;
  if public.app_limit_history_read(0,102)->>'status' <> 'invalid' then raise exception 'unbounded read allowed'; end if;
  if jsonb_array_length(public.focus_history_read(0,50)->'items') <> 0 then raise exception 'app-limit event leaked into Focus v1'; end if;
  begin update public.app_limit_history_events set event='{}'; raise exception 'direct update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.app_limit_history_sources; raise exception 'direct deletion allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"sub":"f0200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  if jsonb_array_length(public.app_limit_history_read(0,50)->'items') <> 0
    or exists(select 1 from public.app_limit_history_events) then raise exception 'foreign owner history exposed'; end if;
  if public.app_limit_history_ingest(request)->>'acknowledgedThrough' <> '1' then raise exception 'same source ID was treated as authority'; end if;
  perform set_config('request.jwt.claims','{"sub":"f0200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  if public.app_limit_history_ingest(request)->>'acknowledgedThrough' <> '130' then raise exception 'foreign owner changed checkpoint'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.app_limit_history_read(); raise exception 'anonymous read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.app_limit_history_ingest('{}'); raise exception 'anonymous write allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
