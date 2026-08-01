-- Run after `supabase db reset --local` against the local instance.
-- ralph-ci: true
-- Exercises owned, missing, repeated, cross-owner, and rollback-safe Journal
-- entry deletion through the public RPC, including dependent-link cleanup.

-- Remove residue from an interrupted run before creating disposable users.
select set_config(
  'request.jwt.claim.sub',
  '65000000-0000-4000-8000-000000000001',
  false
);
delete from public.journal_entries
where user_id = '65000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claim.sub',
  '65000000-0000-4000-8000-000000000002',
  false
);
delete from public.journal_entries
where user_id = '65000000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform public.ralph_ci_delete_auth_user(
      '65000000-0000-4000-8000-000000000001'
    );
  exception when others then null;
  end;
  begin
    perform public.ralph_ci_delete_auth_user(
      '65000000-0000-4000-8000-000000000002'
    );
  exception when others then null;
  end;
end
$$;

select public.ralph_ci_create_auth_user(
  '65000000-0000-4000-8000-000000000001',
  'journal-deletion-owner@example.test'
);
select public.ralph_ci_create_auth_user(
  '65000000-0000-4000-8000-000000000002',
  'journal-deletion-other@example.test'
);

create function pg_temp.reject_journal_deletion()
returns trigger
language plpgsql
as $$
begin
  if old.id = '65000000-0000-4000-8000-000000000403'::uuid
    and current_user = 'authenticated' then
    raise exception 'forced journal deletion failure';
  end if;
  return old;
end
$$;

create trigger reject_journal_deletion
before delete on public.journal_entries
for each row execute function pg_temp.reject_journal_deletion();

select set_config(
  'request.jwt.claim.sub',
  '65000000-0000-4000-8000-000000000001',
  false
);
set role authenticated;

insert into public.journal_entries (
  id,
  user_id,
  entry_date,
  title,
  content,
  mood,
  word_count,
  tags
)
values
  (
    '65000000-0000-4000-8000-000000000401',
    '65000000-0000-4000-8000-000000000001',
    '2026-08-05',
    'Successful deletion',
    '{"type":"doc","content":[]}'::jsonb,
    4,
    3,
    '{"cleanup","links"}'::text[]
  ),
  (
    '65000000-0000-4000-8000-000000000403',
    '65000000-0000-4000-8000-000000000001',
    '2026-08-06',
    'Rollback deletion',
    '{"type":"doc","content":[]}'::jsonb,
    2,
    2,
    '{"rollback"}'::text[]
  );

insert into public.journal_entry_links (id, entry_id, link_type, link_id)
values
  (
    '65000000-0000-4000-8000-000000000501',
    '65000000-0000-4000-8000-000000000401',
    'habit',
    '65000000-0000-4000-8000-000000000601'
  ),
  (
    '65000000-0000-4000-8000-000000000504',
    '65000000-0000-4000-8000-000000000401',
    'task',
    '65000000-0000-4000-8000-000000000602'
  ),
  (
    '65000000-0000-4000-8000-000000000503',
    '65000000-0000-4000-8000-000000000403',
    'project',
    '65000000-0000-4000-8000-000000000603'
  );

select set_config(
  'request.jwt.claim.sub',
  '65000000-0000-4000-8000-000000000002',
  false
);

insert into public.journal_entries (
  id,
  user_id,
  entry_date,
  title,
  content,
  mood,
  word_count,
  tags
)
values (
  '65000000-0000-4000-8000-000000000402',
  '65000000-0000-4000-8000-000000000002',
  '2026-08-07',
  'Private entry',
  '{"type":"doc","content":[]}'::jsonb,
  5,
  1,
  '{"private"}'::text[]
);

insert into public.journal_entry_links (id, entry_id, link_type, link_id)
values (
  '65000000-0000-4000-8000-000000000502',
  '65000000-0000-4000-8000-000000000402',
  'task',
  '65000000-0000-4000-8000-000000000602'
);

