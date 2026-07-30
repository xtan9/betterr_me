-- Run after `supabase db reset` against the disposable local instance:
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--   -v ON_ERROR_STOP=1 -f supabase/tests/oauth_refresh_token_lifecycle.sql
--
-- dblink supplies independent database sessions so these assertions exercise
-- the public rotation RPC's real transaction locks rather than programmed
-- client responses.
create extension if not exists dblink;

\set test_user_id '49200000-0000-0000-0000-000000000001'
\set reuse_family_id '49200000-0000-0000-0000-000000000002'
\set same_token_family_id '49200000-0000-0000-0000-000000000003'
\set aged_token_family_id '49200000-0000-0000-0000-000000000004'
\set successful_family_id '49200000-0000-0000-0000-000000000005'
\set rollback_family_id '49200000-0000-0000-0000-000000000006'

delete from auth.users where id = :'test_user_id';

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
values (
  :'test_user_id',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'oauth-refresh-lifecycle@example.test',
  crypt('not-used', gen_salt('bf')),
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

-- All lifecycle RPCs are service-role-only SECURITY DEFINER boundaries.
do $$
declare
  function_oid regprocedure;
  grantee text;
begin
  foreach function_oid in array array[
    'resolve_oauth_refresh_token_context(text,text,timestamptz)'::regprocedure,
    'rotate_oauth_refresh_token(text,text,timestamptz,text,timestamptz)'::regprocedure,
    'cleanup_oauth_refresh_token_families(timestamptz,timestamptz)'::regprocedure
  ] loop
    if not (
      select prosecdef
      from pg_proc
      where oid = function_oid
    ) then
      raise exception '% is not SECURITY DEFINER', function_oid;
    end if;

    foreach grantee in array array['anon', 'authenticated'] loop
      if has_function_privilege(grantee, function_oid, 'EXECUTE') then
        raise exception '% can execute %', grantee, function_oid;
      end if;
    end loop;

    if exists (
      select 1
      from pg_proc
      cross join lateral aclexplode(
        coalesce(proacl, acldefault('f', proowner))
      ) as privilege
      where oid = function_oid
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC can execute %', function_oid;
    end if;

    if not has_function_privilege('service_role', function_oid, 'EXECUTE') then
      raise exception 'service_role cannot execute %', function_oid;
    end if;
  end loop;
end
$$;

set role service_role;
do $$
declare
  result text;
begin
  select outcome into result
  from resolve_oauth_refresh_token_context(
    'acl-permitted-unknown',
    'client-492',
    '2026-07-28T12:00:00Z'
  );
  if result <> 'invalid_token' then
    raise exception 'service_role execution returned unexpected outcome: %',
      result;
  end if;
end
$$;
reset role;

-- The public resolver returns exact context and rejection outcomes without
-- changing any refresh-token row.
insert into oauth_refresh_tokens (
  token_hash,
  family_id,
  client_id,
  user_id,
  scopes,
  expires_at,
  revoked,
  revoked_at,
  replaced_by_hash
)
values
  (
    'resolver-valid',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    array['read', 'write'],
    '2027-01-01T00:00:00Z',
    false,
    null,
    null
  ),
  (
    'resolver-reused',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    array['read'],
    '2027-01-01T00:00:00Z',
    true,
    '2026-07-27T00:00:00Z',
    'resolver-reused-replacement'
  ),
  (
    'resolver-mismatched',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    array['read'],
    '2027-01-01T00:00:00Z',
    false,
    null,
    null
  ),
  (
    'resolver-expired',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    array['read'],
    '2026-07-28T12:00:00Z',
    false,
    null,
    null
  ),
  (
    'resolver-revoked',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    array['read'],
    '2027-01-01T00:00:00Z',
    true,
    '2026-07-27T00:00:00Z',
    null
  );

create temporary table resolver_rows_before as
select *
from oauth_refresh_tokens
where token_hash like 'resolver-%';

create temporary table resolver_outcomes (
  case_name text primary key,
  outcome text not null,
  client_id text,
  user_id uuid,
  scopes text[]
);

insert into resolver_outcomes
select 'valid', *
from resolve_oauth_refresh_token_context(
  'resolver-valid',
  'client-492',
  '2026-07-28T12:00:00Z'
);
insert into resolver_outcomes
select 'invalid', *
from resolve_oauth_refresh_token_context(
  'resolver-unknown',
  'client-492',
  '2026-07-28T12:00:00Z'
);
insert into resolver_outcomes
select 'reused', *
from resolve_oauth_refresh_token_context(
  'resolver-reused',
  'client-492',
  '2026-07-28T12:00:00Z'
);
insert into resolver_outcomes
select 'mismatched', *
from resolve_oauth_refresh_token_context(
  'resolver-mismatched',
  'wrong-client',
  '2026-07-28T12:00:00Z'
);
insert into resolver_outcomes
select 'expired', *
from resolve_oauth_refresh_token_context(
  'resolver-expired',
  'client-492',
  '2026-07-28T12:00:00Z'
);
insert into resolver_outcomes
select 'revoked', *
from resolve_oauth_refresh_token_context(
  'resolver-revoked',
  'client-492',
  '2026-07-28T12:00:00Z'
);

do $$
begin
  if (
    select jsonb_object_agg(case_name, outcome order by case_name)
    from resolver_outcomes
  ) <> '{
    "expired": "expired_token",
    "invalid": "invalid_token",
    "mismatched": "mismatched_context",
    "reused": "reused_token",
    "revoked": "revoked_token",
    "valid": "valid_token"
  }'::jsonb then
    raise exception 'resolver decision table returned unexpected outcomes: %',
      (select jsonb_object_agg(case_name, outcome) from resolver_outcomes);
  end if;

  if not exists (
    select 1
    from resolver_outcomes
    where case_name = 'valid'
      and client_id = 'client-492'
      and user_id = '49200000-0000-0000-0000-000000000001'
      and scopes = array['read', 'write']
  ) then
    raise exception 'resolver did not return the valid token context';
  end if;

  if exists (
    select client_id, user_id, scopes
    from resolver_outcomes
    where case_name <> 'valid'
    except
    select null::text, null::uuid, null::text[]
  ) then
    raise exception 'resolver exposed context for a rejected token';
  end if;

  if exists (
    (select * from resolver_rows_before
      except
     select * from oauth_refresh_tokens where token_hash like 'resolver-%')
    union all
    (select * from oauth_refresh_tokens where token_hash like 'resolver-%'
      except
     select * from resolver_rows_before)
  ) then
    raise exception 'resolver changed refresh-token persistence';
  end if;
end
$$;

-- Rejected atomic rotations return their exact outcome and do not insert a
-- replacement or change any token/family state.
create temporary table rejected_rotation_rows_before as
select *
from oauth_refresh_tokens;

create temporary table rejected_rotation_outcomes (
  case_name text primary key,
  outcome text not null
);

insert into rejected_rotation_outcomes
select 'invalid', outcome
from rotate_oauth_refresh_token(
  'rotation-unknown',
  'rejected-invalid-replacement',
  '2027-01-01T00:00:00Z',
  'client-492',
  '2026-07-28T12:00:00Z'
);
insert into rejected_rotation_outcomes
select 'mismatched', outcome
from rotate_oauth_refresh_token(
  'resolver-mismatched',
  'rejected-mismatched-replacement',
  '2027-01-01T00:00:00Z',
  'wrong-client',
  '2026-07-28T12:00:00Z'
);
insert into rejected_rotation_outcomes
select 'expired', outcome
from rotate_oauth_refresh_token(
  'resolver-expired',
  'rejected-expired-replacement',
  '2027-01-01T00:00:00Z',
  'client-492',
  '2026-07-28T12:00:00Z'
);
insert into rejected_rotation_outcomes
select 'revoked', outcome
from rotate_oauth_refresh_token(
  'resolver-revoked',
  'rejected-revoked-replacement',
  '2027-01-01T00:00:00Z',
  'client-492',
  '2026-07-28T12:00:00Z'
);

do $$
begin
  if (
    select jsonb_object_agg(case_name, outcome order by case_name)
    from rejected_rotation_outcomes
  ) <> '{
    "expired": "expired_token",
    "invalid": "invalid_token",
    "mismatched": "mismatched_context",
    "revoked": "revoked_token"
  }'::jsonb then
    raise exception 'rotation decision table returned unexpected outcomes: %',
      (select jsonb_object_agg(case_name, outcome)
       from rejected_rotation_outcomes);
  end if;

  if exists (
    (select * from rejected_rotation_rows_before
      except
     select * from oauth_refresh_tokens)
    union all
    (select * from oauth_refresh_tokens
      except
     select * from rejected_rotation_rows_before)
  ) then
    raise exception 'rejected rotation changed refresh-token persistence';
  end if;
