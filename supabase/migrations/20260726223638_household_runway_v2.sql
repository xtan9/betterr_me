-- Household Runway V2 evolves the deployed user-owned Cushion record without
-- reviving the retired Money/household model or deleting existing V1 inputs.

alter table public.finance_cushions
  add column answers jsonb,
  add column latest_result jsonb,
  add column model_version text not null default '1.0.0',
  add column status text not null default 'completed'
    check (status in ('in_progress', 'completed')),
  add column country text,
  add column region text,
  add column currency text,
  add column attribution jsonb not null default '{}'::jsonb,
  add column completed_at timestamptz;

comment on column public.finance_cushions.answers is
  'Versioned Household Runway answers. Null identifies a retained V1 record.';
comment on column public.finance_cushions.latest_result is
  'Server-recalculated latest scenario result; never trusted from client input.';
comment on column public.finance_cushions.attribution is
  'Non-financial acquisition metadata only; values are allowlisted by the API.';

create table public.finance_cushion_snapshots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.finance_cushions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null,
  trigger text not null check (trigger in ('completed', 'updated', 'imported')),
  scenario text not null,
  months_covered numeric,
  sustainable boolean not null,
  result jsonb not null,
  model_version text not null,
  created_at timestamptz not null default now(),
  constraint finance_cushion_snapshots_action_once unique (plan_id, action_id)
);

create index finance_cushion_snapshots_user_created_idx
  on public.finance_cushion_snapshots(user_id, created_at desc);

alter table public.finance_cushion_snapshots enable row level security;

revoke all on table public.finance_cushion_snapshots from public, anon, authenticated;
grant select, insert on table public.finance_cushion_snapshots to authenticated;

create policy "Users can view their own finance cushion snapshots"
  on public.finance_cushion_snapshots
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can append their own finance cushion snapshots"
  on public.finance_cushion_snapshots
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
    and exists (
      select 1 from public.finance_cushions plan
      where plan.id = plan_id and plan.user_id = (select auth.uid())
    )
  );

comment on table public.finance_cushion_snapshots is
  'Append-only user-owned Household Runway completion and update history.';

create table public.finance_cushion_events (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique,
  session_id uuid not null,
  event_name text not null check (event_name in (
    'landing_view', 'started', 'skipped', 'completed', 'result_interaction', 'registration_clicked'
  )),
  step_id text,
  locale text,
  attribution jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(attribution) = 'object'
      and attribution - array['video', 'campaign', 'cta', 'landing_variant', 'language']::text[] = '{}'::jsonb
      and (not (attribution ? 'video') or jsonb_typeof(attribution -> 'video') = 'string')
      and (not (attribution ? 'campaign') or jsonb_typeof(attribution -> 'campaign') = 'string')
      and (not (attribution ? 'cta') or jsonb_typeof(attribution -> 'cta') = 'string')
      and (not (attribution ? 'landing_variant') or jsonb_typeof(attribution -> 'landing_variant') = 'string')
      and (not (attribution ? 'language') or jsonb_typeof(attribution -> 'language') = 'string')
      and char_length(coalesce(attribution ->> 'video', '')) <= 120
      and char_length(coalesce(attribution ->> 'campaign', '')) <= 120
      and char_length(coalesce(attribution ->> 'cta', '')) <= 120
      and char_length(coalesce(attribution ->> 'landing_variant', '')) <= 120
      and char_length(coalesce(attribution ->> 'language', '')) <= 20
    ),
  created_at timestamptz not null default now()
);

create index finance_cushion_events_reporting_idx
  on public.finance_cushion_events(event_name, created_at desc);

alter table public.finance_cushion_events enable row level security;

revoke all on table public.finance_cushion_events from public, anon, authenticated;

create table public.finance_cushion_event_rate_limits (
  client_key text primary key check (char_length(client_key) = 64),
  window_started_at timestamptz not null default now(),
  event_count integer not null default 0 check (event_count >= 0)
);

alter table public.finance_cushion_event_rate_limits enable row level security;
revoke all on table public.finance_cushion_event_rate_limits from public, anon, authenticated;

create or replace function public.record_finance_cushion_event(
  p_client_key text,
  p_action_id uuid,
  p_session_id uuid,
  p_event_name text,
  p_step_id text,
  p_locale text,
  p_attribution jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  insert into public.finance_cushion_event_rate_limits as limits (
    client_key, window_started_at, event_count
  )
  values (p_client_key, now(), 1)
  on conflict (client_key) do update
  set
    window_started_at = case
      when limits.window_started_at <= now() - interval '1 minute' then now()
      else limits.window_started_at
    end,
    event_count = case
      when limits.window_started_at <= now() - interval '1 minute' then 1
      else limits.event_count + 1
    end
  returning event_count <= 60 into allowed;

  if not allowed then
    return false;
  end if;

  insert into public.finance_cushion_events (
    action_id, session_id, event_name, step_id, locale, attribution
  )
  values (
    p_action_id, p_session_id, p_event_name, p_step_id, p_locale, p_attribution
  )
  on conflict (action_id) do nothing;

  return true;
end;
$$;

revoke all on function public.record_finance_cushion_event(text, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_finance_cushion_event(text, uuid, uuid, text, text, text, jsonb) to service_role;

comment on table public.finance_cushion_events is
  'Server-only, amount-free Household Runway funnel analytics. App roles have no direct access.';
