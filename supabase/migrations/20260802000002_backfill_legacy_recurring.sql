-- Backfill legacy recurring work only when its lineage is demonstrable.
--
-- The earlier lifecycle migration established the target tables and performed
-- a best-effort compatibility backfill. This migration makes that boundary
-- safe to rerun for legacy rows that were created or repaired during rollout:
-- malformed recurrence metadata, missing Scheduled Dates, cross-owner links,
-- and duplicate positions are reported and kept as standalone tasks. No
-- missing positions are regenerated from a legacy generation counter.

-- A legacy task has a durable Scheduled Date only after its occurrence fact
-- is inserted. Preserve the normal immutability guard while allowing this
-- one-time null-to-date migration transition under a private transaction
-- setting that ordinary task writers cannot provide.
create or replace function public.recurring_task_task_write_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if TG_OP = 'INSERT' then
    if (
      NEW.recurring_task_id is not null
      or NEW.recurring_series_id is not null
      or NEW.recurring_occurrence_id is not null
    ) and current_setting('betterr.recurring_lifecycle', true)
      is distinct from 'on' then
      raise exception 'Recurring task mutations must use the lifecycle boundary';
    end if;
    return NEW;
  end if;

  if current_setting('betterr.recurring_lifecycle', true) is distinct from 'on' then
    if OLD.recurring_task_id is not null
       or OLD.recurring_series_id is not null
       or OLD.recurring_occurrence_id is not null
       or NEW.recurring_task_id is not null
       or NEW.recurring_series_id is not null
       or NEW.recurring_occurrence_id is not null then
      raise exception 'Recurring task mutations must use the lifecycle boundary';
    end if;
  end if;

  if TG_OP = 'UPDATE'
     and NEW.scheduled_date is distinct from OLD.scheduled_date
     and not (
       OLD.scheduled_date is null
       and NEW.scheduled_date is not null
       and current_setting('betterr.recurring_legacy_backfill', true) = 'on'
     ) then
    raise exception 'Scheduled Date is immutable';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$function$;

