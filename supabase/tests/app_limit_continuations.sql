-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('f0300000-0000-4000-8000-000000000001','continuation-one@example.test');
select public.sql_fixture_create_auth_user('f0300000-0000-4000-8000-000000000002','continuation-two@example.test');
select set_config('request.jwt.claims','{"sub":"f0300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare
  source jsonb := '{"id":"f0300000-0000-4000-8000-000000000010","label":"Old iPhone","platform":"ios"}';
  target jsonb := '{"id":"f0300000-0000-4000-8000-000000000020","label":"New iPhone","platform":"ios"}';
  event jsonb := '{"schemaVersion":1,"id":"f0300000-0000-4000-8000-000000000011","sequence":1,"kind":"app-limit-baseline","observedAt":1790000060000,"appVersion":"0.1.0","ruleId":"f0300000-0000-4000-8000-000000000012","reason":"baseline","before":null,"after":{"label":"Social","day":"2026-10-24","dailyUnlocks":3,"minutes":5,"current":2,"best":4,"status":"paused","usedToday":1,"overridesToday":0}}';
  request jsonb; receipt jsonb; replay jsonb; context jsonb; applied jsonb; upload jsonb; changed jsonb; next_event jsonb; pristine jsonb; candidate jsonb;
begin
  perform public.app_limit_history_ingest(jsonb_build_object('schemaVersion',1,'source',source,'events',jsonb_build_array(event)));
  context := public.app_limit_continuation_context((source->>'id')::uuid,(event->>'ruleId')::uuid,(target->>'id')::uuid,'f0300000-0000-4000-8000-000000000022');
  if context->'eligibility'->>'allowed' <> 'true' then raise exception 'positive paused source not eligible: %',context; end if;
  request := jsonb_build_object('schemaVersion',1,'operationId','f0300000-0000-4000-8000-000000000030',
    'source',jsonb_build_object('sourceId',source->>'id','ruleId',event->>'ruleId','expectedCheckpoint',1,'expectedEvent',jsonb_build_object('eventId',event->>'id','sequence',1)),
    'destination',jsonb_build_object('source',target,'ruleId','f0300000-0000-4000-8000-000000000022','expectedCheckpoint',0,'expectedRuleEvent',null,'applyEventId','f0300000-0000-4000-8000-000000000021','label','Social again','dailyUnlocks',2,'minutes',5));
  receipt := public.app_limit_continuation_confirm(request);
  if receipt->>'status' <> 'complete' or receipt->'receipt'->'restored' <> '{"current":2,"best":4}' then raise exception 'recorded days not continued: %',receipt; end if;
  replay := public.app_limit_continuation_confirm(request);
  if replay <> receipt then raise exception 'confirmation retry changed receipt'; end if;
  if public.app_limit_continuation_read((request->>'operationId')::uuid,null,null) <> receipt then raise exception 'lost response not recoverable'; end if;
  changed:=request || jsonb_build_object('operationId',gen_random_uuid(),'destination',(request->'destination') || jsonb_build_object('applyEventId',gen_random_uuid()));
  if public.app_limit_continuation_confirm(jsonb_set(request,'{destination,label}','"changed"'))->>'status'<>'operation_conflict' then raise exception 'same identity changed'; end if;
  if public.app_limit_continuation_confirm(jsonb_set(changed,'{source,expectedCheckpoint}','2'))->>'status'<>'source_changed' then raise exception 'stale source accepted'; end if;
  if public.app_limit_continuation_confirm(jsonb_set(changed,'{destination,expectedCheckpoint}','1'))->>'status'<>'destination_changed' then raise exception 'stale destination accepted'; end if;
  if public.app_limit_continuation_confirm(jsonb_set(changed,'{destination,dailyUnlocks}','4'))->>'status'<>'settings_loosened' then raise exception 'looser count accepted'; end if;
  if public.app_limit_continuation_confirm(jsonb_set(changed,'{destination,minutes}','6'))->>'status'<>'settings_loosened' then raise exception 'looser duration accepted'; end if;
  if public.app_limit_continuation_confirm(request || '{"owner":"forged"}')->>'status'<>'invalid' then raise exception 'owner accepted'; end if;
  if public.app_limit_continuation_confirm(jsonb_set(changed,'{destination,token}','"private"'))->>'status'<>'invalid' then raise exception 'token accepted'; end if;
  if public.app_limit_continuation_confirm(jsonb_set(changed,'{destination,source}',source))->>'status'<>'destination_not_pristine' then raise exception 'same journal continued'; end if;
  begin update public.app_limit_continuations set receipt='{}'; raise exception 'direct update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.app_limit_continuations; raise exception 'direct deletion allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"sub":"f0300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  if public.app_limit_continuation_read((request->>'operationId')::uuid,null,null)->>'status'<>'not_found' or exists(select 1 from public.app_limit_continuations) then raise exception 'foreign receipt visible'; end if;
  if public.app_limit_continuation_confirm(changed)->>'status'<>'source_missing' then raise exception 'foreign source used'; end if;
  perform set_config('request.jwt.claims','{"sub":"f0300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  if public.app_limit_continuation_read(null,(target->>'id')::uuid,(request->'destination'->>'applyEventId')::uuid)->>'status' <> 'not_found' then raise exception 'unapplied lineage exposed'; end if;
  applied:=event || jsonb_build_object('id',request->'destination'->'applyEventId','sequence',1,'kind','app-limit-change','reason','limitCreated',
    'ruleId',request->'destination'->'ruleId','after',(event->'after') || '{"label":"Social again","dailyUnlocks":2,"usedToday":0,"status":"counting","day":"2026-11-01"}');
  upload:=jsonb_build_object('schemaVersion',1,'source',target,'events',jsonb_build_array(applied));
  if public.app_limit_history_ingest(jsonb_set(upload,'{events,0,after,current}','3'))->>'status'='complete' then raise exception 'forged continuation credit accepted'; end if;
  if public.app_limit_history_ingest(upload)->>'acknowledgedThrough'<>'1' then raise exception 'valid application not accepted'; end if;
  replay:=public.app_limit_continuation_read(null,(target->>'id')::uuid,(applied->>'id')::uuid);
  if replay->'application'->>'state'<>'recorded' or replay->'receipt'<>receipt->'receipt' then raise exception 'clean-install lineage not recoverable'; end if;
  if public.app_limit_continuation_confirm(changed)->>'status'<>'destination_not_pristine' then raise exception 'earned target overwritten'; end if;
  -- A prepared target may already exist, but each setting must remain as strict.
  pristine:=event || jsonb_build_object('id',gen_random_uuid(),'ruleId',gen_random_uuid(),'after',(event->'after') || '{"current":0,"best":0,"usedToday":0,"dailyUnlocks":1,"minutes":3}');
  target:=target || jsonb_build_object('id',gen_random_uuid());
  perform public.app_limit_history_ingest(jsonb_build_object('schemaVersion',1,'source',target,'events',jsonb_build_array(pristine)));
  candidate:=changed || jsonb_build_object('operationId',gen_random_uuid(),'destination',(changed->'destination') || jsonb_build_object('source',target,'ruleId',pristine->'ruleId','expectedCheckpoint',1,'expectedRuleEvent',jsonb_build_object('eventId',pristine->'id','sequence',1),'applyEventId',gen_random_uuid()));
  if public.app_limit_continuation_confirm(candidate)->>'status'<>'settings_loosened' then raise exception 'destination settings loosened'; end if;
  candidate:=jsonb_set(jsonb_set(candidate,'{destination,dailyUnlocks}','1'),'{destination,minutes}','3');
  if public.app_limit_continuation_confirm(candidate)->>'status'<>'complete' then raise exception 'pristine target rejected'; end if;
  applied:=pristine || jsonb_build_object('id',candidate->'destination'->'applyEventId','sequence',2,'kind','app-limit-change','reason','resumed','before',pristine->'after',
    'after',(pristine->'after') || '{"label":"Social again","current":2,"best":4,"status":"counting"}');
  upload:=jsonb_build_object('schemaVersion',1,'source',target,'events',jsonb_build_array(applied));
  if public.app_limit_history_ingest(jsonb_set(upload,'{events,0,before,day}','"2026-10-25"'))->>'status'='complete' then raise exception 'changed before accepted'; end if;
  if public.app_limit_history_ingest(upload)->>'status'<>'complete' then raise exception 'pristine application rejected'; end if;
  -- A post-gap reset blocks the earlier positive prefix, then remains terminal.
  next_event:=event || jsonb_build_object('id',gen_random_uuid(),'sequence',3,'kind','app-limit-change','reason','extraUnlock','before',event->'after','after',(event->'after') || '{"current":0,"overridesToday":1}');
  perform public.app_limit_history_ingest(jsonb_build_object('schemaVersion',1,'source',source,'events',jsonb_build_array(next_event)));
  candidate:=changed || jsonb_build_object('operationId',gen_random_uuid(),'destination',(changed->'destination') || jsonb_build_object('source',target || jsonb_build_object('id',gen_random_uuid()),'applyEventId',gen_random_uuid()));
  if public.app_limit_continuation_confirm(candidate)->>'status'<>'source_incomplete' then raise exception 'post-gap reset bypassed'; end if;
  if public.app_limit_continuation_confirm(request)->'receipt'<>receipt->'receipt' then raise exception 'lost receipt replay changed after source gap'; end if;
  perform public.app_limit_history_ingest(jsonb_build_object('schemaVersion',1,'source',source,'events',jsonb_build_array(event || jsonb_build_object('id',gen_random_uuid(),'sequence',2,'kind','app-limit-change','reason','resumed','before',event->'after'))));
  if public.app_limit_continuation_confirm(candidate)->>'status'<>'source_ended' then raise exception 'older positive prefix bypassed reset'; end if;
  if public.app_limit_continuation_confirm(request)->'receipt'<>receipt->'receipt' then raise exception 'confirmed lineage changed after source reset'; end if;
  if jsonb_array_length(public.focus_history_read(0,50)->'items')<>0 then raise exception 'continuation changed session v1'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.app_limit_continuation_read(); raise exception 'anonymous receipt allowed'; exception when insufficient_privilege then null; end;
  begin perform public.app_limit_continuation_confirm('{}'); raise exception 'anonymous confirm allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
