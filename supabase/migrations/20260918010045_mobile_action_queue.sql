-- Additive shared planning state. See docs/architecture/mobile-action-queue.md.
create schema if not exists planner_private;
revoke all on schema planner_private from public, anon;
grant usage on schema planner_private to authenticated;

create table public.action_queue_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  version uuid not null default gen_random_uuid(),
  task_ids uuid[] not null default '{}'
);
create table public.action_queue_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  outcome jsonb not null,
  primary key(user_id, operation_id)
);
alter table public.action_queue_state enable row level security;
alter table public.action_queue_receipts enable row level security;
revoke all on public.action_queue_state, public.action_queue_receipts from public, anon, authenticated;
grant select on public.action_queue_state, public.action_queue_receipts to authenticated;
create policy queue_owner on public.action_queue_state for select to authenticated using ((select auth.uid()) = user_id);
create policy queue_receipt_owner on public.action_queue_receipts for select to authenticated using ((select auth.uid()) = user_id);

create table public.task_action_rules (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version uuid not null default gen_random_uuid(),
  waiting boolean not null default false,
  timezone text not null,
  windows jsonb not null default '[]',
  dependency_ids uuid[] not null default '{}'
);
create index task_action_rules_owner on public.task_action_rules(user_id);
alter table public.task_action_rules enable row level security;
revoke all on public.task_action_rules from public,anon,authenticated;
grant select on public.task_action_rules to authenticated;
create policy task_rules_owner on public.task_action_rules for select to authenticated using ((select auth.uid())=user_id);