create table if not exists public.recurring_task_series_stopping_policy_history (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null
    references public.recurring_task_series(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  end_type text not null
    check (end_type in ('never', 'after_count', 'on_date')),
  occurrence_limit integer,
  last_scheduled_date date,
  legacy_instances_generated integer,
  legacy_next_generate_date date,
  source text not null default 'legacy-backfill',
  created_at timestamptz not null default now(),
  unique (series_id, effective_from),
  check (effective_to is null or effective_to > effective_from),
  check (occurrence_limit is null or occurrence_limit > 0),
  check (
    last_scheduled_date is null
    or last_scheduled_date >= effective_from
  )
);

comment on table public.recurring_task_series_stopping_policy_history is
  'Retained stopping-policy facts captured while legacy recurring work crosses the lifecycle boundary.';

alter table public.recurring_task_series_stopping_policy_history enable row level security;

create policy recurring_task_stopping_policy_history_owner_select
  on public.recurring_task_series_stopping_policy_history
  for select
  using (exists (
    select 1
    from public.recurring_task_series series
    where series.id = series_id
      and series.user_id = auth.uid()
  ));

grant select on public.recurring_task_series_stopping_policy_history
  to authenticated, service_role;

create or replace function public.recurring_task_legacy_rule_is_safe(
  p_rule jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  frequency text;
  interval_text text;
  interval_value integer;
  value_text text;
  week_position text;
begin
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    return false;
  end if;

  frequency := p_rule->>'frequency';
  interval_text := p_rule->>'interval';
  if frequency not in ('daily', 'weekly', 'monthly', 'yearly')
     or interval_text is null
     or interval_text !~ '^[0-9]+$' then
    return false;
  end if;

  interval_value := interval_text::integer;
  if interval_value < 1 or interval_value > 365 then
    return false;
  end if;

  if frequency = 'daily' then
    return true;
  end if;

  if frequency = 'weekly' then
    if jsonb_typeof(p_rule->'days_of_week') <> 'array'
       or jsonb_array_length(p_rule->'days_of_week') = 0 then
      return false;
    end if;
    for value_text in
      select value
      from jsonb_array_elements_text(p_rule->'days_of_week') as value
    loop
      if value_text !~ '^[0-6]$' then
        return false;
      end if;
    end loop;
    return true;
  end if;

  if frequency = 'monthly' then
    week_position := p_rule->>'week_position';
    if p_rule ? 'week_position' then
      if week_position is null
         or week_position not in ('first', 'second', 'third', 'fourth', 'last')
         or p_rule->>'day_of_week_monthly' is null
         or (p_rule->>'day_of_week_monthly') !~ '^[0-6]$' then
        return false;
      end if;
      return true;
    end if;
    return coalesce(
      (p_rule->>'day_of_month') ~ '^[0-9]+$'
        and (p_rule->>'day_of_month')::integer between 1 and 31,
      false
    );
  end if;

  return coalesce(
    (p_rule->>'month_of_year') ~ '^[0-9]+$'
      and (p_rule->>'month_of_year')::integer between 1 and 12
      and (p_rule->>'day_of_month') ~ '^[0-9]+$'
      and (p_rule->>'day_of_month')::integer between 1 and 31,
    false
  );
exception when others then
  return false;
end;
$function$;

create or replace function public.recurring_task_legacy_record_is_safe(
  p_legacy public.recurring_tasks
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
begin
  if p_legacy.id is null
     or p_legacy.user_id is null
     or p_legacy.start_date is null
     or p_legacy.status is null
     or p_legacy.status not in ('active', 'paused', 'archived')
     or not public.recurring_task_legacy_rule_is_safe(p_legacy.recurrence_rule) then
    return false;
  end if;

  if p_legacy.end_type = 'never' then
    return true;
  end if;
  if p_legacy.end_type = 'after_count' then
    return p_legacy.end_count is not null and p_legacy.end_count > 0;
  end if;
  if p_legacy.end_type = 'on_date' then
    return p_legacy.end_date is not null
      and p_legacy.end_date >= p_legacy.start_date;
  end if;
  return false;
exception when others then
  return false;
end;
$function$;

create or replace function public.recurring_task_legacy_defaults(
  p_legacy public.recurring_tasks
)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'title', p_legacy.title,
    'description', p_legacy.description,
    'priority', p_legacy.priority,
    'categoryId', p_legacy.category_id,
    'dueTime', p_legacy.due_time,
    'status', 'todo',
    'section', 'personal',
    'projectId', null
  );
$function$;

create or replace function public.recurring_task_legacy_task_overrides(
  p_task public.tasks,
  p_legacy public.recurring_tasks
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  overrides jsonb := '{}'::jsonb;
begin
  -- Presence is evidence. IS DISTINCT FROM deliberately preserves an
  -- explicit JSON null when a legacy default was non-null.
  if p_task.title is distinct from p_legacy.title then
    overrides := overrides || jsonb_build_object('title', p_task.title);
  end if;
  if p_task.description is distinct from p_legacy.description then
    overrides := overrides || jsonb_build_object('description', p_task.description);
  end if;
  if p_task.priority is distinct from p_legacy.priority then
    overrides := overrides || jsonb_build_object('priority', p_task.priority);
  end if;
  if p_task.category_id is distinct from p_legacy.category_id then
    overrides := overrides || jsonb_build_object('categoryId', p_task.category_id);
  end if;
  if p_task.due_time is distinct from p_legacy.due_time then
    overrides := overrides || jsonb_build_object('dueTime', p_task.due_time);
  end if;
  if p_task.due_date is distinct from p_task.original_date then
    overrides := overrides || jsonb_build_object('dueDate', p_task.due_date);
  end if;
  if p_task.status is distinct from 'todo' and not p_task.is_completed then
    overrides := overrides || jsonb_build_object('status', p_task.status);
  end if;
  if p_task.section is distinct from 'personal' then
    overrides := overrides || jsonb_build_object('section', p_task.section);
  end if;
  if p_task.project_id is not null then
    overrides := overrides || jsonb_build_object('projectId', p_task.project_id);
  end if;
  return overrides;
end;
$function$;

create or replace function public.recurring_task_backfill_legacy_preflight(
  p_cutover_date date default current_date,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  authenticated_user_id uuid := auth.uid();
  legacy_record_count bigint;
  safe_series_count bigint;
  series_to_create_count bigint;
  series_already_present_count bigint;
  safe_task_count bigint;
  uncertain_task_count bigint;
  unsafe_record_task_count bigint;
  cross_owner_task_count bigint;
  missing_scheduled_date_count bigint;
  unsafe_scheduled_date_count bigint;
  duplicate_position_task_count bigint;
  diagnostics jsonb;
begin
  if p_cutover_date is null then
    raise exception using
      errcode = '22023',
      message = 'Legacy recurring backfill requires a cutover date';
  end if;

  if p_user_id is null
     and session_user not in ('postgres', 'supabase_admin', 'service_role')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'All-owner legacy recurring preflight requires migration authority';
  end if;

  if p_user_id is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and authenticated_user_id is distinct from p_user_id then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  select count(*)
  into legacy_record_count
  from public.recurring_tasks legacy
  where p_user_id is null or legacy.user_id = p_user_id;

  select
    count(*) filter (
      where public.recurring_task_legacy_record_is_safe(legacy)
    ),
    count(*) filter (
      where public.recurring_task_legacy_record_is_safe(legacy)
        and exists (
          select 1
          from public.recurring_task_series series
          where series.id = legacy.id
        )
    ),
    count(*) filter (
      where public.recurring_task_legacy_record_is_safe(legacy)
        and not exists (
          select 1
          from public.recurring_task_series series
          where series.id = legacy.id
        )
    )
  into safe_series_count, series_already_present_count, series_to_create_count
  from public.recurring_tasks legacy
  where p_user_id is null or legacy.user_id = p_user_id;

  with candidate_base as (
    select
      source_task.id as task_id,
      source_legacy.id as legacy_id,
      source_legacy.user_id as legacy_user_id,
      source_task.user_id as task_user_id,
      source_task.original_date,
      source_legacy.start_date,
      source_legacy.recurrence_rule,
      public.recurring_task_legacy_record_is_safe(source_legacy) as record_safe
    from public.tasks source_task
    join public.recurring_tasks source_legacy
      on source_legacy.id = source_task.recurring_task_id
    where p_user_id is null or source_legacy.user_id = p_user_id
  ), candidate_positions as (
    select
      candidate_base.*,
      count(*) over (
        partition by candidate_base.legacy_id, candidate_base.original_date
      ) as position_count
    from candidate_base
  ), candidate_classified as (
    select
      candidate_positions.*,
      case
        when not record_safe then 'unsafe-recurrence-metadata'
        when task_user_id is distinct from legacy_user_id then 'cross-owner'
        when position_count > 1 then 'duplicate-scheduled-position'
        when original_date is null then 'missing-scheduled-date'
        when not public.recurring_task_safe_scheduled_date(
          recurrence_rule,
          start_date,
          start_date,
          original_date
        ) then 'unsafe-scheduled-date'
        else 'safe'
      end as classification
    from candidate_positions
  )
  select
    count(*) filter (where classification = 'safe'),
    count(*) filter (where classification <> 'safe'),
    count(*) filter (where classification = 'unsafe-recurrence-metadata'),
    count(*) filter (where classification = 'cross-owner'),
    count(*) filter (where classification = 'missing-scheduled-date'),
    count(*) filter (where classification = 'unsafe-scheduled-date'),
    count(*) filter (where classification = 'duplicate-scheduled-position')
  into
    safe_task_count,
    uncertain_task_count,
    unsafe_record_task_count,
    cross_owner_task_count,
    missing_scheduled_date_count,
    unsafe_scheduled_date_count,
    duplicate_position_task_count
  from candidate_classified;

  diagnostics := jsonb_build_object(
    'unsafeRecurrenceMetadataTasks', unsafe_record_task_count,
    'crossOwnerTasks', cross_owner_task_count,
    'missingScheduledDateTasks', missing_scheduled_date_count,
    'unsafeScheduledDateTasks', unsafe_scheduled_date_count,
    'duplicateScheduledPositionTasks', duplicate_position_task_count
  );

  return jsonb_build_object(
    'status', 'preflight',
    'type', 'preflight',
    'cutoverDate', p_cutover_date,
    'legacyRecordCount', legacy_record_count,
    'safeSeriesCount', safe_series_count,
    'seriesAlreadyPresentCount', series_already_present_count,
    'seriesToCreateCount', series_to_create_count,
    'safeTaskCount', safe_task_count,
    'uncertainTaskCount', uncertain_task_count,
    'diagnostics', diagnostics
  );
end;
$function$;

create or replace function public.recurring_task_backfill_legacy(
  p_cutover_date date default current_date,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  authenticated_user_id uuid := auth.uid();
  preflight jsonb;
  outcome jsonb;
  legacy public.recurring_tasks%rowtype;
  task public.tasks%rowtype;
  series public.recurring_task_series%rowtype;
  occurrence public.recurring_task_occurrences%rowtype;
  revision_id uuid;
  occurrence_id uuid;
  mapped_state text;
  time_zone text;
  defaults jsonb;
  overrides jsonb;
  task_details jsonb;
  series_was_present boolean;
  task_was_linked boolean;
  inserted_occurrence boolean;
  migrated_series_count bigint := 0;
  migrated_task_count bigint := 0;
  migrated_occurrence_count bigint := 0;
  policy_history_count bigint := 0;
  detached_task_count bigint := 0;
  max_coverage_horizon date;
  retained_count bigint;
begin
  if p_cutover_date is null then
    raise exception using
      errcode = '22023',
      message = 'Legacy recurring backfill requires a cutover date';
  end if;

  if p_user_id is null
     and session_user not in ('postgres', 'supabase_admin', 'service_role')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'All-owner legacy backfill requires migration authority';
  end if;

  if p_user_id is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and authenticated_user_id is distinct from p_user_id then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  perform set_config('betterr.recurring_lifecycle', 'on', true);
  perform set_config('betterr.recurring_legacy_backfill', 'on', true);
  preflight := public.recurring_task_backfill_legacy_preflight(
    p_cutover_date,
    p_user_id
  );
  if preflight->>'status' = 'not-found' then
    return preflight;
  end if;

  for legacy in
    select source_legacy.*
    from public.recurring_tasks source_legacy
    where (p_user_id is null or source_legacy.user_id = p_user_id)
      and public.recurring_task_legacy_record_is_safe(source_legacy)
    order by source_legacy.id
  loop
    mapped_state := case legacy.status
      when 'paused' then 'paused'
      when 'archived' then 'ended'
      else 'active'
    end;
    defaults := public.recurring_task_legacy_defaults(legacy);
    time_zone := coalesce(
      (
        select profile.timezone
        from public.profiles profile
        where profile.id = legacy.user_id
          and exists (
            select 1
            from pg_timezone_names
            where name = profile.timezone
          )
      ),
      'UTC'
    );

    select exists (
      select 1
      from public.recurring_task_series existing_series
      where existing_series.id = legacy.id
    ) into series_was_present;

    if not series_was_present then
      revision_id := gen_random_uuid();
      insert into public.recurring_task_series (
        id,
        user_id,
        status,
        recurrence_anchor,
        activation_date,
        occurrence_limit,
        last_scheduled_date,
        time_zone,
        current_revision_id,
        created_at,
        updated_at
      ) values (
        legacy.id,
        legacy.user_id,
        mapped_state,
        legacy.start_date,
        legacy.start_date,
        case when legacy.end_type = 'after_count'
          then legacy.end_count else null end,
        case when legacy.end_type = 'on_date'
          then legacy.end_date else null end,
        time_zone,
        revision_id,
        coalesce(legacy.created_at, now()),
        coalesce(legacy.updated_at, legacy.created_at, now())
      );

      insert into public.recurring_task_series_revisions (
        id,
        series_id,
        effective_from,
        effective_to,
        state,
        recurrence_rule,
        recurrence_anchor,
        activation_date,
        defaults,
        created_at
      ) values (
        revision_id,
        legacy.id,
        legacy.start_date,
        case when legacy.end_type = 'on_date'
          then legacy.end_date + 1 else null end,
        mapped_state,
        legacy.recurrence_rule,
        legacy.start_date,
        legacy.start_date,
        defaults,
        coalesce(legacy.created_at, now())
      );
      migrated_series_count := migrated_series_count + 1;
    else
      select * into series
      from public.recurring_task_series existing_series
      where existing_series.id = legacy.id
      for update;

      select revision.id into revision_id
      from public.recurring_task_series_revisions revision
      where revision.series_id = legacy.id
        and revision.effective_from = legacy.start_date
      order by revision.created_at, revision.id
      limit 1;

      if revision_id is null then
        revision_id := gen_random_uuid();
        insert into public.recurring_task_series_revisions (
          id,
          series_id,
          effective_from,
          effective_to,
          state,
          recurrence_rule,
          recurrence_anchor,
          activation_date,
          defaults,
          created_at
        ) values (
          revision_id,
          legacy.id,
          legacy.start_date,
          case when legacy.end_type = 'on_date'
            then legacy.end_date + 1 else null end,
          mapped_state,
          legacy.recurrence_rule,
          legacy.start_date,
          legacy.start_date,
          defaults,
          coalesce(legacy.created_at, now())
        );
      end if;

      update public.recurring_task_series
      set current_revision_id = coalesce(current_revision_id, revision_id)
      where id = legacy.id;
    end if;

    insert into public.recurring_task_series_stopping_policy_history (
      series_id,
      effective_from,
      effective_to,
      end_type,
      occurrence_limit,
      last_scheduled_date,
      legacy_instances_generated,
      legacy_next_generate_date
    ) values (
      legacy.id,
      legacy.start_date,
      case when legacy.end_type = 'on_date'
        then legacy.end_date + 1 else null end,
      legacy.end_type,
      case when legacy.end_type = 'after_count'
        then legacy.end_count else null end,
      case when legacy.end_type = 'on_date'
        then legacy.end_date else null end,
      legacy.instances_generated,
      legacy.next_generate_date
    ) on conflict (series_id, effective_from) do nothing;
    if found then
      policy_history_count := policy_history_count + 1;
    end if;

    for task in
      select candidate.*
      from public.tasks candidate
      where candidate.recurring_task_id = legacy.id
        and candidate.user_id = legacy.user_id
        and candidate.original_date is not null
        and public.recurring_task_safe_scheduled_date(
          legacy.recurrence_rule,
          legacy.start_date,
          legacy.start_date,
          candidate.original_date
        )
        and not exists (
          select 1
          from public.tasks duplicate
          where duplicate.recurring_task_id = candidate.recurring_task_id
            and duplicate.original_date = candidate.original_date
            and duplicate.id <> candidate.id
        )
      order by candidate.original_date, candidate.id
    loop
      select revision.id into revision_id
      from public.recurring_task_series_revisions revision
      where revision.series_id = legacy.id
        and revision.effective_from <= task.original_date
        and (
          revision.effective_to is null
          or task.original_date < revision.effective_to
        )
      order by revision.effective_from desc, revision.id
      limit 1;

      if revision_id is null then
        continue;
      end if;

      overrides := public.recurring_task_legacy_task_overrides(task, legacy);
      task_details := jsonb_build_object(
        'title', task.title,
        'description', task.description,
        'priority', task.priority,
        'categoryId', task.category_id,
        'dueTime', task.due_time,
        'dueDate', task.due_date,
        'status', task.status,
        'section', task.section,
        'sortOrder', task.sort_order,
        'projectId', task.project_id
      );
      task_was_linked := task.recurring_series_id = legacy.id
        and task.recurring_occurrence_id is not null
        and task.scheduled_date = task.original_date;
      occurrence_id := gen_random_uuid();
      inserted_occurrence := false;

      insert into public.recurring_task_occurrences (
        id,
        series_id,
        revision_id,
        scheduled_date,
        due_date,
        details,
        state,
        overrides,
        task_id,
        completed_at
      ) values (
        occurrence_id,
        legacy.id,
        revision_id,
        task.original_date,
        task.due_date,
        task_details,
        case when task.is_completed then 'completed' else 'open' end,
        overrides,
        task.id,
        case when task.is_completed then task.completed_at else null end
      ) on conflict do nothing;

      if not found then
        select * into occurrence
        from public.recurring_task_occurrences existing_occurrence
        where existing_occurrence.series_id = legacy.id
          and existing_occurrence.scheduled_date = task.original_date
        for update;
        if occurrence.task_id is distinct from task.id then
          continue;
        end if;
        occurrence_id := occurrence.id;
      else
        inserted_occurrence := true;
        migrated_occurrence_count := migrated_occurrence_count + 1;
      end if;

      update public.tasks
      set recurring_series_id = legacy.id,
          recurring_occurrence_id = occurrence_id,
          scheduled_date = task.original_date,
          recurrence_occurrence_state = case
            when task.is_completed then 'completed' else 'open' end,
          occurrence_overrides = overrides
      where id = task.id;

      if not task_was_linked then
        migrated_task_count := migrated_task_count + 1;
      end if;
    end loop;
  end loop;

  -- Any legacy task not proven safe above is explicitly standalone. Existing
  -- target lineage is left untouched so a later rerun cannot erase history.
  with candidate_base as (
    select
      source_task.id as task_id,
      source_legacy.id as legacy_id,
      source_legacy.user_id as legacy_user_id,
      source_task.user_id as task_user_id,
      source_task.original_date,
      source_legacy.start_date,
      source_legacy.recurrence_rule,
      public.recurring_task_legacy_record_is_safe(source_legacy) as record_safe
    from public.tasks source_task
    join public.recurring_tasks source_legacy
      on source_legacy.id = source_task.recurring_task_id
    where p_user_id is null or source_legacy.user_id = p_user_id
  ), candidate_positions as (
    select
      candidate_base.*,
      count(*) over (
        partition by candidate_base.legacy_id, candidate_base.original_date
      ) as position_count
    from candidate_base
  ), candidate_classified as (
    select
      candidate_positions.*,
      case
        when not record_safe then 'unsafe-recurrence-metadata'
        when task_user_id is distinct from legacy_user_id then 'cross-owner'
        when position_count > 1 then 'duplicate-scheduled-position'
        when original_date is null then 'missing-scheduled-date'
        when not public.recurring_task_safe_scheduled_date(
          recurrence_rule,
          start_date,
          start_date,
          original_date
        ) then 'unsafe-scheduled-date'
        else 'safe'
      end as classification
    from candidate_positions
  )
  update public.tasks target_task
  set recurring_task_id = null
  from candidate_classified classified
  where classified.task_id = target_task.id
    and classified.classification <> 'safe'
    and target_task.recurring_occurrence_id is null;
  get diagnostics detached_task_count = row_count;

  for legacy in
    select source_legacy.*
    from public.recurring_tasks source_legacy
    where (p_user_id is null or source_legacy.user_id = p_user_id)
      and public.recurring_task_legacy_record_is_safe(source_legacy)
    order by source_legacy.id
  loop
    select
      max(existing_occurrence.scheduled_date),
      count(*) filter (where existing_occurrence.state <> 'withdrawn')
    into max_coverage_horizon, retained_count
    from public.recurring_task_occurrences existing_occurrence
    where existing_occurrence.series_id = legacy.id;

    update public.recurring_task_series target_series
    set coverage_horizon = max_coverage_horizon,
        status = case
          when legacy.status = 'archived' then 'ended'
          when retained_count >= coalesce(target_series.occurrence_limit, 2147483647)
            and target_series.occurrence_limit is not null then 'ended'
          when target_series.last_scheduled_date is not null
            and max_coverage_horizon is not null
            and max_coverage_horizon >= target_series.last_scheduled_date then 'ended'
          when legacy.status = 'paused' then 'paused'
          else 'active'
        end,
        updated_at = now()
    where target_series.id = legacy.id;

  update public.recurring_tasks legacy_projection
    set status = case target_series.status when 'ended' then 'archived' else target_series.status end,
        instances_generated = (
          select count(*)::integer
          from public.recurring_task_occurrences existing_occurrence
          where existing_occurrence.series_id = target_series.id
            and existing_occurrence.state <> 'withdrawn'
        ),
        next_generate_date = target_series.coverage_horizon + 1
    from public.recurring_task_series target_series
    where legacy_projection.id = target_series.id
      and legacy_projection.user_id = legacy.user_id;
  end loop;

  outcome := preflight
    || jsonb_build_object(
      'status', 'complete',
      'type', 'complete',
      'migratedSeriesCount', migrated_series_count,
      'migratedTaskCount', migrated_task_count,
      'migratedOccurrenceCount', migrated_occurrence_count,
      'stoppingPolicyHistoryCount', policy_history_count,
      'detachedTaskCount', detached_task_count
    );

  if p_user_id is null then
    insert into public.recurring_task_migration_diagnostics (
      migration_key,
      cutover_date,
      diagnostics
    ) values (
      '20260802000002_backfill_legacy_recurring',
      p_cutover_date,
      outcome
    ) on conflict (migration_key) do update
      set cutover_date = excluded.cutover_date,
          diagnostics = excluded.diagnostics,
          recorded_at = now();
  end if;

  return outcome;
end;
$function$;

create table if not exists public.recurring_task_migration_diagnostics (
  migration_key text primary key,
  cutover_date date not null,
  diagnostics jsonb not null,
  recorded_at timestamptz not null default now()
);

comment on table public.recurring_task_migration_diagnostics is
  'Aggregate, content-free diagnostics from recurring-task migration preflight and backfill.';

revoke all on table public.recurring_task_migration_diagnostics
  from public, anon, authenticated;
grant select on table public.recurring_task_migration_diagnostics to service_role;

revoke all on function public.recurring_task_legacy_rule_is_safe(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.recurring_task_legacy_record_is_safe(public.recurring_tasks)
  from public, anon, authenticated, service_role;
revoke all on function public.recurring_task_legacy_defaults(public.recurring_tasks)
  from public, anon, authenticated, service_role;
revoke all on function public.recurring_task_legacy_task_overrides(public.tasks, public.recurring_tasks)
  from public, anon, authenticated, service_role;
revoke all on function public.recurring_task_backfill_legacy_preflight(date, uuid)
  from public, anon, service_role;
revoke all on function public.recurring_task_backfill_legacy(date, uuid)
  from public, anon, service_role;
grant execute on function public.recurring_task_backfill_legacy_preflight(date, uuid)
  to authenticated;
grant execute on function public.recurring_task_backfill_legacy(date, uuid)
  to authenticated;

do $backfill$
declare
  outcome jsonb;
begin
  outcome := public.recurring_task_backfill_legacy(current_date, null);
  raise notice 'Legacy recurring-task migration diagnostics: %', outcome;
end
$backfill$;
