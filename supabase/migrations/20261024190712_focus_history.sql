-- Device-reported completed Focus history. No planner or enforcement mutations.
create schema if not exists focus_private;
revoke all on schema focus_private from public, anon, authenticated;
grant usage on schema focus_private to authenticated;

create table public.focus_history_sources (
  user_id uuid not null references public.profiles(id) on delete cascade,
  id uuid not null,
  source jsonb not null,
  acknowledged_through bigint not null default 0 check (acknowledged_through between 0 and 9007199254740991),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create table public.focus_history_events (
  user_id uuid not null,
  source_id uuid not null,
  id uuid not null,
  sequence bigint not null check (sequence between 1 and 9007199254740991),
  session_id uuid not null,
  event jsonb not null,
  position bigint not null check (position between 1 and 9007199254740991),
  received_at timestamptz not null default clock_timestamp(),
  primary key (user_id, source_id, id),
  unique (user_id, source_id, sequence),
  unique (user_id, source_id, session_id),
  unique (user_id, position),
  foreign key (user_id, source_id) references public.focus_history_sources(user_id, id) on delete cascade
);
alter table public.focus_history_sources enable row level security;
alter table public.focus_history_events enable row level security;
revoke all on public.focus_history_sources, public.focus_history_events from public, anon, authenticated;
grant select on public.focus_history_sources, public.focus_history_events to authenticated;
create policy focus_source_owner on public.focus_history_sources for select to authenticated using ((select auth.uid()) = user_id);
create policy focus_event_owner on public.focus_history_events for select to authenticated using ((select auth.uid()) = user_id);

create function focus_private.exact_fields(value jsonb, fields text[]) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select case when jsonb_typeof(value) = 'object' then
    (select count(*) from jsonb_object_keys(value)) = cardinality(fields)
    and not exists(select 1 from jsonb_object_keys(value) k where not (k = any(fields)))
  else false end
$$;
create function focus_private.bounded_integer(value jsonb, minimum numeric, maximum numeric) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select case when jsonb_typeof(value) = 'number' then
    value::text::numeric between minimum and maximum and trunc(value::text::numeric) = value::text::numeric
  else false end
$$;
create function focus_private.valid_session(value jsonb) returns boolean
language plpgsql immutable set search_path = pg_catalog as $$
declare settings jsonb; link jsonb; segment jsonb; previous numeric; finish numeric;
begin
  if focus_private.exact_fields(value, array['id','startedAt','endedAt','completedRounds','settings','link','segments']) is distinct from true
    or jsonb_typeof(value->'id') is distinct from 'string'
    or (value->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or focus_private.bounded_integer(value->'startedAt',0,8640000000000000) is distinct from true
    or focus_private.bounded_integer(value->'endedAt',0,8640000000000000) is distinct from true
    or focus_private.bounded_integer(value->'completedRounds',0,1000000) is distinct from true
    or jsonb_typeof(value->'segments') is distinct from 'array' then return false; end if;
  previous := (value->>'startedAt')::numeric; finish := (value->>'endedAt')::numeric;
  if finish < previous or jsonb_array_length(value->'segments') > 2048 then return false; end if;
  settings := value->'settings'; link := value->'link';
  if focus_private.exact_fields(settings,array['preset','focusMinutes','shortBreakMinutes','longBreakMinutes','longBreakEvery']) is distinct from true
    or jsonb_typeof(settings->'preset') is distinct from 'string'
    or settings->>'preset' not in ('quick','classic','deep','open','custom')
    or focus_private.bounded_integer(settings->'focusMinutes',1,240) is distinct from true
    or focus_private.bounded_integer(settings->'shortBreakMinutes',1,120) is distinct from true
    or focus_private.bounded_integer(settings->'longBreakMinutes',1,120) is distinct from true
    or focus_private.bounded_integer(settings->'longBreakEvery',0,12) is distinct from true then return false; end if;
  if link <> 'null'::jsonb then
    if focus_private.exact_fields(link,array['kind','id','title','projectName']) is distinct from true
      or jsonb_typeof(link->'kind') is distinct from 'string' or link->>'kind' not in ('task','event')
      or jsonb_typeof(link->'id') is distinct from 'string' or length(link->>'id') not between 1 and 200
      or jsonb_typeof(link->'title') is distinct from 'string' or length(link->>'title') > 1000
      or (link->'projectName' <> 'null'::jsonb and (jsonb_typeof(link->'projectName') is distinct from 'string' or length(link->>'projectName') > 200))
      then return false; end if;
  end if;
  for segment in select jsonb_array_elements(value->'segments') loop
    if focus_private.exact_fields(segment,array['start','end']) is distinct from true
      or focus_private.bounded_integer(segment->'start',0,8640000000000000) is distinct from true
      or focus_private.bounded_integer(segment->'end',0,8640000000000000) is distinct from true then return false; end if;
    if (segment->>'start')::numeric < previous or (segment->>'end')::numeric < (segment->>'start')::numeric
      or (segment->>'end')::numeric > finish then return false; end if;
    previous := (segment->>'end')::numeric;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;

create function focus_private.ingest(p_request jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
<<ingestion>>
declare
  owner_id uuid := auth.uid(); journal_id uuid; source jsonb; event jsonb;
  previous public.focus_history_sources; old_event jsonb;
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
    if focus_private.exact_fields(event,array['id','sequence','kind','observedAt','appVersion','session']) is distinct from true
      or jsonb_typeof(event->'id') is distinct from 'string'
      or (event->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or focus_private.bounded_integer(event->'sequence',1,9007199254740991) is distinct from true
      or jsonb_typeof(event->'kind') is distinct from 'string' or event->>'kind' not in ('focus-session-completed','focus-session-baseline')
      or focus_private.bounded_integer(event->'observedAt',0,8640000000000000) is distinct from true
      or jsonb_typeof(event->'appVersion') is distinct from 'string' or length(event->>'appVersion') not between 1 and 64
      or focus_private.valid_session(event->'session') is distinct from true then return jsonb_build_object('status','invalid'); end if;
  end loop;
  if (select count(distinct (e->>'id')::uuid) from jsonb_array_elements(p_request->'events') e) <> jsonb_array_length(p_request->'events')
    or (select count(distinct (e->>'sequence')::bigint) from jsonb_array_elements(p_request->'events') e) <> jsonb_array_length(p_request->'events')
    or (select count(distinct (e->'session'->>'id')::uuid) from jsonb_array_elements(p_request->'events') e) <> jsonb_array_length(p_request->'events')
    then return jsonb_build_object('status','invalid'); end if;

  -- Serializing all journals of an owner also makes receipt-order paging safe:
  -- a later committed record cannot precede an earlier in-flight cursor position.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':focus-history', 0));
  select s.* into previous from public.focus_history_sources s where s.user_id = owner_id and s.id = journal_id for update;
  if found and previous.source is distinct from source then return jsonb_build_object('status','conflict'); end if;
  for event in select jsonb_array_elements(p_request->'events') loop
    select e.event into old_event from public.focus_history_events e
      where e.user_id = owner_id and e.source_id = journal_id and e.id = (ingestion.event->>'id')::uuid;
    if found and old_event is distinct from event then return jsonb_build_object('status','conflict'); end if;
    if exists(select 1 from public.focus_history_events e where e.user_id = owner_id and e.source_id = journal_id
      and (e.sequence = (ingestion.event->>'sequence')::bigint or e.session_id = (ingestion.event->'session'->>'id')::uuid)
      and e.id <> (ingestion.event->>'id')::uuid) then return jsonb_build_object('status','conflict'); end if;
  end loop;
  insert into public.focus_history_sources(user_id,id,source) values(owner_id,journal_id,source)
    on conflict (user_id,id) do nothing;
  select coalesce(max(e.position),0) into receipt_position from public.focus_history_events e where e.user_id=owner_id;
  for event in select jsonb_array_elements(p_request->'events') loop
    if not exists(select 1 from public.focus_history_events e where e.user_id=owner_id and e.source_id=journal_id and e.id=(ingestion.event->>'id')::uuid) then
      receipt_position := receipt_position + 1;
      insert into public.focus_history_events(user_id,source_id,id,sequence,session_id,event,position)
        values(owner_id,journal_id,(ingestion.event->>'id')::uuid,(ingestion.event->>'sequence')::bigint,(ingestion.event->'session'->>'id')::uuid,ingestion.event,receipt_position);
    end if;
  end loop;
  acknowledged := coalesce(previous.acknowledged_through,0);
  select coalesce(min(prior) filter(where sequence > prior + 1), max(sequence), acknowledged)
    into acknowledged from (
      select e.sequence, lag(e.sequence,1,acknowledged) over(order by e.sequence) prior
      from public.focus_history_events e where e.user_id = owner_id and e.source_id = journal_id and e.sequence > acknowledged
    ) ordered;
  update public.focus_history_sources s set acknowledged_through = acknowledged where s.user_id = owner_id and s.id = journal_id;
  select jsonb_agg(e->'id' order by ordinal) into accepted from jsonb_array_elements(p_request->'events') with ordinality as input(e,ordinal);
  return jsonb_build_object('status','complete','schemaVersion',1,'sourceId',source->>'id','acceptedEventIds',accepted,'acknowledgedThrough',acknowledged);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  return jsonb_build_object('status','invalid');
when unique_violation then return jsonb_build_object('status','conflict');
end $$;

create function focus_private.read_history(p_after bigint, p_limit integer) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog as $$
declare owner_id uuid := auth.uid(); items jsonb;
begin
  if owner_id is null then return jsonb_build_object('status','unauthorized'); end if;
  if p_after is null or p_after not between 0 and 9007199254740991 or p_limit is null or p_limit not between 1 and 101 then
    return jsonb_build_object('status','invalid'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('position',e.position,'source',e.source,'event',e.event,
    'receivedAt',floor(extract(epoch from e.received_at) * 1000)::bigint) order by e.position),'[]'::jsonb)
    into items from (
      select h.position,s.source,h.event,h.received_at from public.focus_history_events h
      join public.focus_history_sources s on s.user_id=h.user_id and s.id=h.source_id
      where h.user_id=owner_id and h.position>p_after order by h.position limit p_limit
    ) e;
  return jsonb_build_object('status','complete','items',items);
end $$;

revoke all on all functions in schema focus_private from public, anon, authenticated;
grant execute on function focus_private.ingest(jsonb), focus_private.read_history(bigint,integer) to authenticated;
create function public.focus_history_ingest(p_request jsonb) returns jsonb
language sql security invoker set search_path = pg_catalog as $$ select focus_private.ingest(p_request) $$;
create function public.focus_history_read(p_after bigint default 0, p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path = pg_catalog as $$ select focus_private.read_history(p_after,p_limit) $$;
revoke all on function public.focus_history_ingest(jsonb), public.focus_history_read(bigint,integer) from public, anon;
grant execute on function public.focus_history_ingest(jsonb), public.focus_history_read(bigint,integer) to authenticated;
