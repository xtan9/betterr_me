-- Run after `supabase db reset --local` against the local instance.
-- constrained-sql-fixture: true
-- Exercises the Journal link capability for every target type, including
-- duplicate links, repeated unlinking, ownership masking, and identity checks.

-- Remove residue from an interrupted run before creating disposable users.
select set_config(
  'request.jwt.claim.sub',
  '64900000-0000-4000-8000-000000000001',
  false
);
delete from public.journal_entries
where user_id = '64900000-0000-4000-8000-000000000001';
delete from public.habits
where user_id = '64900000-0000-4000-8000-000000000001';
delete from public.tasks
where user_id = '64900000-0000-4000-8000-000000000001';
delete from public.projects
where user_id = '64900000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claim.sub',
  '64900000-0000-4000-8000-000000000002',
  false
);
delete from public.journal_entries
where user_id = '64900000-0000-4000-8000-000000000002';
delete from public.habits
where user_id = '64900000-0000-4000-8000-000000000002';
delete from public.tasks
where user_id = '64900000-0000-4000-8000-000000000002';
delete from public.projects
where user_id = '64900000-0000-4000-8000-000000000002';
do $$
begin
  begin
    perform public.sql_fixture_delete_auth_user(
      '64900000-0000-4000-8000-000000000001'
    );
  exception when others then null;
  end;
  begin
    perform public.sql_fixture_delete_auth_user(
      '64900000-0000-4000-8000-000000000002'
    );
  exception when others then null;
  end;
end
$$;

select public.sql_fixture_create_auth_user(
  '64900000-0000-4000-8000-000000000001',
  'journal-link-owner@example.test'
);
select public.sql_fixture_create_auth_user(
  '64900000-0000-4000-8000-000000000002',
  'journal-link-other@example.test'
);

-- Seed one entry and one target of each supported type for each owner.
select set_config(
  'request.jwt.claim.sub',
  '64900000-0000-4000-8000-000000000001',
  false
);
insert into public.habits (id, user_id, name, frequency)
values (
  '64900000-0000-4000-8000-000000000101',
  '64900000-0000-4000-8000-000000000001',
  'Owner A habit',
  '{"type":"daily"}'::jsonb
);
insert into public.tasks (id, user_id, title)
values (
  '64900000-0000-4000-8000-000000000201',
  '64900000-0000-4000-8000-000000000001',
  'Owner A task'
);
insert into public.projects (id, user_id, name)
values (
  '64900000-0000-4000-8000-000000000301',
  '64900000-0000-4000-8000-000000000001',
  'Owner A project'
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
  '64900000-0000-4000-8000-000000000401',
  '64900000-0000-4000-8000-000000000001',
  '2026-08-03',
  'Owner A entry',
  '{"type":"doc","content":[]}'::jsonb,
  3,
  0,
  '{}'::text[]
);

select set_config(
  'request.jwt.claim.sub',
  '64900000-0000-4000-8000-000000000002',
  false
);
insert into public.habits (id, user_id, name, frequency)
values (
  '64900000-0000-4000-8000-000000000102',
  '64900000-0000-4000-8000-000000000002',
  'Owner B habit',
  '{"type":"daily"}'::jsonb
);
insert into public.tasks (id, user_id, title)
values (
  '64900000-0000-4000-8000-000000000202',
  '64900000-0000-4000-8000-000000000002',
  'Owner B task'
);
insert into public.projects (id, user_id, name)
values (
  '64900000-0000-4000-8000-000000000302',
  '64900000-0000-4000-8000-000000000002',
  'Owner B project'
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
  '64900000-0000-4000-8000-000000000402',
  '64900000-0000-4000-8000-000000000002',
  '2026-08-04',
  'Owner B entry',
  '{"type":"doc","content":[]}'::jsonb,
  3,
  0,
  '{}'::text[]
);

-- This valid link belongs to owner B. Owner A must not be able to unlink it.
insert into public.journal_entry_links (id, entry_id, link_type, link_id)
values (
  '64900000-0000-4000-8000-000000000502',
  '64900000-0000-4000-8000-000000000402',
  'task',
  '64900000-0000-4000-8000-000000000202'
);
select set_config(
  'request.jwt.claim.sub',
  '64900000-0000-4000-8000-000000000001',
  false
);
set role authenticated;

do $$
declare
  outcome jsonb;
  habit_link_id uuid;
  task_link_id uuid;
  project_link_id uuid;