create function planner_private.action_queue_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  owner_id uuid := auth.uid();
  request_id uuid := (p_request->>'operationId')::uuid;
  receipt public.action_queue_receipts%rowtype;
  current_version uuid;
  ids uuid[];
  outcome jsonb;
  target_id uuid;
  task_version uuid;
  allowed_window jsonb;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if request_id is null or p_request is null or jsonb_typeof(p_request) <> 'object'
    or coalesce(p_request->>'operation','') not in ('queue','rules')
    or not p_request ? 'expectedVersion' then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':action-queue',0));
  select * into receipt from public.action_queue_receipts where user_id=owner_id and action_queue_receipts.operation_id=request_id;
  if found then
    if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  if p_request->>'operation' = 'queue' then
    if jsonb_typeof(p_request->'taskIds') is distinct from 'array'
      or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','expectedVersion','taskIds')) then
      return jsonb_build_object('status','invalid');
    end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_request->'taskIds');
  else
    if jsonb_typeof(p_request->'dependencyIds') is distinct from 'array'
      or jsonb_typeof(p_request->'waiting') is distinct from 'boolean'
      or jsonb_typeof(p_request->'windows') is distinct from 'array'
      or not exists(select 1 from pg_timezone_names where name=p_request->>'timezone')
      or p_request->>'taskId' is null or p_request->>'expectedTaskVersion' is null
      or exists(select 1 from jsonb_object_keys(p_request) k where k not in
        ('operation','operationId','expectedVersion','taskId','expectedTaskVersion','waiting','timezone','windows','dependencyIds')) then
      return jsonb_build_object('status','invalid');
    end if;
    for allowed_window in select value from jsonb_array_elements(p_request->'windows') loop
      if jsonb_typeof(allowed_window) <> 'object' or jsonb_typeof(allowed_window->'day') is distinct from 'number'
        or coalesce(allowed_window->>'day','') !~ '^[0-6]$'
        or coalesce(allowed_window->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(allowed_window->>'end','') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
        or allowed_window->>'start' >= allowed_window->>'end'
        or exists(select 1 from jsonb_object_keys(allowed_window) k where k not in ('day','start','end')) then
        return jsonb_build_object('status','invalid');
      end if;
    end loop;
    target_id := (p_request->>'taskId')::uuid;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_request->'dependencyIds');
  end if;
  ids := coalesce(ids,'{}');
  if exists(select 1 from unnest(ids) id group by id having count(*)>1) or array_position(ids,null) is not null then
    return jsonb_build_object('status','invalid');
  end if;
  -- Lock referenced rows against deletion/ownership changes during validation.
  perform 1 from public.tasks where (id=any(ids) or id=target_id) and user_id=owner_id order by id for share;
  if cardinality(ids) <> (select count(*) from public.tasks where id=any(ids) and user_id=owner_id) then
    return jsonb_build_object('status','not-found');
  end if;
  if p_request->>'operation' = 'queue' then
    select version into current_version from public.action_queue_state where user_id=owner_id;
    if current_version is distinct from (p_request->>'expectedVersion')::uuid then return jsonb_build_object('status','conflict'); end if;
    insert into public.action_queue_state(user_id,task_ids) values(owner_id,ids)
    on conflict(user_id) do update set task_ids=excluded.task_ids,version=gen_random_uuid();
  else
    select version into task_version from public.tasks where id=target_id and user_id=owner_id;
    if not found then return jsonb_build_object('status','not-found'); end if;
    select version into current_version from public.task_action_rules where task_id=target_id and user_id=owner_id;
    if current_version is distinct from (p_request->>'expectedVersion')::uuid
      or task_version is distinct from (p_request->>'expectedTaskVersion')::uuid then return jsonb_build_object('status','conflict'); end if;
    if exists(with recursive reachable(id) as (
      select unnest(ids) union
      select unnest(r.dependency_ids) from public.task_action_rules r join reachable d on r.task_id=d.id where r.user_id=owner_id
    ) select 1 from reachable where id=target_id) then return jsonb_build_object('status','invalid'); end if;
    insert into public.task_action_rules(task_id,user_id,waiting,timezone,windows,dependency_ids)
    values(target_id,owner_id,(p_request->>'waiting')::boolean,p_request->>'timezone',p_request->'windows',ids)
    on conflict(task_id) do update set waiting=excluded.waiting,timezone=excluded.timezone,windows=excluded.windows,
      dependency_ids=excluded.dependency_ids,version=gen_random_uuid();
  end if;
  outcome := jsonb_build_object('status','complete');
  insert into public.action_queue_receipts values(owner_id,request_id,p_request,outcome);
  return outcome;
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.action_queue_command(jsonb) from public,anon;
grant execute on function planner_private.action_queue_command(jsonb) to authenticated;
create function public.action_queue_command(p_request jsonb) returns jsonb
language sql security invoker set search_path = pg_catalog as $$
  select planner_private.action_queue_command(p_request);
$$;
revoke all on function public.action_queue_command(jsonb) from public,anon;
grant execute on function public.action_queue_command(jsonb) to authenticated;

-- Include both instances of repeated wall times. Nonexistent boundaries move
-- forward by PostgreSQL's timezone gap; a reversed interval is empty.
create function planner_private.local_boundary(wall timestamp, zone text, is_end boolean) returns timestamptz
language sql stable security invoker set search_path = pg_catalog as $$
  with offsets as (
    select (instant at time zone zone)-(instant at time zone 'UTC') as displacement
    from generate_series((wall at time zone zone)-interval '1 day',
      (wall at time zone zone)+interval '1 day',interval '1 day') instant
  ), candidates as (
    select (wall at time zone 'UTC')-displacement as instant from offsets
  ) select coalesce(case when is_end then max(instant) else min(instant) end,wall at time zone zone)
  from candidates where instant at time zone zone=wall;
$$;
revoke all on function planner_private.local_boundary(timestamp,text,boolean) from public,anon;
grant execute on function planner_private.local_boundary(timestamp,text,boolean) to authenticated;

create function public.action_queue_snapshot(p_at timestamptz default now(),p_gap_minutes integer default null) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare
  task record;
  rules public.task_action_rules%rowtype;
  result jsonb := '[]';
  reasons text[];
  blocked_ids uuid[];
  allowed tstzmultirange;
  local_day date;
  available boolean;
  fits_window boolean;
