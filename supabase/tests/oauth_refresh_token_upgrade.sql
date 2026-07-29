-- Run after `supabase db reset` against a disposable local instance.
-- This transaction temporarily replaces the migrated table with its legacy
-- shape, reapplies the production migration, verifies the upgrade, then
-- restores the reset database exactly.
begin;

drop function resolve_oauth_refresh_token_context(text, text, timestamptz);
drop function rotate_oauth_refresh_token(
  text,
  text,
  timestamptz,
  text,
  timestamptz
);
drop function cleanup_oauth_refresh_token_families(timestamptz, timestamptz);

alter table oauth_refresh_tokens
  rename to oauth_refresh_tokens_after_upgrade_test;
alter index oauth_refresh_tokens_pkey
  rename to oauth_refresh_tokens_after_upgrade_test_pkey;
alter index oauth_refresh_tokens_token_hash_key
  rename to oauth_refresh_tokens_after_upgrade_test_token_hash_key;
alter index idx_refresh_tokens_user
  rename to idx_refresh_tokens_after_upgrade_test_user;
alter index idx_refresh_tokens_expires
  rename to idx_refresh_tokens_after_upgrade_test_expires;
alter index idx_refresh_tokens_family
  rename to idx_refresh_tokens_after_upgrade_test_family;

create table oauth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null,
  scopes text[] not null default '{read,write}',
  expires_at timestamptz not null,
  revoked boolean not null default false,
  replaced_by_hash text,
  created_at timestamptz not null default now(),
  client_id text
);

create index idx_refresh_tokens_user on oauth_refresh_tokens (user_id);
create index idx_refresh_tokens_expires on oauth_refresh_tokens (expires_at);
alter table oauth_refresh_tokens enable row level security;

insert into oauth_refresh_tokens (
  id,
  token_hash,
  user_id,
  scopes,
  expires_at,
  revoked,
  replaced_by_hash,
  client_id
)
values
  (
    '49210000-0000-0000-0000-000000000001',
    'legacy-root',
    '49200000-0000-0000-0000-000000000001',
    array['read', 'write'],
    '2027-01-01T00:00:00Z',
    true,
    'legacy-middle',
    'client-492'
  ),
  (
    '49210000-0000-0000-0000-000000000002',
    'legacy-middle',
    '49200000-0000-0000-0000-000000000001',
    array['read', 'write'],
    '2027-01-01T00:00:00Z',
    true,
    'legacy-leaf',
    'client-492'
  ),
  (
    '49210000-0000-0000-0000-000000000003',
    'legacy-leaf',
    '49200000-0000-0000-0000-000000000001',
    array['read', 'write'],
    '2027-01-01T00:00:00Z',
    false,
    null,
    'client-492'
  ),
  (
    '49210000-0000-0000-0000-000000000004',
    'legacy-revoked',
    '49200000-0000-0000-0000-000000000001',
    array['read'],
    '2027-01-01T00:00:00Z',
    true,
    null,
    'client-492'
  ),
  (
    '49210000-0000-0000-0000-000000000005',
    'legacy-cycle-a',
    '49200000-0000-0000-0000-000000000001',
    array['read'],
    '2027-01-01T00:00:00Z',
    true,
    'legacy-cycle-b',
    'client-492'
  ),
  (
    '49210000-0000-0000-0000-000000000006',
    'legacy-cycle-b',
    '49200000-0000-0000-0000-000000000001',
    array['read'],
    '2027-01-01T00:00:00Z',
    true,
    'legacy-cycle-a',
    'client-492'
  );

\ir ../migrations/20260728222000_deepen_oauth_refresh_tokens.sql

insert into oauth_refresh_tokens (
  token_hash,
  user_id,
  scopes,
  expires_at,
  client_id
)
values (
  'post-upgrade-default',
  '49200000-0000-0000-0000-000000000001',
  array['read'],
  '2027-01-01T00:00:00Z',
  'client-492'
);

do $$
begin
  if exists (
    select 1
    from oauth_refresh_tokens
    where token_hash in ('legacy-root', 'legacy-middle', 'legacy-leaf')
      and family_id <> '49210000-0000-0000-0000-000000000001'
  ) then
    raise exception 'legacy replacement chain was not grouped under its root';
  end if;

  if exists (
    select 1
    from oauth_refresh_tokens
    where token_hash in ('legacy-cycle-a', 'legacy-cycle-b')
      and family_id <> id
  ) then
    raise exception 'malformed legacy cycle did not receive fallback families';
  end if;

  if exists (
    select 1
    from oauth_refresh_tokens
    where revoked and revoked_at is null
  ) or exists (
    select 1
    from oauth_refresh_tokens
    where not revoked and revoked_at is not null
  ) then
    raise exception 'legacy revoked_at backfill was incorrect';
  end if;

  if not exists (
    select 1
    from oauth_refresh_tokens
    where token_hash = 'post-upgrade-default'
      and family_id is not null
      and not revoked
      and revoked_at is null
  ) then
    raise exception 'post-upgrade defaults did not produce an active family';
  end if;

  if not (
    select attnotnull
    from pg_attribute
    where attrelid = 'oauth_refresh_tokens'::regclass
      and attname = 'family_id'
      and not attisdropped
  ) then
    raise exception 'family_id is nullable after upgrade';
  end if;

  if not exists (
    select 1
    from pg_attrdef
    where adrelid = 'oauth_refresh_tokens'::regclass
      and adnum = (
        select attnum
        from pg_attribute
        where attrelid = 'oauth_refresh_tokens'::regclass
          and attname = 'family_id'
      )
      and pg_get_expr(adbin, adrelid) = 'gen_random_uuid()'
  ) then
    raise exception 'family_id default is missing after upgrade';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'oauth_refresh_tokens'::regclass
      and conname = 'oauth_refresh_tokens_revoked_at_present'
      and contype = 'c'
  ) then
    raise exception 'revoked_at consistency constraint is missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'oauth_refresh_tokens'
      and indexname = 'idx_refresh_tokens_family'
      and indexdef like '%(family_id)%'
  ) then
    raise exception 'family index is missing or targets the wrong column';
  end if;
end
$$;

rollback;
