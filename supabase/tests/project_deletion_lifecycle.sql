-- Run after `supabase db reset --local` against the local instance.
-- ralph-ci: true
-- Exercises Project deletion through the public RPC, including dependent Task
-- unassignment, repeated and cross-owner isolation, and rollback safety.

-- Remove residue from an interrupted run before creating disposable users.
delete from public.tasks
where user_id in (
  '65300000-0000-0000-0000-000000000001',
  '65300000-0000-0000-0000-000000000002'
);
delete from public.projects
where user_id in (
  '65300000-0000-0000-0000-000000000001',
  '65300000-0000-0000-0000-000000000002'
);

do $$
begin
  begin
    perform public.ralph_ci_delete_auth_user(
      '65300000-0000-0000-0000-000000000001'
    );
  exception when others then null;
  end;
  begin
    perform public.ralph_ci_delete_auth_user(
      '65300000-0000-0000-0000-000000000002'
    );
  exception when others then null;
  end;
end
$$;

select public.ralph_ci_create_auth_user(
  '65300000-0000-0000-0000-000000000001',
  'project-deletion-owner@example.test'
);
select public.ralph_ci_create_auth_user(
  '65300000-0000-0000-0000-000000000002',
  'project-deletion-other@example.test'
);

-- The trigger makes the command fail after it has unassigned the dependent
-- Task, proving that the Project and Task changes share one transaction.
create function pg_temp.reject_project_deletion()
returns trigger
language plpgsql
as $$
begin
  if old.id = '65300000-0000-0000-0000-000000000103'::uuid
    and current_user = 'authenticated' then
    raise exception 'forced project deletion failure';
  end if;
  return old;
end
$$;

create trigger reject_project_deletion
before delete on public.projects
for each row execute function pg_temp.reject_project_deletion();

select set_config(
  'request.jwt.claim.sub',
  '65300000-0000-0000-0000-000000000001',
  false
);
set role authenticated;

insert into public.projects (
  id,
  user_id,
  name,
  section,
  color,
  status,
  sort_order
)
values
  (
    '65300000-0000-0000-0000-000000000101',
    '65300000-0000-0000-0000-000000000001',
    'Deletion project',
    'personal',
    'blue',
    'active',
    1
  ),
  (
    '65300000-0000-0000-0000-000000000103',
    '65300000-0000-0000-0000-000000000001',
    'Rollback project',
    'work',
    'red',
    'active',
    2
  );

reset role;
insert into public.tasks (id, user_id, title, project_id)
values
  (
    '65300000-0000-0000-0000-000000000201',
    '65300000-0000-0000-0000-000000000001',
    'Dependent task',
    '65300000-0000-0000-0000-000000000101'
  ),
  (
    '65300000-0000-0000-0000-000000000203',
    '65300000-0000-0000-0000-000000000001',
    'Rollback dependent task',
    '65300000-0000-0000-0000-000000000103'
  );

reset role;
select set_config(
  'request.jwt.claim.sub',
  '65300000-0000-0000-0000-000000000002',
  false
);
set role authenticated;

insert into public.projects (
  id,
  user_id,
  name,
  section,
  color,
  status,
  sort_order
)
values (
  '65300000-0000-0000-0000-000000000102',
  '65300000-0000-0000-0000-000000000002',
  'Private project',
  'personal',
  'green',
  'active',
  1
);

