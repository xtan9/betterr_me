-- Run after `supabase db reset` against the local instance. This is intentionally
-- transactional, so it leaves no test identities or control-plane data behind.
select
  last_value as audit_events_sequence_value,
  is_called as audit_events_sequence_called
from control_plane.audit_events_id_seq
\gset

begin;

-- Keep the assertion outside the exception handler. If the statement succeeds,
-- the assertion's own P0001 must propagate instead of being mistaken for the
-- database outcome under test.
create function pg_temp.expect_sqlstate(statement text, expected_state text, failure_message text)
returns void
language plpgsql
as $$
declare
  actual_state text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state = expected_state then
      return;
    end if;
    raise exception '%: expected SQLSTATE %, got %', failure_message, expected_state, actual_state;
  end;
  raise exception '%: expected SQLSTATE %, but statement succeeded', failure_message, expected_state;
end;
$$;

-- Regression guard: a successful operation must surface the helper's assertion
-- rather than let the helper catch its own exception and report a false pass.
do $$
declare
  caught_message text;
begin
  begin
    perform pg_temp.expect_sqlstate('select 1', '42501', 'regression guard');
  exception when raise_exception then
    caught_message := sqlerrm;
  end;
  if caught_message is distinct from 'regression guard: expected SQLSTATE 42501, but statement succeeded' then
    raise exception 'expected-sqlstate regression guard failed: %', coalesce(caught_message, 'no exception');
  end if;
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cp-manager@example.test', crypt('not-used', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cp-agent@example.test', crypt('not-used', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cp-reviewer@example.test', crypt('not-used', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cp-customer@example.test', crypt('not-used', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cp-disabled-agent@example.test', crypt('not-used', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into control_plane.members (user_id, display_name, role, enabled) values
  ('10000000-0000-0000-0000-000000000001', 'Manager', 'manager', true),
  ('10000000-0000-0000-0000-000000000002', 'Agent', 'agent', true),
  ('10000000-0000-0000-0000-000000000003', 'Reviewer', 'reviewer', true),
  ('10000000-0000-0000-0000-000000000005', 'Disabled agent', 'agent', false);

set local role authenticated;

-- The private schema is neither exposed by PostgREST nor usable by customers.
do $$ begin
  if has_schema_privilege(current_user, 'control_plane', 'USAGE') then raise exception 'authenticated has control_plane USAGE'; end if;
  if exists (select 1 from information_schema.schemata where schema_name = 'control_plane') then raise exception 'control_plane visible through information_schema'; end if;
end $$;

-- All private objects use RLS and no application role (including PUBLIC) has
-- a private-schema/table/sequence/function privilege. Check each privilege
-- independently: PostgreSQL's has_*_privilege accepts one privilege per call.
do $$ declare t text; s record; p record; grantee text; privilege text; begin
  foreach grantee in array array['anon', 'authenticated'] loop
    if has_schema_privilege(grantee, 'control_plane', 'USAGE')
      or has_schema_privilege(grantee, 'control_plane', 'CREATE') then
      raise exception '% has control_plane schema privilege', grantee;
    end if;
  end loop;
  if exists (
    select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    where n.nspname = 'control_plane' and a.grantee = 0
  ) then raise exception 'PUBLIC has control_plane schema privilege'; end if;
  foreach t in array array['members','work_items','work_item_blockers','work_item_evidence','audit_events'] loop
    if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='control_plane' and c.relname=t) then raise exception 'RLS missing on %', t; end if;
    foreach grantee in array array['anon', 'authenticated'] loop
      foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        -- Use the catalog OID rather than a qualified name: the caller is
        -- deliberately denied schema USAGE, so name resolution must not be a
        -- prerequisite for asserting that table privileges are absent.
        if has_table_privilege(grantee, (select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'control_plane' and c.relname = t), privilege) then
          raise exception '% table % privilege leaked on %', privilege, grantee, t;
        end if;
      end loop;
    end loop;
    if exists (
      select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'control_plane' and c.relname = t and a.grantee = 0
    ) then raise exception 'PUBLIC table privilege leaked on %', t; end if;
  end loop;
  for s in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='control_plane' and c.relkind='S' loop
    foreach grantee in array array['anon', 'authenticated'] loop
      foreach privilege in array array['USAGE', 'SELECT', 'UPDATE'] loop
        if has_sequence_privilege(grantee, s.oid, privilege) then
          raise exception '% sequence % privilege leaked on %', privilege, grantee, s.relname;
        end if;
      end loop;
    end loop;
    if exists (
      select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) a
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'control_plane' and c.relname = s.relname and a.grantee = 0
    ) then raise exception 'PUBLIC sequence privilege leaked on %', s.relname; end if;
  end loop;
  for p in select proc.oid, proc.proname, proc.proowner, proc.proacl from pg_proc proc join pg_namespace n on n.oid=proc.pronamespace where n.nspname='control_plane' loop
    foreach grantee in array array['anon', 'authenticated'] loop
      if has_function_privilege(grantee, p.oid, 'EXECUTE') then raise exception '% function privilege leaked on %', grantee, p.proname; end if;
    end loop;
    if exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'PUBLIC function privilege leaked on %', p.proname;
    end if;
  end loop;
  for p in select proc.oid, proc.proname, proc.proowner, proc.proacl from pg_proc proc join pg_namespace n on n.oid=proc.pronamespace where n.nspname='public' and proc.proname in ('control_plane_list_members','control_plane_list_work_items','control_plane_create_work_item','control_plane_assign_work_item','control_plane_transition_work_item') loop
    if not has_function_privilege('authenticated', p.oid, 'EXECUTE') then raise exception 'authenticated missing allowed public RPC execute: %', p.proname; end if;
    if has_function_privilege('anon', p.oid, 'EXECUTE') then raise exception 'anon public RPC execute leaked: %', p.proname; end if;
    if exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'PUBLIC public RPC execute leaked: %', p.proname;
    end if;
  end loop;
  if (select count(*) from pg_proc proc join pg_namespace n on n.oid=proc.pronamespace where n.nspname='public' and proc.proname in ('control_plane_list_members','control_plane_list_work_items','control_plane_create_work_item','control_plane_assign_work_item','control_plane_transition_work_item')) <> 5 then
    raise exception 'expected exactly five public control-plane RPCs';
  end if;