end
$$;

-- A successful rotation persists one exact replacement, links and revokes the
-- original, and returns the context from that authoritative write.
insert into oauth_refresh_tokens (
  token_hash,
  family_id,
  client_id,
  user_id,
  scopes,
  expires_at,
  revoked,
  revoked_at,
  replaced_by_hash
)
values (
  'successful-current',
  :'successful_family_id',
  'client-492',
  :'test_user_id',
  array['read', 'write'],
  '2027-01-01T00:00:00Z',
  false,
  null,
  null
);

do $$
declare
  result record;
begin
  select * into result
  from rotate_oauth_refresh_token(
    'successful-current',
    'successful-replacement',
    '2027-01-24T12:00:00Z',
    'client-492',
    '2026-07-28T12:00:00Z'
  );

  if result.outcome <> 'rotated'
    or result.client_id <> 'client-492'
    or result.user_id <> '49200000-0000-0000-0000-000000000001'
    or result.scopes <> array['read', 'write'] then
    raise exception 'successful rotation returned incorrect context: %',
      row_to_json(result);
  end if;

  if not exists (
    select 1
    from oauth_refresh_tokens
    where token_hash = 'successful-current'
      and family_id = '49200000-0000-0000-0000-000000000005'
      and client_id = 'client-492'
      and user_id = '49200000-0000-0000-0000-000000000001'
      and scopes = array['read', 'write']
      and expires_at = '2027-01-01T00:00:00Z'
      and revoked
      and revoked_at is not null
      and replaced_by_hash = 'successful-replacement'
  ) then
    raise exception 'successful rotation did not persist the exact old state';
  end if;

  if not exists (
    select 1
    from oauth_refresh_tokens
    where token_hash = 'successful-replacement'
      and family_id = '49200000-0000-0000-0000-000000000005'
      and client_id = 'client-492'
      and user_id = '49200000-0000-0000-0000-000000000001'
      and scopes = array['read', 'write']
      and expires_at = '2027-01-24T12:00:00Z'
      and not revoked
      and revoked_at is null
      and replaced_by_hash is null
  ) then
    raise exception 'successful rotation did not persist the exact replacement';
  end if;

  if (
    select count(*)
    from oauth_refresh_tokens
    where family_id = '49200000-0000-0000-0000-000000000005'
  ) <> 2 then
    raise exception 'successful rotation persisted an unexpected family size';
  end if;
