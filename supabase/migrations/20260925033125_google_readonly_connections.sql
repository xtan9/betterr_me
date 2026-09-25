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
  unique (user_id, service)
);
alter table public.google_connection_attempts enable row level security;
revoke all on public.google_connection_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.google_connection_attempts to service_role;