end $$;

-- Unauthenticated and ordinary customers are denied every public RPC and all direct CRUD.
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_sqlstate('select public.control_plane_list_members()', '42501', 'unauthenticated list members allowed');
select pg_temp.expect_sqlstate('select public.control_plane_list_work_items()', '42501', 'unauthenticated list work allowed');
select pg_temp.expect_sqlstate($sql$select public.control_plane_create_work_item('no')$sql$, '42501', 'unauthenticated create allowed');
select pg_temp.expect_sqlstate('select public.control_plane_assign_work_item(gen_random_uuid())', '42501', 'unauthenticated assign allowed');
select pg_temp.expect_sqlstate($sql$select public.control_plane_transition_work_item(gen_random_uuid(), 'active_sprint')$sql$, '42501', 'unauthenticated transition allowed');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select pg_temp.expect_sqlstate('select public.control_plane_list_members()', '42501', 'customer list members allowed');
select pg_temp.expect_sqlstate('select public.control_plane_list_work_items()', '42501', 'customer list work allowed');
select pg_temp.expect_sqlstate($sql$select public.control_plane_create_work_item('no')$sql$, '42501', 'customer create allowed');
select pg_temp.expect_sqlstate('select public.control_plane_assign_work_item(gen_random_uuid())', '42501', 'customer assign allowed');
select pg_temp.expect_sqlstate($sql$select public.control_plane_transition_work_item(gen_random_uuid(), 'active_sprint')$sql$, '42501', 'customer transition allowed');
do $$ declare t text; begin foreach t in array array['members','work_items','work_item_blockers','work_item_evidence','audit_events'] loop
  perform pg_temp.expect_sqlstate(format('select * from control_plane.%I', t), '42501', format('direct select allowed on %s', t));
  perform pg_temp.expect_sqlstate(format('insert into control_plane.%I default values', t), '42501', format('direct insert allowed on %s', t));
  perform pg_temp.expect_sqlstate(format('update control_plane.%I set created_at = created_at', t), '42501', format('direct update allowed on %s', t));
  perform pg_temp.expect_sqlstate(format('delete from control_plane.%I', t), '42501', format('direct delete allowed on %s', t));
end loop; end $$;

