-- constrained-sql-fixture: true
-- Exercise the authenticated atomic Plan/Snapshot command against real RLS,
-- idempotency, revision conflicts, append-only history, and rollback paths.
-- The fixture is one transaction; all disposable users and rows are rolled back.
begin;

select public.sql_fixture_create_auth_user(
  '76000000-0000-0000-0000-000000000001',
  'runway-commit-a@example.test'
);
select public.sql_fixture_create_auth_user(
  '76000000-0000-0000-0000-000000000002',
  'runway-commit-b@example.test'
);

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.commit_household_runway_plan(jsonb)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute the atomic runway commit';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.finance_cushion_commit_fingerprint(jsonb)',
    'execute'
  ) then
    raise exception 'authenticated can execute the internal fingerprint helper';
  end if;
  if has_table_privilege(
    'authenticated',
    'public.finance_cushion_commit_idempotency',
    'select'
  ) then
    raise exception 'authenticated can read private idempotency outcomes';
  end if;
end
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76000000-0000-0000-0000-000000000001"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '76000000-0000-0000-0000-000000000001',
  true
);

create temporary table runway_commit_fixture_input (
  answers jsonb not null,
  adjustments jsonb not null,
  assessment jsonb not null
);

insert into runway_commit_fixture_input (answers, adjustments, assessment)
values (
  '{
    "schema_version": 4,
    "country": "US",
    "region": "CA",
    "currency": "USD",
    "shares_finances": false,
    "has_children": false,
    "has_support_obligations": false,
    "mine": {
      "employment": "unemployed",
      "monthly_take_home_cents": 0,
      "estimated_monthly_take_home_cents": 0,
      "entered_amount_cents": 0,
      "entered_period": "monthly",
      "entered_as": "net",
      "gross_amount_cents": 0,
      "gross_period": "monthly",
      "net_amount_cents": 0,
      "net_period": "monthly",
      "tax_filing_status": "single",
      "annual_other_deductions_cents": 0,
      "take_home_source": "user_confirmed",
      "confidence": "confirmed"
    },
    "partner": null,
    "other_income_sources": [],
    "available_cash": {"cents": 300000, "confidence": "confirmed"},
    "assets": {
      "liquid_investments": {"cents": 0, "confidence": "skipped"},
      "illiquid_investments": {"cents": 0, "confidence": "skipped"},
      "home_equity": {"cents": 0, "confidence": "skipped"},
      "retirement_tax_deferred": {"cents": 0, "confidence": "skipped"},
      "retirement_tax_free": {"cents": 0, "confidence": "skipped"}
    },
    "housing_tenure": "rent",
    "expense_mode": "quick",
    "expense_items": [],
    "completed_expense_categories": [],
    "expense_category_modes": {},
    "expense_category_subtotals": {},
    "quick_expenses": {
      "current_monthly_cents": 60000,
      "interruption_monthly_cents": 60000,
      "confidence": "confirmed"
    },
    "extreme_access": {
      "illiquid_investments_cents": 0,
      "retirement_tax_deferred_cents": 0,
      "retirement_tax_free_cents": 0
    },
    "updated_at": "2026-08-02T00:00:00.000Z"
  }'::jsonb,
  '{
    "expense_reduction_cents": 0,
    "added_cash_cents": 0,
    "added_monthly_income_cents": 0,
    "expected_unconfirmed_funds_cents": 0,
    "usable_illiquid_investments_cents": 0,
    "usable_retirement_tax_deferred_cents": 0,
    "usable_retirement_tax_free_cents": 0
  }'::jsonb,
  '{
    "success": true,
    "modelVersion": "4.0.0",
    "answers": {"schema_version": 4},
    "adjustments": {
      "expense_reduction_cents": 0,
      "added_cash_cents": 0,
      "added_monthly_income_cents": 0,
      "expected_unconfirmed_funds_cents": 0,
      "usable_illiquid_investments_cents": 0,
      "usable_retirement_tax_deferred_cents": 0,
      "usable_retirement_tax_free_cents": 0
    },
    "firstScenario": {
      "baseline": {
        "scenario": "current",
        "months_covered": 5,
        "sustainable": false,
        "starting_resources_cents": 300000,
        "continuing_monthly_income_cents": 0,
        "interruption_expenses_cents": 60000
      }
    }
  }'::jsonb
);

update runway_commit_fixture_input
set assessment = jsonb_set(
  jsonb_set(assessment, '{answers}', answers, true),
  '{adjustments}',
  adjustments,
  true
);

