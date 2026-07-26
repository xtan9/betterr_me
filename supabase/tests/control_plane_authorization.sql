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

-- Unauthenticated and customer callers cannot use internal RPCs or directly touch tables.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin perform control_plane.list_members(); raise exception 'unauthenticated member RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform control_plane.list_work_items(); raise exception 'unauthenticated work RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform control_plane.create_work_item('unauthenticated'); raise exception 'unauthenticated create RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform control_plane.assign_work_item(gen_random_uuid()); raise exception 'unauthenticated assign RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform control_plane.transition_work_item(gen_random_uuid(), 'active_sprint'); raise exception 'unauthenticated transition RPC allowed'; exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
do $$ begin perform control_plane.list_members(); raise exception 'customer member RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform control_plane.list_work_items(); raise exception 'customer work RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform control_plane.create_work_item('customer'); raise exception 'customer create RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform control_plane.assign_work_item(gen_random_uuid()); raise exception 'customer assign RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform control_plane.transition_work_item(gen_random_uuid(), 'active_sprint'); raise exception 'customer transition RPC allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from control_plane.work_items; raise exception 'customer direct select allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into control_plane.work_items (title) values ('no'); raise exception 'customer direct insert allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin update control_plane.work_items set title = 'no'; raise exception 'customer direct update allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin delete from control_plane.work_items; raise exception 'customer direct delete allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into control_plane.audit_events (actor_id, action) values ('10000000-0000-0000-0000-000000000004', 'no'); raise exception 'customer audit write allowed'; exception when insufficient_privilege then null; end $$;

-- Agent and reviewer can read, but cannot mutate through manager RPCs.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select * from control_plane.list_work_items();
do $$ begin perform control_plane.create_work_item('agent cannot create'); raise exception 'agent mutation allowed'; exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
do $$ begin perform control_plane.create_work_item('reviewer cannot create'); raise exception 'reviewer mutation allowed'; exception when insufficient_privilege then null; end $$;

-- Manager mutation must atomically create the work item and its audit event.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$
declare created control_plane.work_items;
begin
  created := control_plane.create_work_item('Audited work', '10000000-0000-0000-0000-000000000002', null, array['Awaiting review'], array['https://example.test/evidence']);
  if not exists (select 1 from control_plane.audit_events where work_item_id = created.id and actor_id = auth.uid() and action = 'work_item.created') then
    raise exception 'create audit event missing';
  end if;
  if (select count(*) from control_plane.work_item_blockers where work_item_id = created.id) <> 1
     or (select count(*) from control_plane.work_item_evidence where work_item_id = created.id) <> 1 then
    raise exception 'create related rows missing';
  end if;
end $$;

do $$ begin perform control_plane.create_work_item('disabled assignee', '10000000-0000-0000-0000-000000000005'); raise exception 'disabled agent accepted'; exception when check_violation then null; end $$;
do $$ begin perform control_plane.create_work_item('wrong role assignee', '10000000-0000-0000-0000-000000000003'); raise exception 'reviewer accepted as assignee'; exception when check_violation then null; end $$;

rollback;