-- Agents/reviewers may read through the public RPC but cannot execute any manager mutation.
do $$ declare actor uuid; label text; target uuid := gen_random_uuid(); begin
  foreach actor in array array['10000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000003'::uuid] loop
    perform set_config('request.jwt.claim.sub', actor::text, true); perform public.control_plane_list_work_items();
    perform pg_temp.expect_sqlstate($sql$select public.control_plane_create_work_item('no')$sql$, '42501', 'non-manager create allowed');
    perform pg_temp.expect_sqlstate(format('select public.control_plane_assign_work_item(%L, %L)', target, actor), '42501', 'non-manager assign allowed');
    perform pg_temp.expect_sqlstate(format('select public.control_plane_transition_work_item(%L, %L)', target, 'active_sprint'), '42501', 'non-manager transition allowed');
  end loop;
end $$;

-- Each manager mutation locks/changes the item and adds exactly one correct audit event.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
reset role;
do $$ declare created record; assigned record; transitioned record; manager_id uuid := '10000000-0000-0000-0000-000000000001'; agent_id uuid := '10000000-0000-0000-0000-000000000002'; begin
  -- Execute mutations as the authenticated manager. Drop back to the local
  -- database owner only to inspect private audit rows that are deliberately
  -- inaccessible to application roles.
  set local role authenticated;
  select * into created from public.control_plane_create_work_item('Audited work', '10000000-0000-0000-0000-000000000002', null, array['Awaiting review'], array['https://example.test/evidence']);
  reset role;
  if not exists (select 1 from control_plane.audit_events where work_item_id=created.id and actor_id=manager_id and action='work_item.created' and payload = jsonb_build_object('title', 'Audited work', 'assignee_id', agent_id, 'blocker_count', 1, 'evidence_count', 1)) then raise exception 'create audit actor/payload incorrect'; end if;
  if (select count(*) from control_plane.audit_events where work_item_id=created.id and action='work_item.created') <> 1 then raise exception 'create audit count incorrect'; end if;
  if (select count(*) from control_plane.work_item_blockers where work_item_id=created.id) <> 1 or (select count(*) from control_plane.work_item_evidence where work_item_id=created.id) <> 1 then raise exception 'related create rows missing'; end if;
  set local role authenticated;
  select * into assigned from public.control_plane_assign_work_item(created.id, agent_id);
  reset role;
  if assigned.assignee_id <> agent_id then raise exception 'assignment incorrect'; end if;
  if not exists (select 1 from control_plane.audit_events where work_item_id=created.id and actor_id=manager_id and action='work_item.assigned' and payload = jsonb_build_object('assignee_id', agent_id, 'lease_expires_at', null)) then raise exception 'assign audit actor/payload incorrect'; end if;
  if (select count(*) from control_plane.audit_events where work_item_id=created.id and action='work_item.assigned') <> 1 then raise exception 'assign audit count incorrect'; end if;
  set local role authenticated;
  select * into transitioned from public.control_plane_transition_work_item(created.id, 'active_sprint');
  reset role;
  if transitioned.status <> 'active_sprint' then raise exception 'transition incorrect'; end if;
  if not exists (select 1 from control_plane.audit_events where work_item_id=created.id and actor_id=manager_id and action='work_item.transitioned' and payload = jsonb_build_object('to', 'active_sprint')) then raise exception 'transition audit actor/payload incorrect'; end if;
  if (select count(*) from control_plane.audit_events where work_item_id=created.id and action='work_item.transitioned') <> 1 then raise exception 'transition audit count incorrect'; end if;
end $$;
select pg_temp.expect_sqlstate($sql$select public.control_plane_create_work_item('disabled', '10000000-0000-0000-0000-000000000005')$sql$, '23514', 'disabled assignee accepted');
select pg_temp.expect_sqlstate($sql$select public.control_plane_create_work_item('wrong-role', '10000000-0000-0000-0000-000000000003')$sql$, '23514', 'reviewer assignee accepted');
reset role;
select pg_temp.expect_sqlstate($sql$update control_plane.audit_events set action='tampered'$sql$, 'P0001', 'audit update allowed');
select pg_temp.expect_sqlstate('delete from control_plane.audit_events', 'P0001', 'audit delete allowed');

rollback;

select setval(
  'control_plane.audit_events_id_seq',
  :'audit_events_sequence_value'::bigint,
  :'audit_events_sequence_called'::boolean
);
