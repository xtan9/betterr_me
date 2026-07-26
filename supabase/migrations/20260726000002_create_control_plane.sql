-- Internal Control Plane. This schema deliberately has no dependency on BetterR
-- customer-domain tables, roles, profiles, sessions, or RLS policies.
create schema if not exists control_plane;

revoke all on schema control_plane from public, anon, authenticated;

create type control_plane.member_role as enum ('manager', 'agent', 'reviewer');
create type control_plane.work_status as enum ('backlog', 'active_sprint', 'done');

create table control_plane.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  role control_plane.member_role not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table control_plane.work_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 240),
  assignee_id uuid references auth.users(id) on delete set null,
  status control_plane.work_status not null default 'backlog',
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table control_plane.work_item_blockers (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references control_plane.work_items(id) on delete cascade,
  detail text not null check (char_length(trim(detail)) between 1 and 1000),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table control_plane.work_item_evidence (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references control_plane.work_items(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 160),
  url text not null check (char_length(trim(url)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table control_plane.audit_events (
  id bigint generated always as identity primary key,
  work_item_id uuid references control_plane.work_items(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (char_length(trim(action)) between 1 and 120),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index work_items_assignee_id_idx on control_plane.work_items (assignee_id);
create index work_item_blockers_work_item_id_idx on control_plane.work_item_blockers (work_item_id);
create index work_item_evidence_work_item_id_idx on control_plane.work_item_evidence (work_item_id);
create index audit_events_work_item_id_created_at_idx on control_plane.audit_events (work_item_id, created_at);

alter table control_plane.members enable row level security;
alter table control_plane.work_items enable row level security;
alter table control_plane.work_item_blockers enable row level security;
alter table control_plane.work_item_evidence enable row level security;
alter table control_plane.audit_events enable row level security;

-- RLS has intentionally no direct-access policies. All application access is
-- through the narrowly granted SECURITY DEFINER functions below.
create function control_plane.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = control_plane, pg_catalog
as $$
begin
  raise exception 'control-plane audit events are append-only';
end;
$$;

create trigger audit_events_append_only
before update or delete on control_plane.audit_events
for each row execute function control_plane.prevent_audit_mutation();

create function control_plane.require_enabled_member()
returns void
language plpgsql stable security definer
set search_path = control_plane, pg_catalog
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from control_plane.members
    where user_id = auth.uid() and enabled
  ) then
    raise exception 'enabled control-plane membership is required' using errcode = '42501';
  end if;
end;
$$;

create function control_plane.require_manager()
returns void
language plpgsql stable security definer
set search_path = control_plane, pg_catalog
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from control_plane.members
    where user_id = auth.uid() and enabled and role = 'manager'
  ) then
    raise exception 'manager role is required' using errcode = '42501';
  end if;
end;
$$;

create function control_plane.require_enabled_agent(p_assignee_id uuid)
returns void
language plpgsql stable security definer
set search_path = control_plane, pg_catalog
as $$
begin
  if p_assignee_id is not null and not exists (
    select 1 from control_plane.members
    where user_id = p_assignee_id and enabled and role = 'agent'
  ) then
    raise exception 'assignee must be an enabled agent' using errcode = '23514';
  end if;
end;
$$;

create function control_plane.list_members()
returns table(user_id uuid, display_name text, role control_plane.member_role)
language plpgsql stable security definer
set search_path = control_plane, pg_catalog
as $$
begin
  perform control_plane.require_enabled_member();
  return query
    select m.user_id, m.display_name, m.role
    from control_plane.members m
    where m.enabled
    order by m.display_name;
end;
$$;

create function control_plane.list_work_items()
returns table(
  id uuid, title text, assignee_id uuid, status control_plane.work_status,
  lease_expires_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer
set search_path = control_plane, pg_catalog
as $$
begin
  perform control_plane.require_enabled_member();
  return query
    select w.id, w.title, w.assignee_id, w.status, w.lease_expires_at, w.created_at, w.updated_at
    from control_plane.work_items w
    order by w.updated_at desc, w.id;
end;
$$;

create function control_plane.create_work_item(
  p_title text, p_assignee_id uuid default null, p_lease_expires_at timestamptz default null,
  p_blockers text[] default '{}', p_evidence_urls text[] default '{}'
)
returns control_plane.work_items
language plpgsql security definer
set search_path = control_plane, pg_catalog
as $$
declare
  result control_plane.work_items;
  blocker text;
  evidence_url text;
begin
  perform control_plane.require_manager();
  perform control_plane.require_enabled_agent(p_assignee_id);
  insert into control_plane.work_items (title, assignee_id, lease_expires_at)
  values (trim(p_title), p_assignee_id, p_lease_expires_at)
  returning * into result;
  foreach blocker in array coalesce(p_blockers, '{}') loop
    if length(trim(blocker)) > 0 then
      insert into control_plane.work_item_blockers (work_item_id, detail) values (result.id, trim(blocker));
    end if;
  end loop;
  foreach evidence_url in array coalesce(p_evidence_urls, '{}') loop
    if length(trim(evidence_url)) > 0 then
      insert into control_plane.work_item_evidence (work_item_id, label, url)
      values (result.id, trim(evidence_url), trim(evidence_url));
    end if;
  end loop;
  insert into control_plane.audit_events (work_item_id, actor_id, action, payload)
  values (result.id, auth.uid(), 'work_item.created', jsonb_build_object(
    'title', result.title, 'assignee_id', result.assignee_id,
    'blocker_count', cardinality(coalesce(p_blockers, '{}')),
    'evidence_count', cardinality(coalesce(p_evidence_urls, '{}'))
  ));
  return result;
end;
$$;

create function control_plane.assign_work_item(
  p_work_item_id uuid, p_assignee_id uuid default null, p_lease_expires_at timestamptz default null
)
returns control_plane.work_items
language plpgsql security definer
set search_path = control_plane, pg_catalog
as $$
declare result control_plane.work_items;
begin
  perform control_plane.require_manager();
  perform control_plane.require_enabled_agent(p_assignee_id);
  update control_plane.work_items
  set assignee_id = p_assignee_id, lease_expires_at = p_lease_expires_at, updated_at = now()
  where id = p_work_item_id
  returning * into result;
  if not found then raise exception 'work item not found' using errcode = 'P0002'; end if;
  insert into control_plane.audit_events (work_item_id, actor_id, action, payload)
  values (result.id, auth.uid(), 'work_item.assigned', jsonb_build_object(
    'assignee_id', result.assignee_id, 'lease_expires_at', result.lease_expires_at
  ));
  return result;
end;
$$;

create function control_plane.transition_work_item(p_work_item_id uuid, p_to_status control_plane.work_status)
returns control_plane.work_items
language plpgsql security definer
set search_path = control_plane, pg_catalog
as $$
declare result control_plane.work_items;
begin
  perform control_plane.require_manager();
  select * into result from control_plane.work_items where id = p_work_item_id for update;
  if not found then raise exception 'work item not found' using errcode = 'P0002'; end if;
  if not ((result.status = 'backlog' and p_to_status = 'active_sprint')
       or (result.status = 'active_sprint' and p_to_status = 'done')) then
    raise exception 'invalid state transition' using errcode = '23514';
  end if;
  update control_plane.work_items set status = p_to_status, updated_at = now()
  where id = result.id returning * into result;
  insert into control_plane.audit_events (work_item_id, actor_id, action, payload)
  values (result.id, auth.uid(), 'work_item.transitioned', jsonb_build_object('to', result.status));
  return result;
end;
$$;

revoke all on all tables in schema control_plane from public, anon, authenticated;
revoke all on all sequences in schema control_plane from public, anon, authenticated;
revoke all on all functions in schema control_plane from public, anon, authenticated;
alter default privileges in schema control_plane revoke all on tables from public, anon, authenticated;
alter default privileges in schema control_plane revoke all on sequences from public, anon, authenticated;
alter default privileges in schema control_plane revoke all on functions from public, anon, authenticated;

-- Only these public-schema wrappers are exposed through PostgREST. They have
-- primitive signatures so callers never need USAGE on control_plane or its types.
create function public.control_plane_list_members()
returns table(user_id uuid, display_name text, role text)
language sql stable security definer
set search_path = pg_catalog
as $$
  select m.user_id, m.display_name, m.role::text
  from control_plane.list_members() m;
$$;

create function public.control_plane_list_work_items()
returns table(
  id uuid, title text, assignee_id uuid, status text,
  lease_expires_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog
as $$
  select w.id, w.title, w.assignee_id, w.status::text,
         w.lease_expires_at, w.created_at, w.updated_at
  from control_plane.list_work_items() w;
$$;

create function public.control_plane_create_work_item(
  p_title text, p_assignee_id uuid default null, p_lease_expires_at timestamptz default null,
  p_blockers text[] default '{}', p_evidence_urls text[] default '{}'
)
returns table(id uuid, title text, assignee_id uuid, status text, lease_expires_at timestamptz, created_at timestamptz, updated_at timestamptz)
language sql security definer
set search_path = pg_catalog
as $$
  select w.id, w.title, w.assignee_id, w.status::text,
         w.lease_expires_at, w.created_at, w.updated_at
  from control_plane.create_work_item(p_title, p_assignee_id, p_lease_expires_at, p_blockers, p_evidence_urls) w;
$$;

create function public.control_plane_assign_work_item(
  p_work_item_id uuid, p_assignee_id uuid default null, p_lease_expires_at timestamptz default null
)
returns table(id uuid, title text, assignee_id uuid, status text, lease_expires_at timestamptz, created_at timestamptz, updated_at timestamptz)
language sql security definer
set search_path = pg_catalog
as $$
  select w.id, w.title, w.assignee_id, w.status::text,
         w.lease_expires_at, w.created_at, w.updated_at
  from control_plane.assign_work_item(p_work_item_id, p_assignee_id, p_lease_expires_at) w;
$$;

create function public.control_plane_transition_work_item(p_work_item_id uuid, p_to_status text)
returns table(id uuid, title text, assignee_id uuid, status text, lease_expires_at timestamptz, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog
as $$
begin
  if p_to_status not in ('backlog', 'active_sprint', 'done') then
    raise exception 'invalid work status' using errcode = '23514';
  end if;
  return query
    select w.id, w.title, w.assignee_id, w.status::text,
           w.lease_expires_at, w.created_at, w.updated_at
    from control_plane.transition_work_item(p_work_item_id, p_to_status::control_plane.work_status) w;
end;
$$;

revoke all on function public.control_plane_list_members() from public, anon, authenticated;
revoke all on function public.control_plane_list_work_items() from public, anon, authenticated;
revoke all on function public.control_plane_create_work_item(text, uuid, timestamptz, text[], text[]) from public, anon, authenticated;
revoke all on function public.control_plane_assign_work_item(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.control_plane_transition_work_item(uuid, text) from public, anon, authenticated;
grant execute on function public.control_plane_list_members() to authenticated;
grant execute on function public.control_plane_list_work_items() to authenticated;
grant execute on function public.control_plane_create_work_item(text, uuid, timestamptz, text[], text[]) to authenticated;
grant execute on function public.control_plane_assign_work_item(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.control_plane_transition_work_item(uuid, text) to authenticated;