reset role;
insert into public.tasks (id, user_id, title, project_id)
values (
  '65300000-0000-0000-0000-000000000202',
  '65300000-0000-0000-0000-000000000002',
  'Private dependent task',
  '65300000-0000-0000-0000-000000000102'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '65300000-0000-0000-0000-000000000001',
  false
);
set role authenticated;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.delete_project_atomically(uuid,uuid)'::regprocedure
  ) into function_definition;

  if position('FOR UPDATE' in upper(function_definition)) = 0 then
    raise exception 'Project deletion lifecycle does not lock the Project row';
  end if;
  if position('TASKS' in upper(function_definition)) = 0 then
    raise exception 'Project deletion lifecycle does not name dependent Task cleanup';
  end if;
  if position('SECURITY DEFINER' in upper(function_definition)) <> 0 then
    raise exception 'Project deletion must remain SECURITY INVOKER';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.delete_project_atomically(uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.delete_project_atomically(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'trusted application roles cannot execute Project deletion';
  end if;
  if has_function_privilege(
    'anon',
    'public.delete_project_atomically(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anonymous Project deletion execute privilege leaked';
  end if;
  if not has_table_privilege(
    'authenticated',
    'public.projects',
    'DELETE'
  ) or not has_table_privilege(
    'authenticated',
    'public.tasks',
    'UPDATE'
  ) then
    raise exception 'authenticated lacks Project deletion table privileges';
  end if;
  if exists (
    select 1
    from pg_proc
    where oid = 'public.delete_project_atomically(uuid,uuid)'::regprocedure
      and prosecdef
  ) then
    raise exception 'Project deletion unexpectedly bypasses RLS';
  end if;
end
$$;

do $$
declare
  deleted jsonb;
  repeated jsonb;
begin
  deleted := public.delete_project_atomically(
    '65300000-0000-0000-0000-000000000101',
    '65300000-0000-0000-0000-000000000001'
  );

  if deleted <> jsonb_build_object('type', 'deleted') then
    raise exception 'deleted Project outcome was incorrect: %', deleted;
  end if;

  if exists (
    select 1
    from public.projects
    where id = '65300000-0000-0000-0000-000000000101'
  ) or exists (
    select 1
    from public.tasks
    where id = '65300000-0000-0000-0000-000000000201'
      and project_id is not null
  ) or exists (
    select 1
    from public.tasks
    where project_id = '65300000-0000-0000-0000-000000000101'
  ) then
    raise exception 'Project deletion left a dependent Task pointing at the removed Project';
  end if;

  repeated := public.delete_project_atomically(
    '65300000-0000-0000-0000-000000000101',
    '65300000-0000-0000-0000-000000000001'
  );

  if repeated <> jsonb_build_object('type', 'not-found') then
    raise exception 'repeated Project deletion was not not-found: %', repeated;
  end if;
end
$$;

do $$
declare
  missing jsonb;
  cross_owner jsonb;
  identity_mismatch jsonb;
begin
  missing := public.delete_project_atomically(
    '65300000-0000-0000-0000-000000000199',
    '65300000-0000-0000-0000-000000000001'
  );
  cross_owner := public.delete_project_atomically(
    '65300000-0000-0000-0000-000000000102',
    '65300000-0000-0000-0000-000000000001'
  );
  identity_mismatch := public.delete_project_atomically(
    '65300000-0000-0000-0000-000000000102',
    '65300000-0000-0000-0000-000000000002'
  );

  if missing <> jsonb_build_object('type', 'not-found')
    or cross_owner <> jsonb_build_object('type', 'not-found')
    or identity_mismatch <> jsonb_build_object('type', 'not-found') then
    raise exception
      'missing, cross-owner, and identity-mismatch outcomes differed: missing=%, cross_owner=%, identity_mismatch=%',
      missing,
      cross_owner,
      identity_mismatch;
  end if;
end
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '65300000-0000-0000-0000-000000000002',
  false
);
set role authenticated;

do $$
begin
  if not exists (
    select 1
    from public.projects
    where id = '65300000-0000-0000-0000-000000000102'
      and user_id = '65300000-0000-0000-0000-000000000002'
  ) or not exists (
    select 1
    from public.tasks
    where id = '65300000-0000-0000-0000-000000000202'
      and project_id = '65300000-0000-0000-0000-000000000102'
  ) then
    raise exception 'cross-owner Project deletion changed the other owner data';
  end if;
end
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '65300000-0000-0000-0000-000000000001',
  false
);
set role authenticated;

do $$
declare
  failure_error text;
begin
  begin
    perform public.delete_project_atomically(
      '65300000-0000-0000-0000-000000000103',
      '65300000-0000-0000-0000-000000000001'
    );
    raise exception 'rollback Project deletion unexpectedly succeeded';
  exception
    when raise_exception then
      failure_error := sqlerrm;
      if failure_error <> 'forced project deletion failure' then
        raise;
      end if;
  end;

  if not exists (
    select 1
    from public.projects
    where id = '65300000-0000-0000-0000-000000000103'
  ) or not exists (
    select 1
    from public.tasks
    where id = '65300000-0000-0000-0000-000000000203'
      and project_id = '65300000-0000-0000-0000-000000000103'
  ) then
    raise exception 'failed Project deletion left a partial persisted outcome';
  end if;
end
$$;

reset role;

-- Self-clean all rows and disposable identities.
delete from public.tasks
where user_id in (
  '65300000-0000-0000-0000-000000000001',
  '65300000-0000-0000-0000-000000000002'
);
delete from public.projects
where user_id in (
  '65300000-0000-0000-0000-000000000001',
  '65300000-0000-0000-0000-000000000002'
);

do $$
begin
  perform public.ralph_ci_delete_auth_user(
    '65300000-0000-0000-0000-000000000001'
  );
  perform public.ralph_ci_delete_auth_user(
    '65300000-0000-0000-0000-000000000002'
  );
end
$$;
