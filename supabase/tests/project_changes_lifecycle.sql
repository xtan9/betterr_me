-- Run after `supabase db reset --local` against the local instance.
-- constrained-sql-fixture: true
-- Exercises Project detail changes and active/archived lifecycle transitions
-- through the normalized, owner-scoped RPC.

-- Remove residue from an interrupted run before creating disposable identities.
delete from public.projects
where user_id in (
  '65200000-0000-0000-0000-000000000001',
  '65200000-0000-0000-0000-000000000002'
);

do $$
begin
  begin
    perform public.sql_fixture_delete_auth_user(
      '65200000-0000-0000-0000-000000000001'
    );
  exception when others then null;
  end;
  begin
    perform public.sql_fixture_delete_auth_user(
      '65200000-0000-0000-0000-000000000002'
    );
  exception when others then null;
  end;
end
$$;

select public.sql_fixture_create_auth_user(
  '65200000-0000-0000-0000-000000000001',
  'project-changes-owner@example.test'
);
select public.sql_fixture_create_auth_user(
  '65200000-0000-0000-0000-000000000002',
  'project-changes-other@example.test'
);

select set_config(
  'request.jwt.claim.sub',
  '65200000-0000-0000-0000-000000000001',
  false
);
set role authenticated;

create temporary table project_changes_fixture_ids (
  owner_project_id uuid,
  other_project_id uuid
);

do $$
declare
  outcome jsonb;
begin
  select public.create_project_atomically(
    '65200000-0000-0000-0000-000000000001',
    'Changes project',
    'personal',
    'blue',
    'active',
    1.0
  ) into outcome;
  if outcome->>'type' <> 'created' then
    raise exception 'fixture owner project was not created: %', outcome;
  end if;

  insert into project_changes_fixture_ids (owner_project_id)
  values ((outcome->'project'->>'id')::uuid);
end
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '65200000-0000-0000-0000-000000000002',
  false
);
set role authenticated;

do $$
declare
  outcome jsonb;
begin
  select public.create_project_atomically(
    '65200000-0000-0000-0000-000000000002',
    'Other owner project',
    'personal',
    'blue',
    'active',
    1.0
  ) into outcome;
  if outcome->>'type' <> 'created' then
    raise exception 'fixture other-owner project was not created: %', outcome;
  end if;

  update project_changes_fixture_ids
  set other_project_id = (outcome->'project'->>'id')::uuid;
end
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '65200000-0000-0000-0000-000000000001',
  false
);
set role authenticated;

do $$
declare
  function_definition text;
  owner_project_id uuid;
  other_project_id uuid;
  outcome jsonb;
  repeated jsonb;
  missing jsonb;
  cross_owner jsonb;
  spoofed_identity jsonb;
  current_project public.projects;