select set_config(
  'request.jwt.claim.sub',
  '65000000-0000-4000-8000-000000000001',
  false
);

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.delete_journal_entry_atomically(uuid,uuid)'::regprocedure
  ) into function_definition;

  if position('FOR UPDATE' in upper(function_definition)) = 0 then
    raise exception 'Journal deletion lifecycle does not lock the entry row';
  end if;

  if position('JOURNAL_ENTRY_LINKS' in upper(function_definition)) = 0 then
    raise exception 'Journal deletion lifecycle does not name dependent-link cleanup';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.delete_journal_entry_atomically(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks Journal deletion execute privilege';
  end if;

  if has_function_privilege(
    'anon',
    'public.delete_journal_entry_atomically(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anonymous Journal deletion execute privilege leaked';
  end if;

  if exists (
    select 1
    from pg_proc
    where oid = 'public.delete_journal_entry_atomically(uuid,uuid)'::regprocedure
      and prosecdef
  ) then
    raise exception 'Journal deletion lifecycle must remain SECURITY INVOKER';
  end if;
end
$$;

do $$
declare
  deleted jsonb;
  repeated jsonb;
begin
  deleted := public.delete_journal_entry_atomically(
    '65000000-0000-4000-8000-000000000401',
    '65000000-0000-4000-8000-000000000001'
  );

  if deleted <> jsonb_build_object('type', 'deleted') then
    raise exception 'deleted Journal outcome was incorrect: %', deleted;
  end if;

  if exists (
    select 1 from public.journal_entries
    where id = '65000000-0000-4000-8000-000000000401'
  ) or exists (
    select 1 from public.journal_entry_links
    where entry_id = '65000000-0000-4000-8000-000000000401'
  ) then
    raise exception 'Journal deletion left dependent links behind';
  end if;

  repeated := public.delete_journal_entry_atomically(
    '65000000-0000-4000-8000-000000000401',
    '65000000-0000-4000-8000-000000000001'
  );

  if repeated <> jsonb_build_object('type', 'not-found') then
    raise exception 'repeated Journal deletion was not not-found: %', repeated;
  end if;
end
$$;

do $$
declare
  missing jsonb;
  cross_owner jsonb;
  identity_mismatch jsonb;
begin
  missing := public.delete_journal_entry_atomically(
    '65000000-0000-4000-8000-000000000499',
    '65000000-0000-4000-8000-000000000001'
  );
  cross_owner := public.delete_journal_entry_atomically(
    '65000000-0000-4000-8000-000000000402',
    '65000000-0000-4000-8000-000000000001'
  );
  identity_mismatch := public.delete_journal_entry_atomically(
    '65000000-0000-4000-8000-000000000402',
    '65000000-0000-4000-8000-000000000002'
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
  '65000000-0000-4000-8000-000000000002',
  false
);
set role authenticated;

do $$
begin
  if not exists (
    select 1
    from public.journal_entries
    where id = '65000000-0000-4000-8000-000000000402'
      and user_id = '65000000-0000-4000-8000-000000000002'
  ) or not exists (
    select 1
    from public.journal_entry_links
    where id = '65000000-0000-4000-8000-000000000502'
  ) then
    raise exception 'cross-owner Journal deletion changed the other owner data';
  end if;
end
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '65000000-0000-4000-8000-000000000001',
  false
);
set role authenticated;

do $$
declare
  failure_error text;
begin
  begin
    perform public.delete_journal_entry_atomically(
      '65000000-0000-4000-8000-000000000403',
      '65000000-0000-4000-8000-000000000001'
    );
    raise exception 'rollback Journal deletion unexpectedly succeeded';
  exception
    when raise_exception then
      failure_error := sqlerrm;
      if failure_error <> 'forced journal deletion failure' then
        raise;
      end if;
  end;

  if not exists (
    select 1
    from public.journal_entries
    where id = '65000000-0000-4000-8000-000000000403'
  ) or not exists (
    select 1
    from public.journal_entry_links
    where entry_id = '65000000-0000-4000-8000-000000000403'
  ) then
    raise exception 'failed Journal deletion left a partial persisted outcome';
  end if;
end
$$;

reset role;

-- Self-clean all rows and disposable identities.
delete from public.journal_entries
where user_id = '65000000-0000-4000-8000-000000000001';
delete from public.journal_entries
where user_id = '65000000-0000-4000-8000-000000000002';

do $$
begin
  perform public.ralph_ci_delete_auth_user(
    '65000000-0000-4000-8000-000000000001'
  );
  perform public.ralph_ci_delete_auth_user(
    '65000000-0000-4000-8000-000000000002'
  );
end
$$;