end
$$;

-- A deterministic replacement insert failure rolls back the entire function:
-- the current token remains active and no partial link is retained.
insert into oauth_refresh_tokens (
  token_hash,
  family_id,
  client_id,
  user_id,
  scopes,
  expires_at
)
values
  (
    'rollback-current',
    :'rollback_family_id',
    'client-492',
    :'test_user_id',
    array['read'],
    '2027-01-01T00:00:00Z'
  ),
  (
    'duplicate-replacement',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    array['read'],
    '2027-01-01T00:00:00Z'
  );

do $$
declare
  resolution_outcome text;
begin
  begin
    perform rotate_oauth_refresh_token(
      'rollback-current',
      'duplicate-replacement',
      '2027-01-24T12:00:00Z',
      'client-492',
      '2026-07-28T12:00:00Z'
    );
    raise exception 'duplicate replacement unexpectedly rotated';
  exception
    when unique_violation then null;
  end;

  if not exists (
    select 1
    from oauth_refresh_tokens
    where token_hash = 'rollback-current'
      and family_id = '49200000-0000-0000-0000-000000000006'
      and not revoked
      and revoked_at is null
      and replaced_by_hash is null
  ) then
    raise exception 'replacement failure left a partial current-token update';
  end if;

  if (
    select count(*)
    from oauth_refresh_tokens
    where token_hash = 'duplicate-replacement'
  ) <> 1 then
    raise exception 'replacement failure changed duplicate token persistence';
  end if;

  select outcome into resolution_outcome
  from resolve_oauth_refresh_token_context(
    'rollback-current',
    'client-492',
    '2026-07-28T12:00:00Z'
  );
  if resolution_outcome <> 'valid_token' then
    raise exception 'replacement failure made the current token unusable: %',
      resolution_outcome;
  end if;
end
$$;

