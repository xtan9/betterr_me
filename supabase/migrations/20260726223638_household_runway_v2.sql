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
    check (jsonb_typeof(attribution) = 'object'),
  created_at timestamptz not null default now()
);

create index finance_cushion_events_reporting_idx
  on public.finance_cushion_events(event_name, created_at desc);

alter table public.finance_cushion_events enable row level security;

revoke all on table public.finance_cushion_events from public, anon, authenticated;
grant insert on table public.finance_cushion_events to anon, authenticated;

create policy "Visitors can append allowlisted finance cushion events"
  on public.finance_cushion_events
  for insert
  to anon, authenticated
  with check (
    event_name in ('landing_view', 'started', 'skipped', 'completed', 'result_interaction', 'registration_clicked')
    and char_length(coalesce(step_id, '')) <= 64
    and char_length(coalesce(locale, '')) <= 16
    and not (attribution ?| array['salary', 'income', 'assets', 'expenses', 'result', 'months'])
  );

comment on table public.finance_cushion_events is
  'Write-only, amount-free Household Runway funnel analytics. Reporting uses the service role.';
