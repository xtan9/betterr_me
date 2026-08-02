-- Commit a complete Household Runway Plan and its immutable Snapshot as one
-- authenticated, revision-aware transaction. The application derives the
-- Assessment before calling this storage boundary; ownership is still derived
-- from auth.uid() and never from request JSON.

alter table public.finance_cushions
  add column revision integer not null default 0
    check (revision >= 0),
  add column adjustments jsonb not null default '{}'::jsonb;

comment on column public.finance_cushions.revision is
  'Authoritative Household Runway Plan revision; advances only in the atomic commit function.';
comment on column public.finance_cushions.adjustments is
  'Normalized Plan Adjustment state used by the Assessment at the last explicit commit.';

create table public.finance_cushion_commit_idempotency (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  fingerprint text not null,
  outcome jsonb not null,
  created_at timestamptz not null default now(),
  constraint finance_cushion_commit_idempotency_once
    unique (user_id, idempotency_key)
);

comment on table public.finance_cushion_commit_idempotency is
  'Private authenticated Household Runway Plan commit outcomes used for safe retries.';

alter table public.finance_cushion_commit_idempotency enable row level security;
revoke all on table public.finance_cushion_commit_idempotency from public, anon, authenticated;

-- The authenticated role may read its Plan and Snapshot history, but all
-- writes must enter through the single transaction below. The SECURITY
-- DEFINER function retains its owner privileges for the two table writes.
revoke insert, update on table public.finance_cushions from authenticated;
revoke insert on table public.finance_cushion_snapshots from authenticated;

create or replace function public.prevent_finance_cushion_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'Household Runway Snapshots are append-only';
end;
$function$;

drop trigger if exists finance_cushion_snapshots_append_only
  on public.finance_cushion_snapshots;
create trigger finance_cushion_snapshots_append_only
before update or delete on public.finance_cushion_snapshots
for each row execute function public.prevent_finance_cushion_snapshot_mutation();

