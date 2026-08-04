-- Run after `supabase db reset --local` against the local instance.
-- constrained-sql-fixture: true
-- Exercises Project creation through the normalized, owner-scoped RPC:
-- defaults, invalid values, ownership masking, and concurrent placement.

-- Remove residue from an interrupted run before creating disposable identities.
delete from public.projects
where user_id in (
  '65100000-0000-0000-0000-000000000001',
  '65100000-0000-0000-0000-000000000002'
);

do $$
begin
  begin
    perform public.sql_fixture_delete_auth_user(
      '65100000-0000-0000-0000-000000000001'
    );
  exception when others then null;
  end;
  begin
    perform public.sql_fixture_delete_auth_user(
      '65100000-0000-0000-0000-000000000002'
    );
  exception when others then null;
  end;
end
$$;

select public.sql_fixture_create_auth_user(
  '65100000-0000-0000-0000-000000000001',
  'project-creation-owner@example.test'
);
select public.sql_fixture_create_auth_user(
  '65100000-0000-0000-0000-000000000002',
  'project-creation-other@example.test'
);

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.create_project_atomically(uuid,text,text,text,text,double precision)'::regprocedure
  ) into function_definition;

  if position('PG_ADVISORY_XACT_LOCK' in upper(function_definition)) = 0 then
    raise exception 'project creation does not lock append placement';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.create_project_atomically(uuid,text,text,text,text,double precision)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.create_project_atomically(uuid,text,text,text,text,double precision)',
    'EXECUTE'
  ) then
    raise exception 'trusted application roles cannot execute project creation';
  end if;
  if has_function_privilege(
    'anon',
    'public.create_project_atomically(uuid,text,text,text,text,double precision)',
    'EXECUTE'
  ) then
    raise exception 'anonymous project creation execute privilege leaked';
  end if;
  if exists (
    select 1
    from pg_proc
    where oid = 'public.create_project_atomically(uuid,text,text,text,text,double precision)'::regprocedure
      and prosecdef
  ) then
    raise exception 'project creation must remain SECURITY INVOKER';
  end if;
end
$$;

select set_config(
  'request.jwt.claim.sub',
  '65100000-0000-0000-0000-000000000001',
  false
);
set role authenticated;

do $$
declare
  outcome jsonb;
  project_id uuid;
begin
  outcome := public.create_project_atomically(
    '65100000-0000-0000-0000-000000000001',
    '  First project  ',
    'personal',
    'blue',
    'active',
    null
  );
  if outcome->>'type' <> 'created'
    or outcome->'project'->>'name' <> 'First project'
    or outcome->'project'->>'section' <> 'personal'
    or outcome->'project'->>'color' <> 'blue'
    or outcome->'project'->>'status' <> 'active'
    or (outcome->'project'->>'sort_order')::double precision <> 65536.0 then
    raise exception 'normalized project creation was incorrect: %', outcome;
  end if;
  project_id := (outcome->'project'->>'id')::uuid;

  outcome := public.create_project_atomically(
    '65100000-0000-0000-0000-000000000001',
    'Work project',
    'work',
    '#3B82F6',
    'archived',
    7.0
  );
  if outcome->>'type' <> 'created'
    or outcome->'project'->>'status' <> 'archived'
    or (outcome->'project'->>'sort_order')::double precision <> 7.0 then
    raise exception 'explicit project creation values were incorrect: %', outcome;
  end if;

  outcome := public.create_project_atomically(
    '65100000-0000-0000-0000-000000000001',
    'Invalid section',
    'home',
    'blue',
    'active',
    null
  );
  if outcome->>'type' <> 'invalid' or outcome->>'field' <> 'section' then
    raise exception 'invalid project section was not typed: %', outcome;
  end if;

  -- A trusted authenticated caller cannot select a different owner's identity.
  outcome := public.create_project_atomically(
    '65100000-0000-0000-0000-000000000002',
    'Cross-owner project',
    'personal',
    'blue',
    'active',
    null
  );
  if outcome->>'type' <> 'conflict' then
    raise exception 'cross-owner project creation was not masked: %', outcome;
  end if;

  if exists (
    select 1
    from public.projects
    where id = project_id
      and user_id <> '65100000-0000-0000-0000-000000000001'
  ) or exists (
    select 1
    from public.projects
    where user_id = '65100000-0000-0000-0000-000000000001'
      and name = 'Cross-owner project'
  ) then
    raise exception 'project ownership changed during creation';
  end if;
end
$$;

reset role;
select public.sql_fixture_open_connection('project-create-a');
select public.sql_fixture_open_connection('project-create-b');
select pg_advisory_lock(65165101);

select extensions.dblink_send_query(
  'project-create-a',
  $query$
    with request_context as materialized (
      select set_config(
        'request.jwt.claim.sub',
        '65100000-0000-0000-0000-000000000001',
        false
      ),
      set_config(
        'request.jwt.claims',
        '{"sub":"65100000-0000-0000-0000-000000000001"}',
        false
      )
    ),
    gate as materialized (
      select pg_advisory_xact_lock(65165101) from request_context
    )
    select public.create_project_atomically(
      '65100000-0000-0000-0000-000000000001',
      'Concurrent first',
      'personal',
      'blue',
      'active',
      null
    ) outcome
    from gate
  $query$
);
select extensions.dblink_send_query(
  'project-create-b',
  $query$
    with request_context as materialized (
      select set_config(
        'request.jwt.claim.sub',
        '65100000-0000-0000-0000-000000000001',
        false
      ),
      set_config(
        'request.jwt.claims',
        '{"sub":"65100000-0000-0000-0000-000000000001"}',
        false
      )
    ),
    gate as materialized (
      select pg_advisory_xact_lock(65165101) from request_context
    )
    select public.create_project_atomically(
      '65100000-0000-0000-0000-000000000001',
      'Concurrent second',
      'personal',
      'blue',
      'active',
      null
    ) outcome
    from gate
  $query$
);
select pg_sleep(0.1);
select pg_advisory_unlock(65165101);

create temporary table project_creation_race_outcomes (outcome jsonb);
insert into project_creation_race_outcomes
select outcome
from extensions.dblink_get_result('project-create-a')
  as result(outcome jsonb);
insert into project_creation_race_outcomes
select outcome
from extensions.dblink_get_result('project-create-b')
  as result(outcome jsonb);
select * from extensions.dblink_get_result('project-create-a')
  as exhausted(outcome jsonb);
select * from extensions.dblink_get_result('project-create-b')
  as exhausted(outcome jsonb);
select extensions.dblink_disconnect('project-create-a');
select extensions.dblink_disconnect('project-create-b');

do $$
begin
  if (select count(*) from project_creation_race_outcomes) <> 2
    or (select count(*) from project_creation_race_outcomes where outcome->>'type' = 'created') <> 2
    or (select count(distinct (outcome->'project'->>'sort_order')) from project_creation_race_outcomes) <> 2
    or (
      select count(*)
      from public.projects
      where user_id = '65100000-0000-0000-0000-000000000001'
        and section = 'personal'
    ) <> 3 then
    raise exception 'concurrent project creation did not allocate distinct positions: %',
      (select jsonb_agg(outcome) from project_creation_race_outcomes);
  end if;
end
$$;

-- Self-clean committed rows and disposable identities.
delete from public.projects
where user_id = '65100000-0000-0000-0000-000000000001';
delete from public.projects
where user_id = '65100000-0000-0000-0000-000000000002';
select public.sql_fixture_delete_auth_user(
  '65100000-0000-0000-0000-000000000001'
);
select public.sql_fixture_delete_auth_user(
  '65100000-0000-0000-0000-000000000002'
);