insert into oauth_refresh_tokens (
  token_hash,
  family_id,
  client_id,
  user_id,
  scopes,
  expires_at,
  revoked,
  revoked_at,
  replaced_by_hash
)
values
  (
    'reuse-race-old',
    :'reuse_family_id',
    'client-492',
    :'test_user_id',
    array['read', 'write'],
    now() + interval '180 days',
    true,
    now(),
    'reuse-race-current'
  ),
  (
    'reuse-race-current',
    :'reuse_family_id',
    'client-492',
    :'test_user_id',
    array['read', 'write'],
    now() + interval '180 days',
    false,
    null,
    null
  ),
  (
    'same-token-current',
    :'same_token_family_id',
    'client-492',
    :'test_user_id',
    array['read', 'write'],
    now() + interval '180 days',
    false,
    null,
    null
  );

select dblink_connect(
  'refresh_a',
  'hostaddr=' || host(inet_server_addr())
    || ' port=' || inet_server_port()
    || ' dbname=' || current_database()
    || ' user=postgres password=postgres'
);
select dblink_connect(
  'refresh_b',
  'hostaddr=' || host(inet_server_addr())
    || ' port=' || inet_server_port()
    || ' dbname=' || current_database()
    || ' user=postgres password=postgres'
);

-- Hold the family lock until both calls are in flight. Whichever RPC acquires
-- it first, the reuse response must leave no descendant usable.
select pg_advisory_lock(
  hashtextextended(:'reuse_family_id', 0)
);
select dblink_send_query(
  'refresh_a',
  $query$
    select outcome
    from rotate_oauth_refresh_token(
      'reuse-race-old',
      'unused-reuse-replacement',
      now() + interval '180 days',
      'client-492',
      now()
    )
  $query$
);
select dblink_send_query(
  'refresh_b',
  $query$
    select outcome
    from rotate_oauth_refresh_token(
      'reuse-race-current',
      'reuse-race-descendant',
      now() + interval '180 days',
      'client-492',
      now()
    )
  $query$
);
select pg_advisory_unlock(
  hashtextextended(:'reuse_family_id', 0)
);

create temporary table reuse_race_outcomes (
  call_name text primary key,
  outcome text not null
);
insert into reuse_race_outcomes
select 'old', outcome
from dblink_get_result('refresh_a') as result(outcome text);
insert into reuse_race_outcomes
select 'current', outcome
from dblink_get_result('refresh_b') as result(outcome text);

do $$
begin
  if (select outcome from reuse_race_outcomes where call_name = 'old')
      <> 'reused_token' then
    raise exception 'old family member did not report reuse: %',
      (select jsonb_object_agg(call_name, outcome) from reuse_race_outcomes);
  end if;

  if (select outcome from reuse_race_outcomes where call_name = 'current')
      not in ('rotated', 'revoked_token') then
    raise exception 'current member returned an unexpected race outcome: %',
      (select jsonb_object_agg(call_name, outcome) from reuse_race_outcomes);
  end if;

  if exists (
    select 1
    from oauth_refresh_tokens
    where family_id = '49200000-0000-0000-0000-000000000002'
      and not revoked
  ) then
    raise exception 'reuse race left a token-family descendant usable';
  end if;
end
$$;

-- Two attempts using the same current member serialize: exactly one rotates
-- and the waiter detects reuse. The family response then revokes the winner's
-- replacement as well.
select pg_advisory_lock(
  hashtextextended(:'same_token_family_id', 0)
);
select dblink_send_query(
  'refresh_a',
  $query$
    select outcome
    from rotate_oauth_refresh_token(
      'same-token-current',
      'same-token-descendant-a',
      now() + interval '180 days',
      'client-492',
      now()
    )
  $query$
);
select dblink_send_query(
  'refresh_b',
  $query$
    select outcome
    from rotate_oauth_refresh_token(
      'same-token-current',
      'same-token-descendant-b',
      now() + interval '180 days',
      'client-492',
      now()
    )
  $query$
);
select pg_advisory_unlock(
  hashtextextended(:'same_token_family_id', 0)
);

create temporary table same_token_outcomes (outcome text not null);
insert into same_token_outcomes
select outcome
from dblink_get_result('refresh_a') as result(outcome text);
insert into same_token_outcomes
select outcome
from dblink_get_result('refresh_b') as result(outcome text);

