-- Run after `supabase db reset --local` against the local instance.
-- constrained-sql-fixture: true
-- Exercises the Journal save RPC at the database seam: create, retry/update,
-- date uniqueness, ownership masking, explicit-ID conflicts, atomic failure,
-- and concurrent date saves.

-- Remove residue from an interrupted run before creating the disposable
-- identities again. This fixture is self-cleaning because its concurrency
-- assertions use independent database sessions.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '64800000-0000-4000-8000-000000000001',
  false
);
delete from public.journal_entries
where user_id = '64800000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claim.sub',
  '64800000-0000-4000-8000-000000000002',
  false
);
delete from public.journal_entries
where user_id = '64800000-0000-4000-8000-000000000002';
reset role;

do $$
begin
  begin
    perform public.sql_fixture_delete_auth_user(
      '64800000-0000-4000-8000-000000000001'
    );
  exception when others then null;
  end;
  begin
    perform public.sql_fixture_delete_auth_user(
      '64800000-0000-4000-8000-000000000002'
    );
  exception when others then null;
  end;
end
$$;

select public.sql_fixture_create_auth_user(
  '64800000-0000-4000-8000-000000000001',
  'journal-save-owner@example.test'
);
select public.sql_fixture_create_auth_user(
  '64800000-0000-4000-8000-000000000002',
  'journal-save-other@example.test'
);

select set_config(
  'request.jwt.claim.sub',
  '64800000-0000-4000-8000-000000000001',
  false
);

set role authenticated;

do $$
declare
  outcome jsonb;
  entry_id uuid;
  saved_title text;
  saved_word_count integer;
  saved_tags text[];
  failed boolean := false;
begin
  outcome := public.save_journal_entry(
    '64800000-0000-4000-8000-000000000001',
    null,
    '2026-08-01',
    '{
      "title":"First journal entry",
      "content":{"type":"doc","content":[]},
      "mood":4,
      "word_count":2,
      "tags":["reflection"],
      "prompt_key":null
    }'::jsonb
  );
  if outcome->>'type' <> 'created'
    or outcome->'entry'->>'entry_date' <> '2026-08-01'
    or outcome->'entry'->>'title' <> 'First journal entry'
    or (outcome->'entry'->>'mood')::integer <> 4 then
    raise exception 'journal entry creation was incorrect: %', outcome;
  end if;
  entry_id := (outcome->'entry'->>'id')::uuid;

  -- A date retry updates the same row instead of creating a duplicate.
  outcome := public.save_journal_entry(
    '64800000-0000-4000-8000-000000000001',
    null,
    '2026-08-01',
    '{
      "title":"Retried journal entry",
      "content":{"type":"doc","content":[]},
      "mood":null,
      "word_count":3,
      "tags":["retry","reflection"],
      "prompt_key":"daily"
    }'::jsonb
  );
  if outcome->>'type' <> 'updated'
    or (outcome->'entry'->>'id')::uuid <> entry_id
    or outcome->'entry'->>'title' <> 'Retried journal entry'
    or outcome->'entry'->>'mood' is not null then
    raise exception 'journal entry retry was not an update: %', outcome;
  end if;

  if (
    select count(*)
    from public.journal_entries
    where user_id = '64800000-0000-4000-8000-000000000001'
      and entry_date = '2026-08-01'
  ) <> 1 then
    raise exception 'date retry created more than one journal entry';
  end if;

  -- Explicit updates share the same capability and preserve omitted fields.
  outcome := public.save_journal_entry(
    '64800000-0000-4000-8000-000000000001',
    entry_id,
    null,
    '{"title":"Explicit update"}'::jsonb
  );
  if outcome->>'type' <> 'updated'
    or (outcome->'entry'->>'id')::uuid <> entry_id
    or outcome->'entry'->>'title' <> 'Explicit update'
    or (outcome->'entry'->>'word_count')::integer <> 3 then
    raise exception 'explicit journal update was incorrect: %', outcome;
  end if;

  -- A mismatched identity is a conflict, not a date mutation.
  outcome := public.save_journal_entry(
    '64800000-0000-4000-8000-000000000001',
    entry_id,
    '2026-08-02',
    '{"title":"Wrong date"}'::jsonb
  );
  if outcome <> '{"type":"conflict"}'::jsonb then
    raise exception 'mismatched entry identity was not a conflict: %', outcome;
  end if;

  -- Missing and cross-owner entries are deliberately indistinguishable.
  outcome := public.save_journal_entry(
    '64800000-0000-4000-8000-000000000001',
    '64800000-0000-4000-8000-000000000099',
    null,
    '{"title":"Missing"}'::jsonb
  );
  if outcome <> '{"type":"not-found"}'::jsonb then
    raise exception 'missing journal entry was not masked: %', outcome;
  end if;

  outcome := public.save_journal_entry(
    '64800000-0000-4000-8000-000000000002',
    entry_id,
    null,
    '{"title":"Cross owner"}'::jsonb
  );
  if outcome <> '{"type":"not-found"}'::jsonb then
    raise exception 'cross-owner journal entry was not masked: %', outcome;
  end if;

  -- A failed update rolls back the row rather than leaving a partial save.
  begin
    perform public.save_journal_entry(
      '64800000-0000-4000-8000-000000000001',
      entry_id,
      null,
      '{"title":null,"word_count":99}'::jsonb
    );
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'invalid journal save unexpectedly succeeded';
  end if;

  select title, word_count, tags
  into saved_title, saved_word_count, saved_tags
  from public.journal_entries
  where id = entry_id;
  if saved_title <> 'Explicit update'
    or saved_word_count <> 3
    or saved_tags <> array['retry', 'reflection']::text[] then
    raise exception 'failed journal save left partial state: %, %, %',
      saved_title, saved_word_count, saved_tags;
  end if;