begin
  select pg_get_functiondef(
    'public.update_project_atomically(uuid,uuid,jsonb)'::regprocedure
  ) into function_definition;

  if position('SECURITY DEFINER' in upper(function_definition)) <> 0 then
    raise exception 'project changes must remain SECURITY INVOKER';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.update_project_atomically(uuid,uuid,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.update_project_atomically(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'trusted application roles cannot execute project changes';
  end if;
  if has_function_privilege(
    'anon',
    'public.update_project_atomically(uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'anonymous project changes execute privilege leaked';
  end if;
  if exists (
    select 1
    from pg_proc
    where oid = 'public.update_project_atomically(uuid,uuid,jsonb)'::regprocedure
      and prosecdef
  ) then
    raise exception 'project changes unexpectedly bypass RLS';
  end if;

  select ids.owner_project_id, ids.other_project_id
  into owner_project_id, other_project_id
  from project_changes_fixture_ids as ids;

  -- Partial changes normalize transport whitespace while preserving omitted
  -- fields. The ordering and color inputs also pass through the same rules.
  outcome := public.update_project_atomically(
    owner_project_id,
    '65200000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'name', '  Renamed project  ',
      'section', ' work ',
      'color', ' #3B82F6 ',
      'sort_order', 7.0
    )
  );
  if outcome->>'type' <> 'updated'
    or outcome->'project'->>'name' <> 'Renamed project'
    or outcome->'project'->>'section' <> 'work'
    or outcome->'project'->>'color' <> '#3B82F6'
    or outcome->'project'->>'status' <> 'active'
    or (outcome->'project'->>'sort_order')::double precision <> 7.0 then
    raise exception 'partial project update was incorrect: %', outcome;
  end if;

  -- Invalid values are typed at the shared persistence boundary.
  outcome := public.update_project_atomically(
    owner_project_id,
    '65200000-0000-0000-0000-000000000001',
    '{"name":"   "}'::jsonb
  );
  if outcome->>'type' <> 'invalid' or outcome->>'field' <> 'name' then
    raise exception 'invalid project name was not typed: %', outcome;
  end if;

  outcome := public.update_project_atomically(
    owner_project_id,
    '65200000-0000-0000-0000-000000000001',
    '{"section":"home"}'::jsonb
  );
  if outcome->>'type' <> 'invalid' or outcome->>'field' <> 'section' then
    raise exception 'invalid project section was not typed: %', outcome;
  end if;

  outcome := public.update_project_atomically(
    owner_project_id,
    '65200000-0000-0000-0000-000000000001',
    '{"color":"chartreuse"}'::jsonb
  );
  if outcome->>'type' <> 'invalid' or outcome->>'field' <> 'color' then
    raise exception 'invalid project color was not typed: %', outcome;
  end if;

  outcome := public.update_project_atomically(
    owner_project_id,
    '65200000-0000-0000-0000-000000000001',
    '{"sort_order":-1}'::jsonb
  );
  if outcome->>'type' <> 'invalid' or outcome->>'field' <> 'sortOrder' then
    raise exception 'invalid project ordering was not typed: %', outcome;
  end if;

  outcome := public.update_project_atomically(
    owner_project_id,
    '65200000-0000-0000-0000-000000000001',
    '{"status":"pending"}'::jsonb
  );
  if outcome->>'type' <> 'invalid' or outcome->>'field' <> 'status' then
    raise exception 'invalid project status was not typed: %', outcome;
  end if;

  -- Archive and restore are explicit, idempotent transitions. Repeating an
  -- already-applied status is an expected outcome, not an error.
  outcome := public.update_project_atomically(
    owner_project_id,
    '65200000-0000-0000-0000-000000000001',
    '{"status":" archived "}'::jsonb
  );
  if outcome->>'type' <> 'updated'
    or outcome->'project'->>'status' <> 'archived' then
    raise exception 'project archive was incorrect: %', outcome;
  end if;

  repeated := public.update_project_atomically(
    owner_project_id,
    '65200000-0000-0000-0000-000000000001',
    '{"status":"archived"}'::jsonb
  );
  if repeated->>'type' <> 'already-applied'
    or repeated->'project'->>'status' <> 'archived' then
    raise exception 'repeated project archive was not idempotent: %', repeated;
  end if;

  outcome := public.update_project_atomically(
    owner_project_id,
    '65200000-0000-0000-0000-000000000001',
    '{"status":"active"}'::jsonb
  );
  if outcome->>'type' <> 'updated'
    or outcome->'project'->>'status' <> 'active' then
    raise exception 'project restore was incorrect: %', outcome;
  end if;

  repeated := public.update_project_atomically(
    owner_project_id,
    '65200000-0000-0000-0000-000000000001',
    '{"status":"active"}'::jsonb
  );
  if repeated->>'type' <> 'already-applied'
    or repeated->'project'->>'status' <> 'active' then
    raise exception 'repeated project restore was not idempotent: %', repeated;
  end if;

  -- Missing and cross-owner projects are deliberately indistinguishable.
  missing := public.update_project_atomically(
    '65200000-0000-0000-0000-000000000099',
    '65200000-0000-0000-0000-000000000001',
    '{"name":"Missing"}'::jsonb
  );
  cross_owner := public.update_project_atomically(
    other_project_id,
    '65200000-0000-0000-0000-000000000001',
    '{"name":"Should not change"}'::jsonb
  );
  if missing <> '{"type":"not-found"}'::jsonb
    or cross_owner <> '{"type":"not-found"}'::jsonb then
    raise exception 'missing and cross-owner projects were not masked: %, %',
      missing, cross_owner;
  end if;

  -- A caller cannot spoof the trusted identity parameter either.
  spoofed_identity := public.update_project_atomically(
    other_project_id,
    '65200000-0000-0000-0000-000000000002',
    '{"name":"Should not change"}'::jsonb
  );
  if spoofed_identity <> '{"type":"not-found"}'::jsonb then
    raise exception 'spoofed project identity was not masked: %', spoofed_identity;
  end if;

  select * into current_project
  from public.projects
  where id = other_project_id;
  if current_project.name <> 'Other owner project'
    or current_project.user_id
      <> '65200000-0000-0000-0000-000000000002' then
    raise exception 'cross-owner project was modified: %', current_project;
  end if;
end
$$;

reset role;
delete from public.projects
where user_id in (
  '65200000-0000-0000-0000-000000000001',
  '65200000-0000-0000-0000-000000000002'
);
select public.sql_fixture_delete_auth_user(
  '65200000-0000-0000-0000-000000000001'
);
select public.sql_fixture_delete_auth_user(
  '65200000-0000-0000-0000-000000000002'
);
