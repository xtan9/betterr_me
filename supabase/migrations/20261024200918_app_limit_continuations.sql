-- Explicit continuation receipts. This table contains no app-selection or enforcement state.
create table public.app_limit_continuations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  destination_source_id uuid not null,
  apply_event_id uuid not null,
  request jsonb not null,
  receipt jsonb not null,
  destination_before jsonb,
  primary key(user_id,operation_id),
  unique(user_id,apply_event_id)
);
alter table public.app_limit_continuations enable row level security;
revoke all on public.app_limit_continuations from public,anon,authenticated;
grant select on public.app_limit_continuations to authenticated;
create policy app_limit_continuation_owner on public.app_limit_continuations for select to authenticated using((select auth.uid())=user_id);

create function app_limit_private.continuation_state(p_source uuid,p_rule uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare journal public.app_limit_history_sources; latest public.app_limit_history_events; maximum bigint;
begin
  select * into journal from public.app_limit_history_sources where user_id=auth.uid() and id=p_source;
  select coalesce(max(sequence),0) into maximum from public.app_limit_history_events where user_id=auth.uid() and source_id=p_source;
  select * into latest from public.app_limit_history_events where user_id=auth.uid() and source_id=p_source and rule_id=p_rule
    and sequence<=coalesce(journal.acknowledged_through,0) order by sequence desc limit 1;
  return jsonb_build_object('source',journal.source,'ruleId',p_rule,'acknowledgedThrough',coalesce(journal.acknowledged_through,0),'maxReceivedSequence',maximum,
    'latest',case when latest.id is null then null else jsonb_build_object('version',jsonb_build_object('eventId',latest.event->'id','sequence',latest.sequence),
      'snapshot',latest.event->'after','observedAt',latest.event->'observedAt','receivedAt',floor(extract(epoch from latest.received_at)*1000)::bigint) end);
end $$;
create function app_limit_private.continuation_context(p_source uuid,p_rule uuid,p_destination uuid,p_destination_rule uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare origin jsonb; target jsonb; reason text; previous jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('status','unauthorized'); end if;
  if p_source is null or p_rule is null or p_destination is null or p_destination_rule is null then return jsonb_build_object('status','invalid'); end if;
  origin:=app_limit_private.continuation_state(p_source,p_rule); target:=app_limit_private.continuation_state(p_destination,p_destination_rule);
  previous:=target->'latest'->'snapshot';
  reason:=case
    when origin->'latest'='null'::jsonb then 'source-missing'
    when origin->'acknowledgedThrough'<>origin->'maxReceivedSequence' then 'source-incomplete'
    when origin->'latest'->'snapshot'->>'status'='removed' or (origin->'latest'->'snapshot'->>'current')::bigint=0 then 'source-ended'
    when p_source=p_destination then 'destination-not-pristine'
    when target->'acknowledgedThrough'<>target->'maxReceivedSequence' then 'destination-incomplete'
    when previous is not null and (previous->>'status'='removed' or (previous->>'current')::bigint<>0 or (previous->>'best')::bigint<>0
      or (previous->>'usedToday')::bigint<>0 or (previous->>'overridesToday')::bigint<>0) then 'destination-not-pristine'
    when exists(select 1 from public.app_limit_history_events where user_id=auth.uid() and source_id=p_destination and rule_id=p_destination_rule
      and (event->>'reason' in ('extraUnlock','limitRemoved','limitRelaxed') or (event->'after'->>'current')::bigint>0 or (event->'after'->>'best')::bigint>0)) then 'destination-not-pristine'
    else null end;
  return jsonb_build_object('status','complete','schemaVersion',1,
    'source',case when origin->'source'='null'::jsonb then null else origin end,
    'destination',jsonb_build_object('sourceId',p_destination,'acknowledgedThrough',target->'acknowledgedThrough','maxReceivedSequence',target->'maxReceivedSequence',
      'latestRule',case when target->'latest'='null'::jsonb then null else jsonb_build_object('version',target->'latest'->'version','snapshot',previous) end),
    'eligibility',jsonb_build_object('allowed',reason is null,'reason',reason));
end $$;

create function app_limit_private.continuation_read(p_operation uuid,p_destination uuid,p_event uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare saved public.app_limit_continuations; applied public.app_limit_history_events;
begin
  if auth.uid() is null then return jsonb_build_object('status','unauthorized'); end if;
  if (p_operation is not null and (p_destination is not null or p_event is not null))
    or (p_operation is null and (p_destination is null or p_event is null)) then return jsonb_build_object('status','invalid'); end if;
  select * into saved from public.app_limit_continuations where user_id=auth.uid()
    and ((p_operation is not null and operation_id=p_operation) or (p_operation is null and destination_source_id=p_destination and apply_event_id=p_event));
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into applied from public.app_limit_history_events where user_id=auth.uid() and source_id=saved.destination_source_id and id=saved.apply_event_id;
  if p_operation is null and applied.id is null then return jsonb_build_object('status','not_found'); end if;
  return jsonb_build_object('status','complete','schemaVersion',1,'receipt',saved.receipt,
    'application',case when applied.id is null then jsonb_build_object('state','awaiting-device') else
      jsonb_build_object('state','recorded','eventId',applied.event->'id','sequence',applied.sequence,'receivedAt',floor(extract(epoch from applied.received_at)*1000)::bigint) end);
end $$;

create function app_limit_private.continuation_confirm(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
  owner_id uuid:=auth.uid(); op uuid; source_id uuid; rule_id uuid; target_id uuid; target_rule uuid; apply_id uuid;
  saved public.app_limit_continuations; target public.app_limit_history_sources;
  origin jsonb; destination jsonb; view jsonb; source_request jsonb:=p_request->'source'; dest jsonb:=p_request->'destination';
  source_snapshot jsonb; dest_snapshot jsonb; receipt jsonb; reason text;
begin
  if owner_id is null then return jsonb_build_object('status','unauthorized'); end if;
  if focus_private.exact_fields(p_request,array['schemaVersion','operationId','source','destination']) is distinct from true
    or p_request->'schemaVersion' is distinct from '1'::jsonb or octet_length(p_request::text)>16384
    or focus_private.exact_fields(source_request,array['sourceId','ruleId','expectedCheckpoint','expectedEvent']) is distinct from true
    or focus_private.exact_fields(dest,array['source','ruleId','expectedCheckpoint','expectedRuleEvent','applyEventId','label','dailyUnlocks','minutes']) is distinct from true
    or focus_private.exact_fields(dest->'source',array['id','label','platform']) is distinct from true
    or focus_private.exact_fields(source_request->'expectedEvent',array['eventId','sequence']) is distinct from true
    or (dest->'expectedRuleEvent'<>'null'::jsonb and focus_private.exact_fields(dest->'expectedRuleEvent',array['eventId','sequence']) is distinct from true)
    then return jsonb_build_object('status','invalid'); end if;
  -- Cast only strict UUID strings, not arbitrary JSON scalar coercions.
  if exists(select 1 from jsonb_array_elements(jsonb_build_array(p_request->'operationId',source_request->'sourceId',source_request->'ruleId',
      source_request->'expectedEvent'->'eventId',dest->'source'->'id',dest->'ruleId',dest->'applyEventId')) value
      where jsonb_typeof(value) is distinct from 'string' or (value#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or focus_private.bounded_integer(source_request->'expectedCheckpoint',1,9007199254740991) is distinct from true
    or focus_private.bounded_integer(source_request->'expectedEvent'->'sequence',1,9007199254740991) is distinct from true
    or focus_private.bounded_integer(dest->'expectedCheckpoint',0,9007199254740990) is distinct from true
    or (dest->'expectedRuleEvent'<>'null'::jsonb and (jsonb_typeof(dest->'expectedRuleEvent'->'eventId') is distinct from 'string'
      or dest->'expectedRuleEvent'->>'eventId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or focus_private.bounded_integer(dest->'expectedRuleEvent'->'sequence',1,9007199254740991) is distinct from true))
    or jsonb_typeof(dest->'source'->'label') is distinct from 'string' or length(btrim(dest->'source'->>'label'))<1 or length(dest->'source'->>'label')>100
    or jsonb_typeof(dest->'source'->'platform') is distinct from 'string' or dest->'source'->>'platform' not in ('ios','macos','web')
    or (dest->'label'<>'null'::jsonb and (jsonb_typeof(dest->'label') is distinct from 'string' or length(btrim(dest->>'label'))<1 or length(dest->>'label')>100))
    or focus_private.bounded_integer(dest->'dailyUnlocks',1,50) is distinct from true or focus_private.bounded_integer(dest->'minutes',1,60) is distinct from true
    then return jsonb_build_object('status','invalid'); end if;
  op:=(p_request->>'operationId')::uuid; source_id:=(source_request->>'sourceId')::uuid; rule_id:=(source_request->>'ruleId')::uuid;
  target_id:=(dest->'source'->>'id')::uuid; target_rule:=(dest->>'ruleId')::uuid; apply_id:=(dest->>'applyEventId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':app-limit-history',0));
  select * into saved from public.app_limit_continuations where user_id=owner_id and operation_id=op;
  if found then
    if saved.request is distinct from p_request then return jsonb_build_object('status','operation_conflict'); end if;
    return app_limit_private.continuation_read(op,null,null);
  end if;
  if exists(select 1 from public.app_limit_continuations where user_id=owner_id and apply_event_id=apply_id)
    or exists(select 1 from public.app_limit_history_events where user_id=owner_id and id=apply_id) then return jsonb_build_object('status','destination_changed'); end if;
  view:=app_limit_private.continuation_context(source_id,rule_id,target_id,target_rule);
  reason:=view->'eligibility'->>'reason';
  if reason is not null then return jsonb_build_object('status',replace(reason,'-','_')); end if;
  origin:=view->'source'; destination:=view->'destination'; source_snapshot:=origin->'latest'->'snapshot'; dest_snapshot:=destination->'latestRule'->'snapshot';
  if origin->'acknowledgedThrough'<>source_request->'expectedCheckpoint'
    or (origin->'latest'->'version'->>'eventId')::uuid<>(source_request->'expectedEvent'->>'eventId')::uuid
    or origin->'latest'->'version'->'sequence'<>source_request->'expectedEvent'->'sequence' then return jsonb_build_object('status','source_changed'); end if;
  if destination->'acknowledgedThrough'<>dest->'expectedCheckpoint'
    or (dest->'expectedRuleEvent'='null'::jsonb)<>(destination->'latestRule'='null'::jsonb)
    or (dest->'expectedRuleEvent'<>'null'::jsonb and ((dest->'expectedRuleEvent'->>'eventId')::uuid<>(destination->'latestRule'->'version'->>'eventId')::uuid
      or dest->'expectedRuleEvent'->'sequence'<>destination->'latestRule'->'version'->'sequence')) then return jsonb_build_object('status','destination_changed'); end if;
  select * into target from public.app_limit_history_sources where user_id=owner_id and id=target_id;
  if found and target.source is distinct from dest->'source' then return jsonb_build_object('status','destination_changed'); end if;
  if (dest->>'dailyUnlocks')::integer>(source_snapshot->>'dailyUnlocks')::integer or (dest->>'minutes')::integer>(source_snapshot->>'minutes')::integer
    or (dest_snapshot is not null and ((dest->>'dailyUnlocks')::integer>(dest_snapshot->>'dailyUnlocks')::integer or (dest->>'minutes')::integer>(dest_snapshot->>'minutes')::integer))
    then return jsonb_build_object('status','settings_loosened'); end if;
  receipt:=jsonb_build_object('schemaVersion',1,'operationId',p_request->'operationId','confirmedAt',floor(extract(epoch from clock_timestamp())*1000)::bigint,
    'source',jsonb_build_object('source',origin->'source','ruleId',source_request->'ruleId','checkpoint',origin->'acknowledgedThrough',
      'event',origin->'latest'->'version','snapshot',source_snapshot,'observedAt',origin->'latest'->'observedAt','receivedAt',origin->'latest'->'receivedAt'),
    'destination',dest,'restored',jsonb_build_object('current',source_snapshot->'current','best',source_snapshot->'best'));
  insert into public.app_limit_history_sources(user_id,id,source) values(owner_id,target_id,dest->'source') on conflict(user_id,id) do nothing;
  insert into public.app_limit_continuations(user_id,operation_id,destination_source_id,apply_event_id,request,receipt,destination_before)
    values(owner_id,op,target_id,apply_id,p_request,receipt,dest_snapshot);
  return app_limit_private.continuation_read(op,null,null);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalid');
when unique_violation then return jsonb_build_object('status','operation_conflict');
end $$;

revoke all on function app_limit_private.continuation_state(uuid,uuid),app_limit_private.continuation_context(uuid,uuid,uuid,uuid),app_limit_private.continuation_read(uuid,uuid,uuid),app_limit_private.continuation_confirm(jsonb) from public,anon,authenticated;
grant execute on function app_limit_private.continuation_state(uuid,uuid),app_limit_private.continuation_context(uuid,uuid,uuid,uuid),app_limit_private.continuation_read(uuid,uuid,uuid),app_limit_private.continuation_confirm(jsonb) to authenticated;
create function public.app_limit_continuation_context(p_source uuid,p_rule uuid,p_destination uuid,p_destination_rule uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$ select app_limit_private.continuation_context(p_source,p_rule,p_destination,p_destination_rule) $$;
create function public.app_limit_continuation_read(p_operation uuid default null,p_destination uuid default null,p_event uuid default null) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$ select app_limit_private.continuation_read(p_operation,p_destination,p_event) $$;
create function public.app_limit_continuation_confirm(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select app_limit_private.continuation_confirm(p_request) $$;
revoke all on function public.app_limit_continuation_context(uuid,uuid,uuid,uuid),public.app_limit_continuation_read(uuid,uuid,uuid),public.app_limit_continuation_confirm(jsonb) from public,anon;
grant execute on function public.app_limit_continuation_context(uuid,uuid,uuid,uuid),public.app_limit_continuation_read(uuid,uuid,uuid),public.app_limit_continuation_confirm(jsonb) to authenticated;

-- Existing v1 history payloads stay unchanged. Only receipt-bound apply identities
-- receive this additional check; ordinary native journal events retain v1 behavior.
create function app_limit_private.validate_continuation_application() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
declare saved public.app_limit_continuations; dest jsonb; after_state jsonb;
begin
  select * into saved from public.app_limit_continuations where user_id=new.user_id and apply_event_id=new.id;
  if not found then return new; end if;
  dest:=saved.receipt->'destination'; after_state:=new.event->'after';
  if new.source_id<>saved.destination_source_id or new.rule_id<>(dest->>'ruleId')::uuid
    or new.sequence<>(dest->>'expectedCheckpoint')::bigint+1
    or new.event->>'kind'<>'app-limit-change'
    or new.event->>'reason'<>(case when saved.destination_before is null then 'limitCreated' else 'resumed' end)
    or new.event->'before' is distinct from coalesce(saved.destination_before,'null'::jsonb)
    or after_state->'label' is distinct from dest->'label'
    or after_state->'dailyUnlocks' is distinct from dest->'dailyUnlocks'
    or after_state->'minutes' is distinct from dest->'minutes'
    or after_state->'current' is distinct from saved.receipt->'restored'->'current'
    or after_state->'best' is distinct from saved.receipt->'restored'->'best'
    or after_state->>'status'<>'counting' or after_state->'usedToday'<>'0'::jsonb or after_state->'overridesToday'<>'0'::jsonb
    then raise check_violation using message='Continuation application does not match its receipt'; end if;
  return new;
end $$;
revoke all on function app_limit_private.validate_continuation_application() from public,anon,authenticated;
create trigger app_limit_continuation_application before insert on public.app_limit_history_events
for each row execute function app_limit_private.validate_continuation_application();