create or replace function public.finance_cushion_commit_fingerprint(
  p_request jsonb
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select md5(
    (p_request - 'idempotency_key' - 'assessment')::text
  );
$function$;

create or replace function public.commit_household_runway_plan(
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_idempotency_key uuid;
  v_expected_revision integer;
  v_snapshot_action_id uuid;
  v_snapshot_trigger text;
  v_status text;
  v_answers jsonb;
  v_adjustments jsonb;
  v_attribution jsonb;
  v_assessment jsonb;
  v_fingerprint text;
  v_existing_commit public.finance_cushion_commit_idempotency%rowtype;
  v_plan public.finance_cushions%rowtype;
  v_plan_row_exists boolean := false;
  v_plan_exists boolean := false;
  v_current_revision integer := 0;
  v_snapshot public.finance_cushion_snapshots%rowtype;
  v_snapshot_summary jsonb;
  v_snapshots jsonb;
  v_outcome jsonb;
  v_scenario text;
  v_months_covered numeric;
  v_sustainable boolean;
  v_model_version text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'Household Runway commit request must be an object';
  end if;

  v_idempotency_key := nullif(p_request->>'idempotency_key', '')::uuid;
  v_expected_revision := nullif(p_request->>'expected_revision', '')::integer;
  v_snapshot_action_id := nullif(p_request->>'snapshot_action_id', '')::uuid;
  v_snapshot_trigger := nullif(p_request->>'snapshot_trigger', '');
  v_status := p_request->>'status';
  v_answers := p_request->'answers';
  v_adjustments := p_request->'adjustments';
  v_attribution := coalesce(p_request->'attribution', '{}'::jsonb);
  v_assessment := p_request->'assessment';

  if v_idempotency_key is null
     or v_expected_revision is null
     or v_expected_revision < 0
     or v_snapshot_action_id is null
     or v_snapshot_trigger is null
     or v_status <> 'completed'
     or jsonb_typeof(v_answers) <> 'object'
     or jsonb_typeof(v_adjustments) <> 'object'
     or jsonb_typeof(v_attribution) <> 'object'
     or jsonb_typeof(v_assessment) <> 'object' then
    raise exception 'Household Runway commit request is incomplete';
  end if;

  -- Keep the database boundary strict as well as the HTTP boundary. The
  -- complete adjustment is intentionally exact: omitted fields are not
  -- silently interpreted as zero, and no storage-shaped extras are accepted.
  if not (v_adjustments ?& array[
      'expense_reduction_cents',
      'added_cash_cents',
      'added_monthly_income_cents',
      'expected_unconfirmed_funds_cents',
      'usable_illiquid_investments_cents',
      'usable_retirement_tax_deferred_cents',
      'usable_retirement_tax_free_cents'
    ]::text[])
    or v_adjustments - array[
      'expense_reduction_cents',
      'added_cash_cents',
      'added_monthly_income_cents',
      'expected_unconfirmed_funds_cents',
      'usable_illiquid_investments_cents',
      'usable_retirement_tax_deferred_cents',
      'usable_retirement_tax_free_cents'
    ]::text[] <> '{}'::jsonb
    or exists (
      select 1
      from jsonb_each(v_adjustments) as adjustment
      where jsonb_typeof(adjustment.value) <> 'number'
         or case
              when jsonb_typeof(adjustment.value) = 'number' then
                adjustment.value::text !~ '^(0|[1-9][0-9]*)$'
                or adjustment.value::text::numeric > 100000000000
              else false
            end
    ) then
    raise exception 'Household Runway Plan Adjustment must be complete and normalized';
  end if;

  if v_answers->>'schema_version' <> '4'
     or not (v_answers ?& array[
       'schema_version', 'country', 'region', 'currency',
       'shares_finances', 'has_children', 'has_support_obligations',
       'mine', 'partner', 'other_income_sources', 'available_cash',
       'assets', 'housing_tenure', 'expense_mode', 'expense_items',
       'completed_expense_categories', 'expense_category_modes',
       'expense_category_subtotals', 'quick_expenses', 'extreme_access',
       'updated_at'
     ]::text[])
     or v_answers - array[
       'schema_version', 'country', 'region', 'currency',
       'shares_finances', 'has_children', 'has_support_obligations',
       'mine', 'partner', 'other_income_sources', 'available_cash',
       'assets', 'housing_tenure', 'expense_mode', 'expense_items',
       'completed_expense_categories', 'expense_category_modes',
       'expense_category_subtotals', 'quick_expenses', 'extreme_access',
       'updated_at'
     ]::text[] <> '{}'::jsonb
     or v_answers->>'country' not in ('US', 'CA', 'CN', 'TW')
     or v_answers->>'currency' not in ('USD', 'CAD', 'CNY', 'TWD')
     or char_length(trim(v_answers->>'region')) = 0
     or jsonb_typeof(v_answers->'mine') <> 'object'
     or jsonb_typeof(v_answers->'other_income_sources') <> 'array'
     or jsonb_typeof(v_answers->'assets') <> 'object'
     or jsonb_typeof(v_answers->'expense_items') <> 'array'
     or jsonb_typeof(v_answers->'quick_expenses') <> 'object'
     or jsonb_typeof(v_answers->'extreme_access') <> 'object'
     or nullif(v_answers->>'updated_at', '') is null then
    raise exception 'Household Runway Plan answers must be complete and normalized';
  end if;

  if v_assessment->>'success' <> 'true'
     or v_assessment->'answers' <> v_answers
     or v_assessment->'adjustments' <> v_adjustments then
    raise exception 'Household Runway Assessment does not match the committed inputs';
  end if;

  v_fingerprint := public.finance_cushion_commit_fingerprint(p_request);

  -- There may be no Plan row to lock for the first commit. A per-user
  -- transaction advisory lock serializes first writers and ordinary updates
  -- before the row lock below is taken.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':household-runway-plan', 760)
  );

  select *
  into v_existing_commit
  from public.finance_cushion_commit_idempotency
  where user_id = v_user_id
    and idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_existing_commit.fingerprint <> v_fingerprint then
      return jsonb_build_object(
        'status', 'conflict',
        'type', 'idempotency_conflict'
      );
    end if;
    return jsonb_set(
      jsonb_set(v_existing_commit.outcome, '{type}', '"already-applied"'::jsonb),
      '{replayed}',
      'true'::jsonb
    );
  end if;

  select *
  into v_plan
  from public.finance_cushions
  where user_id = v_user_id
  for update;
  v_plan_row_exists := found;
  -- A retained V1 Cushion row is not a committed Household Runway Plan. It
  -- is upgraded in place on the first complete authenticated commit.
  v_plan_exists := found and v_plan.answers is not null;
  v_current_revision := case
    when v_plan_exists then coalesce(v_plan.revision, 0)
    else 0
  end;

  if v_expected_revision <> v_current_revision then
    return jsonb_build_object(
      'status', 'conflict',
      'type', 'stale_revision_conflict',
      'expected_revision', v_expected_revision,
      'current_revision', v_current_revision
    );
  end if;

  if (v_plan_exists and v_snapshot_trigger <> 'updated')
     or (not v_plan_exists and v_snapshot_trigger not in ('completed', 'imported')) then
    return jsonb_build_object(
      'status', 'invalid',
      'type', 'invalid_trigger',
      'message', 'Snapshot trigger does not match the current Plan state'
    );
  end if;

  v_scenario := v_assessment #>> '{firstScenario,baseline,scenario}';
  v_months_covered := nullif(
    v_assessment #>> '{firstScenario,baseline,months_covered}',
    ''
  )::numeric;
  v_sustainable := (v_assessment #>> '{firstScenario,baseline,sustainable}')::boolean;
  v_model_version := nullif(v_assessment->>'modelVersion', '');

  if v_scenario is null or v_sustainable is null or v_model_version is null then
    raise exception 'Household Runway Assessment is incomplete';
  end if;

  if v_plan_row_exists then
    update public.finance_cushions
    set
      revision = case when v_plan_exists then v_current_revision + 1 else 1 end,
      liquid_resources_cents = greatest(
        0,
        (v_assessment #>> '{firstScenario,baseline,starting_resources_cents}')::bigint
      ),
      monthly_essential_expenses_cents = greatest(
        1,
        (v_assessment #>> '{firstScenario,baseline,interruption_expenses_cents}')::bigint
      ),
      monthly_continuing_income_cents = greatest(
        0,
        (v_assessment #>> '{firstScenario,baseline,continuing_monthly_income_cents}')::bigint
      ),
      answers = v_answers,
      latest_result = v_assessment,
      adjustments = v_adjustments,
      model_version = v_model_version,
      status = v_status,
      country = v_answers->>'country',
      region = v_answers->>'region',
      currency = v_answers->>'currency',
      attribution = v_attribution,
      completed_at = coalesce(v_plan.completed_at, now()),
      updated_at = now()
    where id = v_plan.id
      and user_id = v_user_id
    returning * into v_plan;
  else
    insert into public.finance_cushions (
      user_id,
      revision,
      liquid_resources_cents,
      monthly_essential_expenses_cents,
      monthly_continuing_income_cents,
      answers,
      latest_result,
      adjustments,
      model_version,
      status,
      country,
      region,
      currency,
      attribution,
      completed_at
    )
    values (
      v_user_id,
      1,
      greatest(
        0,
        (v_assessment #>> '{firstScenario,baseline,starting_resources_cents}')::bigint
      ),
      greatest(
        1,
        (v_assessment #>> '{firstScenario,baseline,interruption_expenses_cents}')::bigint
      ),
      greatest(
        0,
        (v_assessment #>> '{firstScenario,baseline,continuing_monthly_income_cents}')::bigint
      ),
      v_answers,
      v_assessment,
      v_adjustments,
      v_model_version,
      v_status,
      v_answers->>'country',
      v_answers->>'region',
      v_answers->>'currency',
      v_attribution,
      now()
    )
    returning * into v_plan;
  end if;

  insert into public.finance_cushion_snapshots (
    plan_id,
    user_id,
    action_id,
    trigger,
    scenario,
    months_covered,
    sustainable,
    result,
    model_version
  )
  values (
    v_plan.id,
    v_user_id,
    v_snapshot_action_id,
    v_snapshot_trigger,
    v_scenario,
    v_months_covered,
    v_sustainable,
    v_assessment,
    v_model_version
  )
  returning * into v_snapshot;

  v_snapshot_summary := jsonb_build_object(
    'id', v_snapshot.id,
    'trigger', v_snapshot.trigger,
    'scenario', v_snapshot.scenario,
    'months_covered', v_snapshot.months_covered,
    'sustainable', v_snapshot.sustainable,
    'model_version', v_snapshot.model_version,
    'created_at', v_snapshot.created_at
  );

  select coalesce(
    jsonb_agg(to_jsonb(history) order by history.created_at desc),
    '[]'::jsonb
  )
  into v_snapshots
  from (
    select
      id,
      trigger,
      scenario,
      months_covered,
      sustainable,
      model_version,
      created_at
    from public.finance_cushion_snapshots
    where user_id = v_user_id
    order by created_at desc
    limit 24
  ) as history;

  v_outcome := jsonb_build_object(
    'status', 'committed',
    'type', 'success',
    'revision', v_plan.revision,
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'user_id', v_plan.user_id,
      'revision', v_plan.revision,
      'liquid_resources_cents', v_plan.liquid_resources_cents,
      'monthly_essential_expenses_cents', v_plan.monthly_essential_expenses_cents,
      'monthly_continuing_income_cents', v_plan.monthly_continuing_income_cents,
      'answers', v_plan.answers,
      'latest_result', v_plan.latest_result,
      'adjustments', v_plan.adjustments,
      'model_version', v_plan.model_version,
      'status', v_plan.status,
      'country', v_plan.country,
      'region', v_plan.region,
      'currency', v_plan.currency,
      'attribution', v_plan.attribution,
      'completed_at', v_plan.completed_at,
      'created_at', v_plan.created_at,
      'updated_at', v_plan.updated_at
    ),
    'assessment', v_assessment,
    'snapshot', v_snapshot_summary,
    'snapshots', v_snapshots
  );

  insert into public.finance_cushion_commit_idempotency (
    user_id,
    idempotency_key,
    fingerprint,
    outcome
  )
  values (
    v_user_id,
    v_idempotency_key,
    v_fingerprint,
    v_outcome
  );

  return v_outcome;
end;
$function$;

revoke all on function public.prevent_finance_cushion_snapshot_mutation()
  from public, anon, authenticated;
revoke all on function public.finance_cushion_commit_fingerprint(jsonb)
  from public, anon, authenticated;
revoke all on function public.commit_household_runway_plan(jsonb)
  from public, anon;
grant execute on function public.commit_household_runway_plan(jsonb)
  to authenticated;
