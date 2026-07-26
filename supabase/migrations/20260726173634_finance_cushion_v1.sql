-- Financial Safety Cushion V1 is intentionally a standalone, user-owned
-- input record. It has no relationship to the retired household/Money model.

create table public.finance_cushions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  liquid_resources_cents bigint not null check (liquid_resources_cents >= 0),
  monthly_essential_expenses_cents bigint not null check (monthly_essential_expenses_cents > 0),
  monthly_continuing_income_cents bigint not null default 0 check (monthly_continuing_income_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_cushions_one_per_user unique (user_id)
);

comment on table public.finance_cushions is
  'User-owned inputs for the Financial Safety Cushion planning calculation.';
comment on column public.finance_cushions.liquid_resources_cents is
  'Immediately available liquid resources, represented in the user-entered currency.';
comment on column public.finance_cushions.monthly_essential_expenses_cents is
  'Interruption-mode essential monthly expenses, represented in the user-entered currency.';
comment on column public.finance_cushions.monthly_continuing_income_cents is
  'Monthly income the user expects to continue during the planning scenario.';

alter table public.finance_cushions enable row level security;

revoke all on table public.finance_cushions from public, anon, authenticated;
grant select, insert, update on table public.finance_cushions to authenticated;

create policy "Users can view their own finance cushion"
  on public.finance_cushions
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can create their own finance cushion"
  on public.finance_cushions
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can update their own finance cushion"
  on public.finance_cushions
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create trigger finance_cushions_set_updated_at
  before update on public.finance_cushions
  for each row
  execute function public.update_updated_at_column();
