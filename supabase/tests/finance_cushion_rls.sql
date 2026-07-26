-- Run after supabase db reset --local with:
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--   -v ON_ERROR_STOP=1 -f supabase/tests/finance_cushion_rls.sql
--
-- The transaction rolls back all synthetic identities and rows. It proves
-- authenticated two-user isolation without using a service role for the
-- asserted reads or writes.

begin;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'cushion-a@example.test',
    crypt('not-used', gen_salt('bf')),
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'cushion-b@example.test',
    crypt('not-used', gen_salt('bf')),
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'finance_cushions'
      and c.relrowsecurity
  ) then
    raise exception 'finance_cushions RLS is not enabled';
  end if;

  if has_table_privilege('anon', 'public.finance_cushions', 'SELECT')
     or has_table_privilege('anon', 'public.finance_cushions', 'INSERT')
     or has_table_privilege('anon', 'public.finance_cushions', 'UPDATE') then
    raise exception 'anon privilege leaked on finance_cushions';
  end if;

  if not has_table_privilege('authenticated', 'public.finance_cushions', 'SELECT')
     or not has_table_privilege('authenticated', 'public.finance_cushions', 'INSERT')
     or not has_table_privilege('authenticated', 'public.finance_cushions', 'UPDATE') then
    raise exception 'authenticated privilege missing on finance_cushions';
  end if;

  if has_table_privilege('authenticated', 'public.finance_cushions', 'DELETE') then
    raise exception 'unexpected authenticated DELETE privilege on finance_cushions';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'finance_cushions'
  ) <> 3 then
    raise exception 'expected exactly three finance_cushions policies';
  end if;
end
$$;

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);

insert into public.finance_cushions (
  user_id,
  liquid_resources_cents,
  monthly_essential_expenses_cents,
  monthly_continuing_income_cents
)
values (
  '20000000-0000-0000-0000-000000000001',
  120000,
  30000,
  0
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);

insert into public.finance_cushions (
  user_id,
  liquid_resources_cents,
  monthly_essential_expenses_cents,
  monthly_continuing_income_cents
)
values (
  '20000000-0000-0000-0000-000000000002',
  60000,
  30000,
  0
);

-- User B sees and updates B's row.
do $$
begin
  if (select count(*) from public.finance_cushions) <> 1
     or not exists (
       select 1
       from public.finance_cushions
       where user_id = '20000000-0000-0000-0000-000000000002'
         and liquid_resources_cents = 60000
     ) then
    raise exception 'user B cannot read only user B cushion';
  end if;

  update public.finance_cushions
  set liquid_resources_cents = 65000
  where user_id = '20000000-0000-0000-0000-000000000002';

  if not exists (
    select 1
    from public.finance_cushions
    where user_id = '20000000-0000-0000-0000-000000000002'
      and liquid_resources_cents = 65000
  ) then
    raise exception 'user B cannot update own cushion';
  end if;
end
$$;

-- User B cannot create a row owned by user A.
do $$
begin
  begin
    insert into public.finance_cushions (
      user_id,
      liquid_resources_cents,
      monthly_essential_expenses_cents,
      monthly_continuing_income_cents
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      1,
      1,
      0
    );
    raise exception 'user B inserted a user A cushion';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);

-- User A cannot read or update user B's row.
do $$
declare
  affected_rows integer;
begin
  if exists (
    select 1
    from public.finance_cushions
    where user_id = '20000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'user A can read user B cushion';
  end if;

  update public.finance_cushions
  set liquid_resources_cents = 999999
  where user_id = '20000000-0000-0000-0000-000000000002';
  get diagnostics affected_rows = row_count;

  if affected_rows <> 0 then
    raise exception 'user A updated user B cushion';
  end if;

  if not exists (
    select 1
    from public.finance_cushions
    where user_id = '20000000-0000-0000-0000-000000000001'
      and liquid_resources_cents = 120000
  ) then
    raise exception 'user A cannot read own cushion';
  end if;
end
$$;

reset role;
rollback;

\echo 'PASS: finance_cushions has authenticated-only access and two-user RLS isolation'