create function pg_temp.runway_commit(
  commit_key uuid,
  action_key uuid,
  expected_revision integer,
  snapshot_trigger text
)
returns jsonb
language sql
as $function$
  select public.commit_household_runway_plan(
    jsonb_build_object(
      'answers', input.answers,
      'adjustments', input.adjustments,
      'status', 'completed',
      'attribution', '{}'::jsonb,
      'idempotency_key', commit_key,
      'expected_revision', expected_revision,
      'snapshot_action_id', action_key,
      'snapshot_trigger', snapshot_trigger,
      'assessment', input.assessment
    )
  )
  from runway_commit_fixture_input input
  limit 1;
$function$;

do $$
declare
  outcome jsonb;
begin
  outcome := pg_temp.runway_commit(
    '76000000-0000-0000-0000-000000000101',
    '76000000-0000-0000-0000-000000000201',
    0,
    'completed'
  );
  if outcome->>'status' <> 'committed'
     or outcome->>'type' <> 'success'
     or (outcome->>'revision')::integer <> 1
     or outcome->'snapshot'->>'trigger' <> 'completed' then
    raise exception 'first completed commit returned an unexpected outcome: %', outcome;
  end if;

  if (select count(*) from public.finance_cushions) <> 1
     or (select revision from public.finance_cushions) <> 1
     or (select count(*) from public.finance_cushion_snapshots) <> 1 then
    raise exception 'first commit did not write exactly one Plan, Snapshot, and idempotency record';
  end if;
end
$$;

-- A byte-for-byte retry returns the stored semantic outcome and does not append
-- another history row or advance the Plan revision.
do $$
declare
  outcome jsonb;
begin
  outcome := pg_temp.runway_commit(
    '76000000-0000-0000-0000-000000000101',
    '76000000-0000-0000-0000-000000000201',
    0,
    'completed'
  );
  if outcome->>'type' <> 'already-applied'
     or outcome->>'replayed' <> 'true'
     or (outcome->>'revision')::integer <> 1 then
    raise exception 'idempotent retry returned an unexpected outcome: %', outcome;
  end if;
  if (select revision from public.finance_cushions) <> 1
     or (select count(*) from public.finance_cushion_snapshots) <> 1 then
    raise exception 'idempotent retry changed Plan or Snapshot history';
  end if;
end
$$;

do $$
declare
  outcome jsonb;
begin
  outcome := pg_temp.runway_commit(
    '76000000-0000-0000-0000-000000000101',
    '76000000-0000-0000-0000-000000000202',
    0,
    'completed'
  );
  if outcome->>'type' <> 'idempotency_conflict' then
    raise exception 'reused idempotency key was not rejected: %', outcome;
  end if;
end
$$;

-- A stale expected revision is typed and side-effect free.
do $$
declare
  outcome jsonb;
begin
  outcome := pg_temp.runway_commit(
    '76000000-0000-0000-0000-000000000102',
    '76000000-0000-0000-0000-000000000202',
    0,
    'completed'
  );
  if outcome->>'type' <> 'stale_revision_conflict'
     or (outcome->>'current_revision')::integer <> 1 then
    raise exception 'stale revision was not typed correctly: %', outcome;
  end if;
  if (select revision from public.finance_cushions) <> 1
     or (select count(*) from public.finance_cushion_snapshots) <> 1 then
    raise exception 'stale revision changed persisted state';
  end if;
end
$$;

-- A replacement advances the Plan exactly once and appends a model-versioned
-- immutable Snapshot with the updated trigger.
do $$
declare
  outcome jsonb;
begin
  outcome := pg_temp.runway_commit(
    '76000000-0000-0000-0000-000000000103',
    '76000000-0000-0000-0000-000000000203',
    1,
    'updated'
  );
  if outcome->>'type' <> 'success'
     or (outcome->>'revision')::integer <> 2
     or outcome->'snapshot'->>'trigger' <> 'updated' then
    raise exception 'updated commit returned an unexpected outcome: %', outcome;
  end if;
  if (select revision from public.finance_cushions) <> 2
     or (select count(*) from public.finance_cushion_snapshots) <> 2
     or (select count(*) from public.finance_cushion_snapshots
         where model_version = '4.0.0') <> 2 then
    raise exception 'updated commit did not append one model-versioned Snapshot';
  end if;
end
$$;

