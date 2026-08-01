-- Expand the lifecycle storage established by #659 without replacing its
-- writer or the legacy recurring_tasks compatibility projection.

create extension if not exists btree_gist;

-- The lifecycle RPC below is the least-privilege storage seam for occurrence
-- writes. The existing #659 lifecycle RPC remains available and unchanged.
do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'betterr_recurring_task_storage'
  ) then
    create role betterr_recurring_task_storage
      nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  elsif exists (
    select 1
    from pg_roles
    where rolname = 'betterr_recurring_task_storage'
      and (
        rolcanlogin
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolinherit
        or rolreplication
        or rolbypassrls
      )
  ) then
    raise exception 'Existing recurring task storage role has unsafe attributes';
  end if;
end
$$;

grant betterr_recurring_task_storage to postgres;
grant usage, create on schema public to betterr_recurring_task_storage;

-- Keep the names used by the active lifecycle writer while exposing the
-- domain vocabulary required by the storage contract as generated aliases.
alter table public.recurring_task_series
  add column lifecycle_state text generated always as (status) stored,
  add column stopping_policy text generated always as (
    case
      when last_scheduled_date is not null
        and occurrence_limit is not null
        then 'last_scheduled_date_or_occurrence_limit'
      when last_scheduled_date is not null then 'last_scheduled_date'
      when occurrence_limit is not null then 'occurrence_limit'
      else 'unbounded'
    end
  ) stored,
  add column concurrency_token bigint generated always as (revision_token::bigint) stored;

comment on column public.recurring_task_series.lifecycle_state is
  'Domain alias for the lifecycle state retained by the active writer.';
comment on column public.recurring_task_series.stopping_policy is
  'Derived stopping policy: the Series ends at the first configured date or limit.';
comment on column public.recurring_task_series.concurrency_token is
  'Domain alias for the lifecycle revision token used by transactional commands.';

alter table public.recurring_task_series_revisions
  add column effective_date_range daterange generated always as (
    daterange(effective_from, effective_to, '[)')
  ) stored,
  add column series_defaults jsonb generated always as (defaults) stored,
  add constraint recurring_task_series_revision_id_series_key unique (id, series_id),
  add constraint recurring_task_series_revision_non_overlapping_periods
    exclude using gist (
      series_id with =,
      effective_date_range with &&
    );

comment on column public.recurring_task_series_revisions.series_defaults is
  'Domain alias for the Series Defaults JSON object retained by the active writer.';
comment on column public.recurring_task_series_revisions.effective_date_range is
  'Inclusive effective-from and exclusive effective-to local-date bounds.';

alter table public.recurring_task_occurrences
  add column creating_revision_id uuid generated always as (revision_id) stored,
  add column disposition text generated always as (state) stored,
  add column occurrence_overrides jsonb generated always as (overrides) stored,
  add column retained_sequence integer,
  add constraint recurring_task_occurrences_overrides_object_check
    check (jsonb_typeof(overrides) = 'object'),
  add constraint recurring_task_occurrences_task_key unique (task_id),
  add constraint recurring_task_occurrences_revision_series_fk
    foreign key (revision_id, series_id)
    references public.recurring_task_series_revisions (id, series_id)
    on delete restrict;

comment on column public.recurring_task_occurrences.creating_revision_id is
  'Domain alias for the Series Revision that created this Task Occurrence.';
comment on column public.recurring_task_occurrences.disposition is
  'Domain alias for the durable Task Occurrence disposition.';
comment on column public.recurring_task_occurrences.occurrence_overrides is
  'JSON object whose key presence records an Occurrence Override; a present JSON null differs from an absent key.';
comment on column public.recurring_task_occurrences.retained_sequence is
  'Stable per-Series retained sequence position for this Task Occurrence.';

create or replace function public.recurring_task_assign_retained_sequence()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if new.retained_sequence is null then
    perform pg_advisory_xact_lock(
      hashtextextended(new.series_id::text, 677::bigint)
    );

    select coalesce(max(occurrence.retained_sequence), 0) + 1
    into new.retained_sequence
    from public.recurring_task_occurrences as occurrence
    where occurrence.series_id = new.series_id;
  end if;

  return new;
end;
$function$;

create trigger recurring_task_occurrences_assign_retained_sequence
  before insert on public.recurring_task_occurrences
  for each row execute function public.recurring_task_assign_retained_sequence();

with ranked_occurrences as (
  select
    occurrence.id,
    row_number() over (
      partition by occurrence.series_id
      order by occurrence.scheduled_date, occurrence.id
    )::integer as retained_sequence
  from public.recurring_task_occurrences as occurrence
)
update public.recurring_task_occurrences as occurrence
set retained_sequence = ranked_occurrences.retained_sequence
from ranked_occurrences
where occurrence.id = ranked_occurrences.id;

alter table public.recurring_task_occurrences
  alter column retained_sequence set not null,
  add constraint recurring_task_occurrences_retained_sequence_check
    check (retained_sequence > 0);

-- The parent lifecycle already serializes Series mutations. This RPC exposes
-- the same transactional boundary for the expanded lineage fields with a
-- dedicated owner role and no direct authenticated table writes.
create policy recurring_task_storage_occurrence_insert
  on public.recurring_task_occurrences
  for insert to betterr_recurring_task_storage
  with check (
    exists (
      select 1
      from public.recurring_task_series as series
      where series.id = recurring_task_occurrences.series_id
        and series.user_id = auth.uid()
    )
  );

create policy recurring_task_storage_idempotency_insert
  on public.recurring_task_idempotency
  for insert to betterr_recurring_task_storage
  with check (user_id = auth.uid());