do $$
begin
  if (select count(*) from same_token_outcomes where outcome = 'rotated') <> 1
    or (select count(*) from same_token_outcomes where outcome = 'reused_token')
      <> 1 then
    raise exception 'concurrent current-token outcomes were not serialized: %',
      (select jsonb_agg(outcome order by outcome) from same_token_outcomes);
  end if;

  if exists (
    select 1
    from oauth_refresh_tokens
    where family_id = '49200000-0000-0000-0000-000000000003'
      and not revoked
  ) then
    raise exception 'concurrent reuse response left a family member usable';
  end if;
end
$$;

-- A token's age must not shorten the seven-day evidence window that begins
-- when it is rotated. Cleanup immediately after rotating an aged token must
-- retain it so a replay can still revoke the replacement family.
insert into oauth_refresh_tokens (
  token_hash,
  family_id,
  client_id,
  user_id,
  scopes,
  expires_at,
  created_at
)
values (
  'aged-token-current',
  :'aged_token_family_id',
  'client-492',
  :'test_user_id',
  array['read', 'write'],
  now() + interval '180 days',
  now() - interval '8 days'
);

do $$
declare
  rotation_outcome text;
  reuse_outcome text;
begin
  select outcome into rotation_outcome
  from rotate_oauth_refresh_token(
    'aged-token-current',
    'aged-token-replacement',
    now() + interval '180 days',
    'client-492',
    now()
  );

  if rotation_outcome <> 'rotated' then
    raise exception 'aged token did not rotate: %', rotation_outcome;
  end if;

  update oauth_refresh_tokens
  set revoked_at = now() - interval '8 days'
  where token_hash = 'aged-token-current';

  perform cleanup_oauth_refresh_token_families(
    now() - interval '1 day',
    now() - interval '7 days'
  );

  select outcome into reuse_outcome
  from rotate_oauth_refresh_token(
    'aged-token-current',
    'unused-aged-replacement',
    now() + interval '180 days',
    'client-492',
    now()
  );

  if reuse_outcome <> 'reused_token' then
    raise exception 'aged-token replay was not detected after cleanup: %',
      reuse_outcome;
  end if;

  if not exists (
    select 1
    from oauth_refresh_tokens
    where token_hash = 'aged-token-replacement'
      and family_id = '49200000-0000-0000-0000-000000000004'
      and revoked
      and revoked_at is not null
  ) then
    raise exception 'aged-token replay did not revoke its replacement';
  end if;
end
$$;

-- Cleanup follows the documented row predicates: expiry has a one-day grace
-- period, while revocation retains the row for seven days for reuse evidence.
insert into oauth_refresh_tokens (
  token_hash,
  family_id,
  client_id,
  user_id,
  expires_at,
  revoked,
  revoked_at,
  created_at
)
values
  (
    'cleanup-expired',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    now() - interval '2 days',
    false,
    null,
    now()
  ),
  (
    'cleanup-old-revoked',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    now() + interval '180 days',
    true,
    now() - interval '8 days',
    now()
  ),
  (
    'cleanup-recent-revoked',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    now() + interval '180 days',
    true,
    now() - interval '6 days',
    now() - interval '8 days'
  ),
  (
    'cleanup-expired-recent-revoked',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    now() - interval '2 days',
    true,
    now() - interval '1 day',
    now() - interval '180 days'
  ),
  (
    'cleanup-current',
    gen_random_uuid(),
    'client-492',
    :'test_user_id',
    now() + interval '180 days',
    false,
    null,
    now() - interval '8 days'
  );

select cleanup_oauth_refresh_token_families(
  now() - interval '1 day',
  now() - interval '7 days'
);

do $$
begin
  if exists (
    select 1
    from oauth_refresh_tokens
    where token_hash in ('cleanup-expired', 'cleanup-old-revoked')
  ) then
    raise exception 'cleanup retained a row past its documented cutoff';
  end if;

  if (
    select array_agg(token_hash order by token_hash)
    from oauth_refresh_tokens
    where token_hash like 'cleanup-%'
  ) <> array[
    'cleanup-current',
    'cleanup-expired-recent-revoked',
    'cleanup-recent-revoked'
  ] then
    raise exception 'cleanup removed a row inside its documented retention';
  end if;
end
$$;

select dblink_disconnect('refresh_a');
select dblink_disconnect('refresh_b');
delete from auth.users where id = :'test_user_id';