-- A first commit made from an imported anonymous Draft is recorded as imported.
select set_config(
  'request.jwt.claims',
  '{"sub":"76000000-0000-0000-0000-000000000002"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '76000000-0000-0000-0000-000000000002',
  true
);
do $$
declare
  outcome jsonb;
begin
  outcome := pg_temp.runway_commit(
    '76000000-0000-0000-0000-000000000104',
    '76000000-0000-0000-0000-000000000204',
    0,
    'imported'
  );
  if outcome->>'type' <> 'success'
     or (outcome->>'revision')::integer <> 1
     or outcome->'snapshot'->>'trigger' <> 'imported' then
    raise exception 'imported first commit returned an unexpected outcome: %', outcome;
  end if;
end
$$;

-- RLS and owner derivation keep user B away from A's Plan, Snapshot, and
-- private idempotency ledger. The request contains no user_id field.
do $$
declare
begin
  if exists (
    select 1 from public.finance_cushions
    where user_id = '76000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'user B can read user A Plan';
  end if;
  if exists (
    select 1 from public.finance_cushion_snapshots
    where user_id = '76000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'user B can read user A Snapshot history';
  end if;
  begin
    update public.finance_cushions
    set liquid_resources_cents = 1
    where user_id = '76000000-0000-0000-0000-000000000001';
    raise exception 'user B updated user A Plan';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

-- The append-only history cannot be mutated through the authenticated role.
do $$
begin
  begin
    update public.finance_cushion_snapshots
    set sustainable = true
    where user_id = '76000000-0000-0000-0000-000000000002';
    raise exception 'authenticated Snapshot update unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

-- Return to owner A for transaction rollback assertions.
select set_config(
  'request.jwt.claims',
  '{"sub":"76000000-0000-0000-0000-000000000001"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '76000000-0000-0000-0000-000000000001',
  true
);

-- Force the Plan write to fail after the function has acquired its row lock.
-- The trigger is created by the constrained runner role, then the command is
-- invoked as authenticated. The outer fixture transaction removes it.
reset role;
create function pg_temp.runway_plan_failure()
returns trigger
language plpgsql
as $function$
begin
  if current_setting('runway.fixture.fail_plan', true) = 'true' then
    raise exception 'forced Plan failure';
  end if;
  return new;
end;
$function$;
create trigger runway_fixture_plan_failure
before update on public.finance_cushions
for each row execute function pg_temp.runway_plan_failure();
set local role authenticated;
select set_config('runway.fixture.fail_plan', 'true', true);
do $$
begin
  begin
    perform pg_temp.runway_commit(
      '76000000-0000-0000-0000-000000000105',
      '76000000-0000-0000-0000-000000000205',
      2,
      'updated'
    );
    raise exception 'forced Plan failure unexpectedly succeeded';
  exception
    when others then
      if position('forced Plan failure' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;
select set_config('runway.fixture.fail_plan', 'false', true);

do $$
begin
  if (select revision from public.finance_cushions
      where user_id = '76000000-0000-0000-0000-000000000001') <> 2
     or (select count(*) from public.finance_cushion_snapshots
         where user_id = '76000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Plan failure was not rolled back atomically';
  end if;
end
$$;

-- A failed Plan key was not recorded: after the forced trigger is removed the
-- same key can be committed successfully rather than replaying a failure.
do $$
declare
  outcome jsonb;
begin
  outcome := pg_temp.runway_commit(
    '76000000-0000-0000-0000-000000000105',
    '76000000-0000-0000-0000-000000000205',
    2,
    'updated'
  );
  if outcome->>'type' <> 'success'
     or (outcome->>'revision')::integer <> 3 then
    raise exception 'retry after Plan failure did not commit: %', outcome;
  end if;
end
$$;

-- Reuse an existing action with a fresh idempotency key. The Plan update is
-- attempted first, then Snapshot uniqueness fails; the Plan must roll back.
do $$
begin
  begin
    perform pg_temp.runway_commit(
      '76000000-0000-0000-0000-000000000106',
      '76000000-0000-0000-0000-000000000203',
      3,
      'updated'
    );
    raise exception 'forced Snapshot failure unexpectedly succeeded';
  exception
    when unique_violation then
      null;
  end;
end
$$;

do $$
begin
  if (select revision from public.finance_cushions
      where user_id = '76000000-0000-0000-0000-000000000001') <> 3
     or (select count(*) from public.finance_cushion_snapshots
         where user_id = '76000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'Snapshot failure was not rolled back atomically';
  end if;
end
$$;

rollback;