begin
  if p_at is null or not isfinite(p_at) or p_gap_minutes < 0 then raise exception 'Invalid evaluation time or gap'; end if;
  for task in select t.* from public.tasks t where t.user_id=auth.uid() order by t.id loop
    select * into rules from public.task_action_rules where task_id=task.id and user_id=auth.uid();
    reasons := '{}';
    if task.archived_at is not null then reasons := array_append(reasons,'archived'); end if;
    if task.is_completed or task.status='done' then reasons := array_append(reasons,'completed'); end if;
    if task.recurrence_occurrence_state in ('skipped','withdrawn','completed') and not ('completed'=any(reasons)) then
      reasons := array_append(reasons,'terminal-occurrence');
    end if;
    if coalesce(rules.waiting,false) then reasons := array_append(reasons,'waiting'); end if;
    select coalesce(array_agg(dependency.id),'{}') into blocked_ids from unnest(rules.dependency_ids) dependency(id)
    where not exists(select 1 from public.tasks d where d.id=dependency.id and d.user_id=auth.uid() and (d.is_completed or d.status='done'));
    if cardinality(blocked_ids)>0 then reasons := array_append(reasons,'dependency-blocked'); end if;
    available := true;
    fits_window := true;
    if coalesce(jsonb_array_length(rules.windows),0)>0 then
      local_day := (p_at at time zone rules.timezone)::date;
      -- Adjacent/overlapping windows coalesce, including midnight and DST.
      select range_agg(tstzrange(starts,greatest(starts,ends),'[)')) into allowed from (
        select planner_private.local_boundary(day::date + (w->>'start')::time,rules.timezone,false) as starts,
          planner_private.local_boundary(day::date + (w->>'end')::time,rules.timezone,true) as ends
        from generate_series(local_day-1, local_day+8,interval '1 day') day
        cross join jsonb_array_elements(rules.windows) w
        where extract(dow from day)::integer=(w->>'day')::integer
      ) intervals;
      available := coalesce(allowed @> p_at,false);
      fits_window := task.estimate_minutes is not null and coalesce(allowed @>
        tstzrange(p_at,p_at+make_interval(mins=>task.estimate_minutes),'[)'),false);
      if not available then reasons := array_append(reasons,'unavailable');
      elsif not fits_window and task.estimate_minutes is not null then reasons := array_append(reasons,'window-too-short'); end if;
    end if;
    if task.estimate_minutes is null then reasons := array_append(reasons,'estimate-unknown');
    elsif p_gap_minutes is not null and task.estimate_minutes>p_gap_minutes then reasons := array_append(reasons,'gap-too-short'); end if;
    result := result || jsonb_build_array(jsonb_build_object('id',task.id,'title',task.title,'version',task.version,
      'estimate_minutes',task.estimate_minutes,'is_completed',task.is_completed,'archived_at',task.archived_at,
      'rules',jsonb_build_object('version',rules.version,'waiting',coalesce(rules.waiting,false),'timezone',coalesce(rules.timezone,'UTC'),
        'windows',coalesce(rules.windows,'[]'),'dependencyIds',coalesce(to_jsonb(rules.dependency_ids),'[]')),
      'facts',jsonb_build_object('reasons',to_jsonb(reasons),'blockedDependencyIds',to_jsonb(blocked_ids),
        'actionable',not (reasons && array['waiting','dependency-blocked','unavailable','archived','completed','terminal-occurrence','window-too-short']),
        'fitsGap',case when p_gap_minutes is null then null else cardinality(reasons)=0 and fits_window end)));
  end loop;
  return jsonb_build_object('version',(select version from public.action_queue_state where user_id=auth.uid()),
    'queue',coalesce((select to_jsonb(task_ids) from public.action_queue_state where user_id=auth.uid()),'[]'::jsonb),
    'evaluatedAt',p_at,'tasks',result);
end;
$$;
revoke all on function public.action_queue_snapshot(timestamptz,integer) from public,anon;
grant execute on function public.action_queue_snapshot(timestamptz,integer) to authenticated;