grant select
  on table public.recurring_task_series,
             public.recurring_task_series_revisions,
             public.recurring_task_occurrences,
             public.recurring_task_idempotency
  to betterr_recurring_task_storage;
grant update (revision_token)
  on table public.recurring_task_series
  to betterr_recurring_task_storage;
grant insert
  on table public.recurring_task_occurrences,
             public.recurring_task_idempotency
  to betterr_recurring_task_storage;
grant select (id, user_id)
  on table public.tasks
  to betterr_recurring_task_storage;

-- Keep idempotency outcomes behind the transactional seams. The existing
-- authenticated API never needed direct SELECT access to this ledger.
revoke select
  on table public.recurring_task_idempotency
  from anon, authenticated;

create or replace function public.record_recurring_task_occurrence(
  p_series_id uuid,
  p_scheduled_date date,
  p_creating_revision_id uuid,
  p_disposition text,
  p_retained_sequence integer,
  p_occurrence_overrides jsonb,
  p_task_id uuid,
  p_expected_concurrency_token bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  caller_id uuid;
  request_payload jsonb;
  request_fingerprint text;
  existing_fingerprint text;
  existing_outcome jsonb;
  locked_series public.recurring_task_series%rowtype;
  created_occurrence public.recurring_task_occurrences%rowtype;
  next_revision_token bigint;
  outcome jsonb;
begin
  caller_id := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
  );
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authenticated_subject_required';
  end if;
  if p_idempotency_key is null
    or length(btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if p_expected_concurrency_token is null then
    raise exception using errcode = '22023', message = 'expected_concurrency_token_required';
  end if;
  if p_retained_sequence is null or p_retained_sequence < 1 then
    raise exception using errcode = '22023', message = 'retained_sequence_required';
  end if;
  if p_occurrence_overrides is null
    or jsonb_typeof(p_occurrence_overrides) <> 'object' then
    raise exception using errcode = '22023', message = 'occurrence_overrides_must_be_an_object';
  end if;

  -- Serialize retries for one caller/key without granting UPDATE access to
  -- the idempotency ledger merely to lock a row that may not exist yet.
  perform pg_advisory_xact_lock(
    hashtextextended(caller_id::text || ':' || p_idempotency_key, 0)
  );

  select *
  into locked_series
  from public.recurring_task_series
  where id = p_series_id
    and user_id = caller_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'recurring_task_series_not_found';
  end if;

  request_payload := jsonb_build_object(
    'seriesId', p_series_id,
    'scheduledDate', p_scheduled_date,
    'creatingRevisionId', p_creating_revision_id,
    'disposition', p_disposition,
    'retainedSequence', p_retained_sequence,
    'occurrenceOverrides', p_occurrence_overrides,
    'taskId', p_task_id,
    'expectedConcurrencyToken', p_expected_concurrency_token
  );
  request_fingerprint := md5(request_payload::text);

  select records.fingerprint, records.outcome
  into existing_fingerprint, existing_outcome
  from public.recurring_task_idempotency as records
  where records.user_id = caller_id
    and records.operation_key = p_idempotency_key;

  if found then
    if existing_fingerprint is distinct from request_fingerprint then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_outcome || jsonb_build_object('status', 'already_applied');
  end if;

  if not exists (
    select 1
    from public.recurring_task_series_revisions as revision
    where revision.id = p_creating_revision_id
      and revision.series_id = p_series_id
      and p_scheduled_date <@ revision.effective_date_range
  ) then
    raise exception using errcode = 'P0002', message = 'recurring_task_series_revision_not_found';
  end if;

  if p_task_id is not null
    and not exists (
      select 1
      from public.tasks as task
      where task.id = p_task_id
        and task.user_id = caller_id
    ) then
    raise exception using errcode = 'P0002', message = 'recurring_task_linked_task_not_found';
  end if;

  if locked_series.revision_token::bigint <> p_expected_concurrency_token then
    raise exception using errcode = 'P0001', message = 'recurring_task_concurrency_conflict';
  end if;

  insert into public.recurring_task_occurrences (
    series_id,
    revision_id,
    scheduled_date,
    state,
    overrides,
    task_id,
    retained_sequence
  )
  values (
    p_series_id,
    p_creating_revision_id,
    p_scheduled_date,
    p_disposition,
    p_occurrence_overrides,
    p_task_id,
    p_retained_sequence
  )
  returning * into created_occurrence;

  update public.recurring_task_series
  set revision_token = revision_token + 1
  where id = p_series_id
  returning revision_token into next_revision_token;

  outcome := jsonb_build_object(
    'status', 'created',
    'occurrenceId', created_occurrence.id,
    'concurrencyToken', next_revision_token
  );

  insert into public.recurring_task_idempotency (
    user_id,
    operation_key,
    fingerprint,
    series_id,
    outcome
  )
  values (
    caller_id,
    p_idempotency_key,
    request_fingerprint,
    p_series_id,
    outcome
  );

  return outcome;
end;
$function$;

alter function public.record_recurring_task_occurrence(
  uuid, date, uuid, text, integer, jsonb, uuid, bigint, text
) owner to betterr_recurring_task_storage;

revoke all on function public.record_recurring_task_occurrence(
  uuid, date, uuid, text, integer, jsonb, uuid, bigint, text
) from public, anon;
grant execute on function public.record_recurring_task_occurrence(
  uuid, date, uuid, text, integer, jsonb, uuid, bigint, text
) to authenticated;

revoke create on schema public from betterr_recurring_task_storage;