end
$$;

-- Two independent sessions race on the same user/date. The unique date key
-- and the insert-then-lock path must yield one created row and one update of
-- that same row.
reset role;
select public.sql_fixture_open_connection('journal-save-a');
select public.sql_fixture_open_connection('journal-save-b');
select pg_advisory_lock(64864801);
select extensions.dblink_send_query(
  'journal-save-a',
  $query$
    with request_context as materialized (
      select set_config(
        'request.jwt.claim.sub',
        '64800000-0000-4000-8000-000000000001',
        false
      ),
      set_config(
        'request.jwt.claims',
        '{"sub":"64800000-0000-4000-8000-000000000001"}',
        false
      )
    ),
    gate as materialized (
      select pg_advisory_xact_lock(64864801) from request_context
    )
    select public.save_journal_entry(
      '64800000-0000-4000-8000-000000000001',
      null,
      '2026-08-02',
      '{"title":"Concurrent first"}'::jsonb
    ) outcome
    from gate
  $query$
);
select extensions.dblink_send_query(
  'journal-save-b',
  $query$
    with request_context as materialized (
      select set_config(
        'request.jwt.claim.sub',
        '64800000-0000-4000-8000-000000000001',
        false
      ),
      set_config(
        'request.jwt.claims',
        '{"sub":"64800000-0000-4000-8000-000000000001"}',
        false
      )
    ),
    gate as materialized (
      select pg_advisory_xact_lock(64864801) from request_context
    )
    select public.save_journal_entry(
      '64800000-0000-4000-8000-000000000001',
      null,
      '2026-08-02',
      '{"title":"Concurrent second"}'::jsonb
    ) outcome
    from gate
  $query$
);
select pg_sleep(0.1);
select pg_advisory_unlock(64864801);

create temporary table journal_save_race_outcomes (outcome jsonb);
insert into journal_save_race_outcomes
select outcome
from extensions.dblink_get_result('journal-save-a')
  as result(outcome jsonb);
insert into journal_save_race_outcomes
select outcome
from extensions.dblink_get_result('journal-save-b')
  as result(outcome jsonb);
select * from extensions.dblink_get_result('journal-save-a')
  as exhausted(outcome jsonb);
select * from extensions.dblink_get_result('journal-save-b')
  as exhausted(outcome jsonb);
select extensions.dblink_disconnect('journal-save-a');
select extensions.dblink_disconnect('journal-save-b');

do $$
begin
  if (select count(*) from journal_save_race_outcomes) <> 2
    or (select count(*) from journal_save_race_outcomes where outcome->>'type' = 'created') <> 1
    or (select count(*) from journal_save_race_outcomes where outcome->>'type' = 'updated') <> 1
    or (select count(distinct (outcome->'entry'->>'id')) from journal_save_race_outcomes) <> 1
    or (
      select count(*)
      from public.journal_entries
      where user_id = '64800000-0000-4000-8000-000000000001'
        and entry_date = '2026-08-02'
    ) <> 1 then
    raise exception 'concurrent journal saves did not converge: %',
      (select jsonb_agg(outcome) from journal_save_race_outcomes);
  end if;
end
$$;

-- Self-clean the committed identities and rows created for the race.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '64800000-0000-4000-8000-000000000001',
  false
);
delete from public.journal_entries
where user_id in (
  '64800000-0000-4000-8000-000000000001',
  '64800000-0000-4000-8000-000000000002'
);
reset role;
select public.sql_fixture_delete_auth_user(
  '64800000-0000-4000-8000-000000000001'
);
select public.sql_fixture_delete_auth_user(
  '64800000-0000-4000-8000-000000000002'
);
