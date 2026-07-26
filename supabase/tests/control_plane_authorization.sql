-- Run after `supabase db reset` against the local instance. This is intentionally
-- transactional, so it leaves no test identities or control-plane data behind.
begin;

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

-- All private tables use RLS and authenticated has no table/sequence/function grants there.
do $$ declare t text; begin
  foreach t in array array['members','work_items','work_item_blockers','work_item_evidence','audit_events'] loop
    if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='control_plane' and c.relname=t) then raise exception 'RLS missing on %', t; end if;
    if has_table_privilege(current_user, format('control_plane.%I', t), 'select,insert,update,delete') then raise exception 'table privilege leaked on %', t; end if;
  end loop;
  if exists (select 1 from information_schema.role_routine_grants where grantee='authenticated' and routine_schema='control_plane') then raise exception 'control_plane routine grant leaked'; end if;
end $$;

-- Unauthenticated and ordinary customers are denied every public RPC and all direct CRUD.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin perform public.control_plane_list_members(); raise exception 'unauthenticated list members allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.control_plane_list_work_items(); raise exception 'unauthenticated list work allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.control_plane_create_work_item('no'); raise exception 'unauthenticated create allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.control_plane_assign_work_item(gen_random_uuid()); raise exception 'unauthenticated assign allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.control_plane_transition_work_item(gen_random_uuid(), 'active_sprint'); raise exception 'unauthenticated transition allowed'; exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
do $$ begin perform public.control_plane_list_members(); raise exception 'customer list members allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.control_plane_list_work_items(); raise exception 'customer list work allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.control_plane_create_work_item('no'); raise exception 'customer create allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.control_plane_assign_work_item(gen_random_uuid()); raise exception 'customer assign allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.control_plane_transition_work_item(gen_random_uuid(), 'active_sprint'); raise exception 'customer transition allowed'; exception when insufficient_privilege then null; end $$;
do $$ declare t text; begin foreach t in array array['members','work_items','work_item_blockers','work_item_evidence','audit_events'] loop
  begin execute format('select * from control_plane.%I', t); raise exception 'direct select allowed on %', t; exception when insufficient_privilege then null; end;
  begin execute format('insert into control_plane.%I default values', t); raise exception 'direct insert allowed on %', t; exception when insufficient_privilege then null; end;
  begin execute format('update control_plane.%I set created_at = created_at', t); raise exception 'direct update allowed on %', t; exception when insufficient_privilege then null; end;
  begin execute format('delete from control_plane.%I', t); raise exception 'direct delete allowed on %', t; exception when insufficient_privilege then null; end;
end loop; end $$;

-- Agents/reviewers may read through the public RPC but cannot execute any manager mutation.
do $$ declare actor uuid; label text; target uuid := gen_random_uuid(); begin
  foreach actor in array array['10000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000003'::uuid] loop
    perform set_config('request.jwt.claim.sub', actor::text, true); perform public.control_plane_list_work_items();
    begin perform public.control_plane_create_work_item('no'); raise exception 'non-manager create allowed'; exception when insufficient_privilege then null; end;
    begin perform public.control_plane_assign_work_item(target, actor); raise exception 'non-manager assign allowed'; exception when insufficient_privilege then null; end;
    begin perform public.control_plane_transition_work_item(target, 'active_sprint'); raise exception 'non-manager transition allowed'; exception when insufficient_privilege then null; end;
  end loop;
end $$;

-- Each manager mutation locks/changes the item and adds exactly one correct audit event.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$ declare created record; assigned record; transitioned record; begin
  select * into created from public.control_plane_create_work_item('Audited work', '10000000-0000-0000-0000-000000000002', null, array['Awaiting review'], array['https://example.test/evidence']);
  if (select count(*) from control_plane.audit_events where work_item_id=created.id and action='work_item.created') <> 1 then raise exception 'create audit incorrect'; end if;
  if (select count(*) from control_plane.work_item_blockers where work_item_id=created.id) <> 1 or (select count(*) from control_plane.work_item_evidence where work_item_id=created.id) <> 1 then raise exception 'related create rows missing'; end if;
  select * into assigned from public.control_plane_assign_work_item(created.id, '10000000-0000-0000-0000-000000000002');
  if assigned.assignee_id <> '10000000-0000-0000-0000-000000000002'::uuid or (select count(*) from control_plane.audit_events where work_item_id=created.id and action='work_item.assigned') <> 1 then raise exception 'assign/audit incorrect'; end if;
  select * into transitioned from public.control_plane_transition_work_item(created.id, 'active_sprint');
  if transitioned.status <> 'active_sprint' or (select count(*) from control_plane.audit_events where work_item_id=created.id and action='work_item.transitioned') <> 1 then raise exception 'transition/audit incorrect'; end if;
end $$;
do $$ begin perform public.control_plane_create_work_item('disabled', '10000000-0000-0000-0000-000000000005'); raise exception 'disabled assignee accepted'; exception when check_violation then null; end $$;
do $$ begin perform public.control_plane_create_work_item('wrong-role', '10000000-0000-0000-0000-000000000003'); raise exception 'reviewer assignee accepted'; exception when check_violation then null; end $$;
reset role;
do $$ begin update control_plane.audit_events set action='tampered'; raise exception 'audit update allowed'; exception when raise_exception then null; end $$;
do $$ begin delete from control_plane.audit_events; raise exception 'audit delete allowed'; exception when raise_exception then null; end $$;

rollback;