begin
  -- Each supported target type can be linked and returns its typed record.
  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'habit',
    '64900000-0000-4000-8000-000000000101'
  );
  if outcome->>'type' <> 'linked' then
    raise exception 'habit link was not created: %', outcome;
  end if;
  habit_link_id := (outcome->'link'->>'id')::uuid;

  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'task',
    '64900000-0000-4000-8000-000000000201'
  );
  if outcome->>'type' <> 'linked' then
    raise exception 'task link was not created: %', outcome;
  end if;
  task_link_id := (outcome->'link'->>'id')::uuid;

  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'project',
    '64900000-0000-4000-8000-000000000301'
  );
  if outcome->>'type' <> 'linked' then
    raise exception 'project link was not created: %', outcome;
  end if;
  project_link_id := (outcome->'link'->>'id')::uuid;

  -- Repeating a link is explicitly idempotent and returns the existing row.
  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'habit',
    '64900000-0000-4000-8000-000000000101'
  );
  if outcome->>'type' <> 'already-applied'
    or (outcome->'link'->>'id')::uuid <> habit_link_id then
    raise exception 'duplicate habit link was not already-applied: %', outcome;
  end if;

  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'task',
    '64900000-0000-4000-8000-000000000201'
  );
  if outcome->>'type' <> 'already-applied'
    or (outcome->'link'->>'id')::uuid <> task_link_id then
    raise exception 'duplicate task link was not already-applied: %', outcome;
  end if;

  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'project',
    '64900000-0000-4000-8000-000000000301'
  );
  if outcome->>'type' <> 'already-applied'
    or (outcome->'link'->>'id')::uuid <> project_link_id then
    raise exception 'duplicate project link was not already-applied: %', outcome;
  end if;

  -- Missing and cross-owner targets are non-disclosing for every type.
  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'habit',
    '64900000-0000-4000-8000-000000000901'
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'missing habit was disclosed: %', outcome;
  end if;
  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'task',
    '64900000-0000-4000-8000-000000000902'
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'missing task was disclosed: %', outcome;
  end if;
  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'project',
    '64900000-0000-4000-8000-000000000903'
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'missing project was disclosed: %', outcome;
  end if;

  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'habit',
    '64900000-0000-4000-8000-000000000102'
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'cross-owner habit was disclosed: %', outcome;
  end if;
  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'task',
    '64900000-0000-4000-8000-000000000202'
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'cross-owner task was disclosed: %', outcome;
  end if;
  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'project',
    '64900000-0000-4000-8000-000000000302'
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'cross-owner project was disclosed: %', outcome;
  end if;

  -- Missing/cross-owner entries and an identity mismatch are also masked.
  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000999',
    'habit',
    '64900000-0000-4000-8000-000000000101'
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'missing entry was disclosed: %', outcome;
  end if;
  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000402',
    'habit',
    '64900000-0000-4000-8000-000000000101'
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'cross-owner entry was disclosed: %', outcome;
  end if;
  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000002',
    '64900000-0000-4000-8000-000000000402',
    'habit',
    '64900000-0000-4000-8000-000000000102'
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'identity mismatch was not masked: %', outcome;
  end if;

  outcome := public.link_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    'unsupported',
    '64900000-0000-4000-8000-000000000101'
  );
  if outcome->>'type' <> 'conflict' then
    raise exception 'invalid link type was not a conflict: %', outcome;
  end if;

  if (
    select count(*)
    from public.journal_entry_links
    where entry_id = '64900000-0000-4000-8000-000000000401'
  ) <> 3 then
    raise exception 'unexpected link count after link lifecycle';
  end if;

  -- Each supported link can be removed, and repeating removal is not-found.
  outcome := public.unlink_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    habit_link_id
  );
  if outcome->>'type' <> 'unlinked' then
    raise exception 'habit link was not removed: %', outcome;
  end if;
  outcome := public.unlink_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    habit_link_id
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'repeated habit unlink was not masked: %', outcome;
  end if;

  outcome := public.unlink_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    task_link_id
  );
  if outcome->>'type' <> 'unlinked' then
    raise exception 'task link was not removed: %', outcome;
  end if;
  outcome := public.unlink_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    task_link_id
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'repeated task unlink was not masked: %', outcome;
  end if;

  outcome := public.unlink_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    project_link_id
  );
  if outcome->>'type' <> 'unlinked' then
    raise exception 'project link was not removed: %', outcome;
  end if;
  outcome := public.unlink_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    project_link_id
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'repeated project unlink was not masked: %', outcome;
  end if;

  -- An orphaned cross-owner target is not disclosed or deleted.
  insert into public.journal_entry_links (id, entry_id, link_type, link_id)
  values (
    '64900000-0000-4000-8000-000000000501',
    '64900000-0000-4000-8000-000000000401',
    'habit',
    '64900000-0000-4000-8000-000000000102'
  );
  outcome := public.unlink_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000401',
    '64900000-0000-4000-8000-000000000501'
  );
  if outcome->>'type' <> 'not-found'
    or not exists (
      select 1
      from public.journal_entry_links
      where id = '64900000-0000-4000-8000-000000000501'
    ) then
    raise exception 'cross-owner unlink was disclosed or deleted: %', outcome;
  end if;
  delete from public.journal_entry_links
  where id = '64900000-0000-4000-8000-000000000501';

  outcome := public.unlink_journal_entry(
    '64900000-0000-4000-8000-000000000001',
    '64900000-0000-4000-8000-000000000402',
    '64900000-0000-4000-8000-000000000502'
  );
  if outcome->>'type' <> 'not-found' then
    raise exception 'cross-owner entry unlink was disclosed: %', outcome;
  end if;
end
$$;

reset role;

do $$
begin
  if (
    select count(*)
    from public.journal_entry_links
    where entry_id = '64900000-0000-4000-8000-000000000401'
  ) <> 0 then
    raise exception 'journal link lifecycle left owner A links behind';
  end if;
end
$$;

-- Self-clean all rows and disposable identities.
delete from public.journal_entries
where user_id = '64900000-0000-4000-8000-000000000001';
delete from public.habits
where user_id = '64900000-0000-4000-8000-000000000001';
delete from public.tasks
where user_id = '64900000-0000-4000-8000-000000000001';
delete from public.projects
where user_id = '64900000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  '64900000-0000-4000-8000-000000000002',
  false
);
delete from public.journal_entries
where user_id = '64900000-0000-4000-8000-000000000002';
delete from public.habits
where user_id = '64900000-0000-4000-8000-000000000002';
delete from public.tasks
where user_id = '64900000-0000-4000-8000-000000000002';
delete from public.projects
where user_id = '64900000-0000-4000-8000-000000000002';
reset role;

do $$
begin
  perform public.sql_fixture_delete_auth_user(
    '64900000-0000-4000-8000-000000000001'
  );
  perform public.sql_fixture_delete_auth_user(
    '64900000-0000-4000-8000-000000000002'
  );
end
$$;
