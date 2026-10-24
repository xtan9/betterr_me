-- Native app-limit journal; immutable portable observations, never enforcement state.
create schema if not exists app_limit_private;
revoke all on schema app_limit_private from public, anon, authenticated;
grant usage on schema app_limit_private to authenticated;

create table public.app_limit_history_sources (
  user_id uuid not null references public.profiles(id) on delete cascade,
  id uuid not null,
  source jsonb not null,
  acknowledged_through bigint not null default 0 check (acknowledged_through between 0 and 9007199254740991),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create table public.app_limit_history_events (
  user_id uuid not null,
  source_id uuid not null,
  id uuid not null,
  sequence bigint not null check (sequence between 1 and 9007199254740991),
  rule_id uuid not null,
  event jsonb not null,
  position bigint not null check (position between 1 and 9007199254740991),
  received_at timestamptz not null default clock_timestamp(),
  primary key (user_id, source_id, id),
  unique (user_id, source_id, sequence),
  unique (user_id, position),
  foreign key (user_id, source_id) references public.app_limit_history_sources(user_id, id) on delete cascade
);
alter table public.app_limit_history_sources enable row level security;
alter table public.app_limit_history_events enable row level security;
revoke all on public.app_limit_history_sources, public.app_limit_history_events from public, anon, authenticated;
grant select on public.app_limit_history_sources, public.app_limit_history_events to authenticated;
create policy app_limit_source_owner on public.app_limit_history_sources for select to authenticated using ((select auth.uid()) = user_id);
create policy app_limit_event_owner on public.app_limit_history_events for select to authenticated using ((select auth.uid()) = user_id);

create index app_limit_rule_sequence on public.app_limit_history_events(user_id,source_id,rule_id,sequence desc);

create function app_limit_private.valid_snapshot(value jsonb) returns boolean
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if focus_private.exact_fields(value,array['label','day','dailyUnlocks','minutes','current','best','status','usedToday','overridesToday']) is distinct from true
    or (value->'label' <> 'null'::jsonb and (jsonb_typeof(value->'label') is distinct from 'string' or length(btrim(value->>'label')) not between 1 and 100 or length(value->>'label') > 100))
    or jsonb_typeof(value->'day') is distinct from 'string' or value->>'day' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or left(value->>'day',4)='0000'
    or focus_private.bounded_integer(value->'dailyUnlocks',1,50) is distinct from true
    or focus_private.bounded_integer(value->'minutes',1,60) is distinct from true
    or focus_private.bounded_integer(value->'current',0,1000000) is distinct from true
    or focus_private.bounded_integer(value->'best',0,1000000) is distinct from true
    or focus_private.bounded_integer(value->'usedToday',0,1000000) is distinct from true
    or focus_private.bounded_integer(value->'overridesToday',0,1000000) is distinct from true
    or jsonb_typeof(value->'status') is distinct from 'string' or value->>'status' not in ('counting','paused','removed') then return false; end if;
  return (value->>'best')::numeric >= (value->>'current')::numeric
    and to_char(to_date(value->>'day','YYYY-MM-DD'),'YYYY-MM-DD')=value->>'day';
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then return false;
end $$;

create function app_limit_private.ingest(p_request jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
<<ingestion>>
declare
  owner_id uuid := auth.uid(); journal_id uuid; source jsonb; event jsonb;
  previous public.app_limit_history_sources; old_event jsonb;
  acknowledged bigint; accepted jsonb; receipt_position bigint;
begin
  if owner_id is null then return jsonb_build_object('status','unauthorized'); end if;
  if focus_private.exact_fields(p_request,array['schemaVersion','source','events']) is distinct from true
    or p_request->'schemaVersion' is distinct from '1'::jsonb
    or octet_length(p_request::text) > 262144
    or jsonb_typeof(p_request->'events') is distinct from 'array' then return jsonb_build_object('status','invalid'); end if;
  source := p_request->'source';
  if focus_private.exact_fields(source,array['id','label','platform']) is distinct from true
    or jsonb_typeof(source->'id') is distinct from 'string'
    or (source->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(source->'label') is distinct from 'string' or length(btrim(source->>'label')) < 1 or length(source->>'label') > 100
    or jsonb_typeof(source->'platform') is distinct from 'string' or source->>'platform' not in ('ios','macos','web')
    or jsonb_array_length(p_request->'events') not between 1 and 25 then return jsonb_build_object('status','invalid'); end if;
  journal_id := (source->>'id')::uuid;
  for event in select jsonb_array_elements(p_request->'events') loop
    if focus_private.exact_fields(event,array['schemaVersion','id','sequence','kind','observedAt','appVersion','ruleId','reason','before','after']) is distinct from true
      or event->'schemaVersion' is distinct from '1'::jsonb
      or jsonb_typeof(event->'id') is distinct from 'string'
      or (event->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or focus_private.bounded_integer(event->'sequence',1,9007199254740991) is distinct from true
      or jsonb_typeof(event->'kind') is distinct from 'string' or event->>'kind' not in ('app-limit-baseline','app-limit-change')
      or focus_private.bounded_integer(event->'observedAt',0,8640000000000000) is distinct from true
      or jsonb_typeof(event->'appVersion') is distinct from 'string' or length(event->>'appVersion') not between 1 and 64
      or jsonb_typeof(event->'ruleId') is distinct from 'string'
      or event->>'ruleId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(event->'reason') is distinct from 'string'
      or event->>'reason' not in ('baseline','limitCreated','limitChanged','labelChanged','dayAdvanced','authorizationUnavailable','authorizationDenied','authorizationCheckFailed','accountChanged','signedOut','limitRemoved','limitRelaxed','extraUnlock','unlocked','resumed')
      or ((event->>'kind'='app-limit-baseline') <> (event->>'reason'='baseline'))
      or ((event->'before'='null'::jsonb) <> (event->>'reason' in ('baseline','limitCreated')))
      or (event->'before'<>'null'::jsonb and app_limit_private.valid_snapshot(event->'before') is distinct from true)
      or app_limit_private.valid_snapshot(event->'after') is distinct from true then return jsonb_build_object('status','invalid'); end if;
  end loop;
  if (select count(distinct (e->>'id')::uuid) from jsonb_array_elements(p_request->'events') e) <> jsonb_array_length(p_request->'events')
    or (select count(distinct (e->>'sequence')::bigint) from jsonb_array_elements(p_request->'events') e) <> jsonb_array_length(p_request->'events')
    then return jsonb_build_object('status','invalid'); end if;

  -- Serializing all journals of an owner also makes receipt-order paging safe:
  -- a later committed record cannot precede an earlier in-flight cursor position.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':app-limit-history', 0));
  select s.* into previous from public.app_limit_history_sources s where s.user_id = owner_id and s.id = journal_id for update;
  if found and previous.source is distinct from source then return jsonb_build_object('status','conflict'); end if;
  for event in select jsonb_array_elements(p_request->'events') loop
    select e.event into old_event from public.app_limit_history_events e
      where e.user_id = owner_id and e.source_id = journal_id and e.id = (ingestion.event->>'id')::uuid;
    if found and old_event is distinct from event then return jsonb_build_object('status','conflict'); end if;
    if exists(select 1 from public.app_limit_history_events e where e.user_id = owner_id and e.source_id = journal_id
      and e.sequence = (ingestion.event->>'sequence')::bigint
      and e.id <> (ingestion.event->>'id')::uuid) then return jsonb_build_object('status','conflict'); end if;
  end loop;
  insert into public.app_limit_history_sources(user_id,id,source) values(owner_id,journal_id,source)
    on conflict (user_id,id) do nothing;
  select coalesce(max(e.position),0) into receipt_position from public.app_limit_history_events e where e.user_id=owner_id;
  for event in select jsonb_array_elements(p_request->'events') loop
    if not exists(select 1 from public.app_limit_history_events e where e.user_id=owner_id and e.source_id=journal_id and e.id=(ingestion.event->>'id')::uuid) then
      receipt_position := receipt_position + 1;
      insert into public.app_limit_history_events(user_id,source_id,id,sequence,rule_id,event,position)
        values(owner_id,journal_id,(ingestion.event->>'id')::uuid,(ingestion.event->>'sequence')::bigint,(ingestion.event->>'ruleId')::uuid,ingestion.event,receipt_position);
    end if;
  end loop;
  acknowledged := coalesce(previous.acknowledged_through,0);
  select coalesce(min(prior) filter(where sequence > prior + 1), max(sequence), acknowledged)
    into acknowledged from (
      select e.sequence, lag(e.sequence,1,acknowledged) over(order by e.sequence) prior
      from public.app_limit_history_events e where e.user_id = owner_id and e.source_id = journal_id and e.sequence > acknowledged
    ) ordered;
  update public.app_limit_history_sources s set acknowledged_through = acknowledged where s.user_id = owner_id and s.id = journal_id;
  select jsonb_agg(e->'id' order by ordinal) into accepted from jsonb_array_elements(p_request->'events') with ordinality as input(e,ordinal);
  return jsonb_build_object('status','complete','schemaVersion',1,'sourceId',source->>'id','acceptedEventIds',accepted,'acknowledgedThrough',acknowledged);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  return jsonb_build_object('status','invalid');
when unique_violation then return jsonb_build_object('status','conflict');
end $$;

create function app_limit_private.read_history(p_after bigint, p_limit integer) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog as $$
declare owner_id uuid := auth.uid(); items jsonb;
begin
  if owner_id is null then return jsonb_build_object('status','unauthorized'); end if;
  if p_after is null or p_after not between 0 and 9007199254740991 or p_limit is null or p_limit not between 1 and 101 then
    return jsonb_build_object('status','invalid'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('position',e.position,'source',e.source,'event',e.event,
    'acknowledgedThrough',e.acknowledged_through,'receivedAt',floor(extract(epoch from e.received_at) * 1000)::bigint) order by e.position),'[]'::jsonb)
    into items from (
      select h.position,s.source,h.event,h.received_at,s.acknowledged_through from public.app_limit_history_events h
      join public.app_limit_history_sources s on s.user_id=h.user_id and s.id=h.source_id
      where h.user_id=owner_id and h.position>p_after order by h.position limit p_limit
    ) e;
  return jsonb_build_object('status','complete','items',items);
end $$;

revoke all on all functions in schema app_limit_private from public, anon, authenticated;
grant execute on function app_limit_private.ingest(jsonb), app_limit_private.read_history(bigint,integer) to authenticated;
create function public.app_limit_history_ingest(p_request jsonb) returns jsonb
language sql security invoker set search_path = pg_catalog as $$ select app_limit_private.ingest(p_request) $$;
create function public.app_limit_history_read(p_after bigint default 0, p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path = pg_catalog as $$ select app_limit_private.read_history(p_after,p_limit) $$;
revoke all on function public.app_limit_history_ingest(jsonb), public.app_limit_history_read(bigint,integer) from public, anon;
grant execute on function public.app_limit_history_ingest(jsonb), public.app_limit_history_read(bigint,integer) to authenticated;
