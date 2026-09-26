-- Provider credentials are encrypted in the application and accessible only to the server.
create table public.google_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('gmail', 'calendar')),
  revision uuid not null,
  status text not null check (status in ('disconnected', 'connected', 'reconnect', 'select-calendars')),
  email text,
  subject text,
  credential text,
  selected_calendars text[] not null default '{}',
  primary key (user_id, service),
  check (cardinality(selected_calendars) <= 20)
);
alter table public.google_connections enable row level security;
revoke all on public.google_connections from public, anon, authenticated;
grant select, insert, update, delete on public.google_connections to service_role;

create table public.google_connection_attempts (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('gmail', 'calendar')),
  revision uuid not null,
  verifier text not null,
  expires_at timestamptz not null,
  unique (user_id, service),
  foreign key (user_id, service) references public.google_connections(user_id, service) on delete cascade
);
alter table public.google_connection_attempts enable row level security;
revoke all on public.google_connection_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.google_connection_attempts to service_role;

-- Lock the connection and replace its one-time attempt in the same transaction.
create function public.google_connection_begin(p_record jsonb, p_state_hash text,
  p_verifier text, p_expires_at timestamptz, p_expected_revision uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  next_row public.google_connections;
  affected integer;
begin
  select * into next_row from jsonb_populate_record(null::public.google_connections, p_record);
  if p_expected_revision is null then
    insert into public.google_connections select next_row.* on conflict (user_id, service) do nothing;
  else
    update public.google_connections set revision = next_row.revision, status = next_row.status,
      email = next_row.email, subject = next_row.subject, credential = next_row.credential,
      selected_calendars = next_row.selected_calendars
      where user_id = next_row.user_id and service = next_row.service and revision = p_expected_revision;
  end if;
  get diagnostics affected = row_count;
  if affected = 0 then return false; end if;
  insert into public.google_connection_attempts (state_hash, user_id, service, revision, verifier, expires_at)
    values (p_state_hash, next_row.user_id, next_row.service, next_row.revision, p_verifier, p_expires_at)
    on conflict (user_id, service) do update set state_hash = excluded.state_hash,
      revision = excluded.revision, verifier = excluded.verifier, expires_at = excluded.expires_at;
  return true;
end;
$$;
revoke all on function public.google_connection_begin(jsonb, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.google_connection_begin(jsonb, text, text, timestamptz, uuid) to service_role;
