-- Period routines retain one series and independently identifiable daily slots.
-- Existing timed/web occurrences keep the empty slot and all existing identities.
-- See docs/adr/0016-identify-routine-occurrences-by-date-and-period.md.
create function planner_private.valid_routine_periods(periods text[]) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select periods is not null and cardinality(periods) between 1 and 4
   and periods <@ array['morning','midday','afternoon','evening']::text[]
   and array_position(periods,null) is null
   and cardinality(periods)=(select count(distinct value) from unnest(periods) value)
$$;
revoke all on function planner_private.valid_routine_periods(text[]) from public,anon,authenticated;

alter table public.planner_routine_schedules
 alter column start_time drop not null, alter column end_time drop not null,
 add column timing_mode text not null default 'time',
 add column periods text[] not null default '{}',
 add constraint routine_timing_valid check (
   (timing_mode='time' and start_time is not null and end_time is not null and cardinality(periods)=0)
   or (timing_mode='period' and start_time is null and end_time is null and not is_protected
     and planner_private.valid_routine_periods(periods)));
alter table public.planner_routine_schedule_revisions
 alter column start_time drop not null, alter column end_time drop not null,
 add column timing_mode text not null default 'time',
 add column periods text[] not null default '{}',
 add constraint routine_revision_timing_valid check (
   (timing_mode='time' and start_time is not null and end_time is not null and cardinality(periods)=0)
   or (timing_mode='period' and start_time is null and end_time is null and not is_protected
     and planner_private.valid_routine_periods(periods)));

alter table public.recurring_task_occurrences
 add column scheduled_period text not null default ''
   check (scheduled_period in ('','morning','midday','afternoon','evening')),
 drop constraint recurring_task_occurrences_series_id_scheduled_date_key,
 add constraint recurring_task_occurrences_series_date_period_key unique(series_id,scheduled_date,scheduled_period);
alter table public.recurring_task_intentional_absences
 add column scheduled_period text not null default ''
   check (scheduled_period in ('','morning','midday','afternoon','evening')),
 drop constraint recurring_task_intentional_absences_pkey,
 add primary key(series_id,scheduled_date,scheduled_period);

create function planner_private.routine_periods_at(p_series uuid,p_date date) returns text[]
language sql stable security definer set search_path=pg_catalog as $$
 select coalesce((select case when h.timing_mode='period' then h.periods else array['']::text[] end
   from public.planner_routine_schedule_revisions h
   where h.series_id=p_series and h.effective_from<=p_date
   order by h.effective_from desc limit 1),array['']::text[])
$$;
revoke all on function planner_private.routine_periods_at(uuid,date) from public,anon,authenticated;

create or replace function planner_private.seed_routine_schedule_history() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.planner_routine_schedule_revisions
   (series_id,effective_from,user_id,start_time,end_time,is_protected,timing_mode,periods)
 select new.series_id,s.activation_date,new.user_id,new.start_time,new.end_time,new.is_protected,new.timing_mode,new.periods
 from public.recurring_task_series s where s.id=new.series_id;
 return new;
end $$;

-- Keep the immutable position separate from an individual placement override.
create table public.planner_routine_period_placements (
 occurrence_id uuid primary key references public.recurring_task_occurrences(id) on delete cascade,
 series_id uuid not null references public.recurring_task_series(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 date date not null,
 period text not null check (period in ('morning','midday','afternoon','evening')),
 active boolean not null default true
);
create unique index routine_period_placement_unique on public.planner_routine_period_placements(series_id,date,period) where active;
create index routine_period_placement_owner_date on public.planner_routine_period_placements(user_id,date);
alter table public.planner_routine_period_placements enable row level security;
revoke all on public.planner_routine_period_placements from public,anon,authenticated;
grant select on public.planner_routine_period_placements to authenticated;
create policy routine_period_placement_owner on public.planner_routine_period_placements for select to authenticated
 using ((select auth.uid())=user_id);

create function planner_private.project_routine_period() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.scheduled_period='' then return new; end if;
 if tg_op='INSERT' then
   insert into public.planner_routine_period_placements(occurrence_id,series_id,user_id,date,period,active)
   select new.id,new.series_id,s.user_id,new.scheduled_date,new.scheduled_period,new.state in ('open','extra','completed')
   from public.recurring_task_series s where s.id=new.series_id;
 elsif new.state is distinct from old.state then
   update public.planner_routine_period_placements set active=new.state in ('open','extra','completed') where occurrence_id=new.id;
 end if;
 return new;
end $$;
revoke all on function planner_private.project_routine_period() from public,anon,authenticated;
create trigger project_routine_period after insert or update of state on public.recurring_task_occurrences
 for each row execute function planner_private.project_routine_period();

create function planner_private.preserve_routine_position() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 if new.scheduled_period is distinct from old.scheduled_period then raise exception 'Routine occurrence position is immutable'; end if;
 return new;
end $$;
revoke all on function planner_private.preserve_routine_position() from public,anon,authenticated;
create trigger preserve_routine_position before update of scheduled_period on public.recurring_task_occurrences
 for each row execute function planner_private.preserve_routine_position();

-- Upgrade existing date-scoped absence conflict targets, including pause/end.
do $slot_conflicts$
declare item record; definition text; updated text;
begin
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','planner_private') and p.prokind='f'
     and (p.prosrc like '%recurring_task_intentional_absences%' or p.prosrc like '%recurring_task_occurrences%') loop
   definition:=pg_get_functiondef(item.oid);
   updated:=regexp_replace(definition,'(?i)on conflict[[:space:]]*\(series_id,[[:space:]]*scheduled_date\)',
     'on conflict (series_id, scheduled_date, scheduled_period)','g');
   if updated<>definition then execute updated; end if;
 end loop;
end $slot_conflicts$;

-- Period-aware lifecycle materialization.
CREATE OR REPLACE FUNCTION public.recurring_task_materialize_locked_target(p_series_id uuid, p_from date, p_to date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_series public.recurring_task_series%ROWTYPE;
  v_revision public.recurring_task_series_revisions%ROWTYPE;
  v_occurrence public.recurring_task_occurrences%ROWTYPE;
  v_date DATE;
  v_start DATE;
  v_end DATE;
  v_task_id UUID;
  v_occurrence_id UUID;
  v_sort_order DOUBLE PRECISION;
  v_retained_count INTEGER;
  v_has_active_schedule BOOLEAN;
  v_reason TEXT;
  v_period TEXT;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Coverage range must be inclusive and ordered';
  END IF;

  SELECT * INTO v_series
  FROM public.recurring_task_series
  WHERE id = p_series_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring Task Series not found';
  END IF;

  FOR v_revision IN
    SELECT revision.*
    FROM public.recurring_task_series_revisions revision
    WHERE revision.series_id = p_series_id
      AND revision.effective_from <= p_to
      AND (revision.effective_to IS NULL OR revision.effective_to > p_from)
    ORDER BY revision.effective_from, revision.id
  LOOP
    v_start := GREATEST(p_from, v_revision.effective_from);
    v_end := LEAST(
      p_to,
      COALESCE(v_revision.effective_to - 1, p_to)
    );
    IF v_start > v_end THEN
      CONTINUE;
    END IF;

    FOR v_date IN
      SELECT dates.scheduled_date
      FROM public.recurring_task_scheduled_dates(
        v_revision.recurrence_rule,
        v_revision.recurrence_anchor,
        v_revision.activation_date,
        v_start,
        v_end
      ) dates
      ORDER BY dates.scheduled_date
    LOOP
      FOREACH v_period IN ARRAY planner_private.routine_periods_at(p_series_id,v_date) LOOP
      IF v_revision.state <> 'active' THEN
        v_reason := CASE v_revision.state
          WHEN 'paused' THEN 'paused'
          ELSE 'ended'
        END;
        INSERT INTO public.recurring_task_intentional_absences(
          series_id, scheduled_date, reason, scheduled_period
        ) VALUES (p_series_id, v_date, v_reason, v_period)
        on conflict (series_id, scheduled_date, scheduled_period) DO UPDATE
          SET reason = CASE
            WHEN public.recurring_task_intentional_absences.reason = 'skipped'
              THEN public.recurring_task_intentional_absences.reason
            ELSE EXCLUDED.reason
          END;

        SELECT * INTO v_occurrence
        FROM public.recurring_task_occurrences occurrence
        WHERE occurrence.series_id = p_series_id
          AND occurrence.scheduled_date = v_date
          AND occurrence.scheduled_period = v_period
        FOR UPDATE;
        IF FOUND AND v_occurrence.state = 'open' THEN
          UPDATE public.recurring_task_occurrences
          SET state = CASE
                WHEN v_occurrence.overrides <> '{}'::JSONB THEN 'extra'
                ELSE 'withdrawn'
              END,
              updated_at = NOW()
          WHERE id = v_occurrence.id;
          UPDATE public.tasks
          SET recurrence_occurrence_state = CASE
                WHEN v_occurrence.overrides <> '{}'::JSONB THEN 'extra'
                ELSE 'withdrawn'
              END
          WHERE id = v_occurrence.task_id;
        END IF;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.recurring_task_intentional_absences absence
        WHERE absence.series_id = p_series_id
          AND absence.scheduled_date = v_date
          AND (absence.scheduled_period = v_period OR absence.scheduled_period = '' AND absence.reason IN ('paused','ended'))
      ) THEN
        CONTINUE;
      END IF;

      SELECT * INTO v_occurrence
      FROM public.recurring_task_occurrences occurrence
      WHERE occurrence.series_id = p_series_id
        AND occurrence.scheduled_date = v_date
          AND occurrence.scheduled_period = v_period
      FOR UPDATE;
      IF FOUND THEN
        IF v_occurrence.state = 'withdrawn' THEN
          UPDATE public.recurring_task_occurrences
          SET state = 'open',
              revision_id = v_revision.id,
              details = v_revision.defaults || v_occurrence.overrides,
              due_date = CASE
                WHEN v_occurrence.overrides ? 'dueDate'
                  THEN v_occurrence.due_date
                ELSE v_date
              END,
              updated_at = NOW()
          WHERE id = v_occurrence.id;
      UPDATE public.tasks
      SET steps = coalesce((v_revision.defaults || v_occurrence.overrides)->'steps','[]'::jsonb),
          title = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'title', title),
              description = (v_revision.defaults || v_occurrence.overrides)->>'description',
              priority = COALESCE(((v_revision.defaults || v_occurrence.overrides)->>'priority')::INTEGER, priority),
              category_id = ((v_revision.defaults || v_occurrence.overrides)->>'categoryId')::UUID,
              due_date = CASE
                WHEN v_occurrence.overrides ? 'dueDate'
                  THEN due_date
                ELSE v_date
              END,
              due_time = ((v_revision.defaults || v_occurrence.overrides)->>'dueTime')::TIME,
              sort_order = COALESCE(((v_revision.defaults || v_occurrence.overrides)->>'sortOrder')::DOUBLE PRECISION, sort_order),
              status = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'status', status),
              section = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'section', section),
              project_id = ((v_revision.defaults || v_occurrence.overrides)->>'projectId')::UUID,
              recurrence_occurrence_state = 'open'
          WHERE id = v_occurrence.task_id;
        ELSIF v_occurrence.state IN ('open', 'extra') THEN
          UPDATE public.recurring_task_occurrences
          SET revision_id = v_revision.id,
              details = v_revision.defaults || v_occurrence.overrides,
              due_date = CASE
                WHEN v_occurrence.overrides ? 'dueDate'
                  THEN due_date
                ELSE v_date
              END,
              updated_at = NOW()
          WHERE id = v_occurrence.id;
          UPDATE public.tasks
          SET steps = coalesce((v_revision.defaults || v_occurrence.overrides)->'steps','[]'::jsonb),
          title = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'title', title),
              description = (v_revision.defaults || v_occurrence.overrides)->>'description',
              priority = COALESCE(((v_revision.defaults || v_occurrence.overrides)->>'priority')::INTEGER, priority),
              category_id = ((v_revision.defaults || v_occurrence.overrides)->>'categoryId')::UUID,
              due_date = CASE
                WHEN v_occurrence.overrides ? 'dueDate'
                  THEN due_date
                ELSE v_date
              END,
              due_time = ((v_revision.defaults || v_occurrence.overrides)->>'dueTime')::TIME,
              sort_order = COALESCE(((v_revision.defaults || v_occurrence.overrides)->>'sortOrder')::DOUBLE PRECISION, sort_order),
              status = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'status', status),
              section = COALESCE((v_revision.defaults || v_occurrence.overrides)->>'section', section),
              project_id = ((v_revision.defaults || v_occurrence.overrides)->>'projectId')::UUID,
              recurrence_occurrence_state = v_occurrence.state
          WHERE id = v_occurrence.task_id;
        END IF;
        CONTINUE;
      END IF;

      SELECT COUNT(*)::INTEGER INTO v_retained_count
      FROM public.recurring_task_occurrences occurrence
      WHERE occurrence.series_id = p_series_id
        AND occurrence.state <> 'withdrawn';
      IF v_series.occurrence_limit IS NOT NULL
         AND v_retained_count >= v_series.occurrence_limit THEN
        UPDATE public.recurring_task_series
        SET status = 'ended', updated_at = NOW()
        WHERE id = p_series_id;
        EXIT;
      END IF;
      IF v_series.last_scheduled_date IS NOT NULL
         AND v_date > v_series.last_scheduled_date THEN
        UPDATE public.recurring_task_series
        SET status = 'ended', updated_at = NOW()
        WHERE id = p_series_id;
        EXIT;
      END IF;

      v_task_id := gen_random_uuid();
      v_occurrence_id := gen_random_uuid();
      SELECT COALESCE(MAX(task.sort_order), 0) + 65536.0
      INTO v_sort_order
      FROM public.tasks task
      WHERE task.user_id = v_series.user_id;

      INSERT INTO public.tasks(
        id, user_id, title, description, is_completed, priority,
        due_date, due_time, status, section, sort_order,
        
        recurring_series_id, recurring_occurrence_id, scheduled_date,
        recurrence_occurrence_state, occurrence_overrides, steps
      )
      VALUES (
        v_task_id,
        v_series.user_id,
        COALESCE(v_revision.defaults->>'title', ''),
        v_revision.defaults->>'description',
        COALESCE(v_revision.defaults->>'status', 'todo') = 'done',
        COALESCE((v_revision.defaults->>'priority')::INTEGER, 0),
        v_date,
        (v_revision.defaults->>'dueTime')::TIME,
        COALESCE(v_revision.defaults->>'status', 'todo'),
        COALESCE(v_revision.defaults->>'section', 'personal'),
        COALESCE((v_revision.defaults->>'sortOrder')::DOUBLE PRECISION, v_sort_order),

        p_series_id,
        v_occurrence_id,
        v_date,
        'open',
        '{}'::JSONB, coalesce(v_revision.defaults->'steps','[]'::jsonb)
      );

      INSERT INTO public.recurring_task_occurrences(
        id, series_id, revision_id, scheduled_date, due_date, details,
        state, overrides, task_id, scheduled_period
      ) VALUES (
        v_occurrence_id,
        p_series_id,
        v_revision.id,
        v_date,
        v_date,
        v_revision.defaults,
        'open',
        '{}'::JSONB,
        v_task_id, v_period
      );
      END LOOP;
    END LOOP;
  END LOOP;

  FOR v_occurrence IN
    SELECT occurrence.*
    FROM public.recurring_task_occurrences occurrence
    WHERE occurrence.series_id = p_series_id
      AND occurrence.state = 'open'
      AND occurrence.scheduled_date BETWEEN p_from AND p_to
    FOR UPDATE
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.recurring_task_series_revisions revision
      WHERE revision.series_id = p_series_id
        AND revision.state = 'active'
        AND v_occurrence.scheduled_period = ANY(planner_private.routine_periods_at(p_series_id,v_occurrence.scheduled_date))
        AND revision.effective_from <= v_occurrence.scheduled_date
        AND (
          revision.effective_to IS NULL
          OR v_occurrence.scheduled_date < revision.effective_to
        )
        AND (
          v_series.last_scheduled_date IS NULL
          OR v_occurrence.scheduled_date <= v_series.last_scheduled_date
        )
        AND EXISTS (
          SELECT 1
          FROM public.recurring_task_scheduled_dates(
            revision.recurrence_rule,
            revision.recurrence_anchor,
            revision.activation_date,
            v_occurrence.scheduled_date,
            v_occurrence.scheduled_date
          ) dates
          WHERE dates.scheduled_date = v_occurrence.scheduled_date
        )
    ) INTO v_has_active_schedule;

    IF NOT v_has_active_schedule THEN
      UPDATE public.recurring_task_occurrences
      SET state = CASE
            WHEN v_occurrence.overrides <> '{}'::JSONB THEN 'extra'
            ELSE 'withdrawn'
          END,
          updated_at = NOW()
      WHERE id = v_occurrence.id;
      UPDATE public.tasks
      SET recurrence_occurrence_state = CASE
            WHEN v_occurrence.overrides <> '{}'::JSONB THEN 'extra'
            ELSE 'withdrawn'
          END
      WHERE id = v_occurrence.task_id;
    END IF;
  END LOOP;

  SELECT COUNT(*)::INTEGER INTO v_retained_count
  FROM public.recurring_task_occurrences occurrence
  WHERE occurrence.series_id = p_series_id
    AND occurrence.state <> 'withdrawn';

  UPDATE public.recurring_task_series
  SET coverage_horizon = CASE
        WHEN coverage_horizon IS NULL OR p_to > coverage_horizon THEN p_to
        ELSE coverage_horizon
      END,
      status = CASE
        WHEN occurrence_limit IS NOT NULL
          AND v_retained_count >= occurrence_limit THEN 'ended'
        WHEN status = 'active'
          AND last_scheduled_date IS NOT NULL
          AND p_to >= last_scheduled_date THEN 'ended'
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = p_series_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recurring_task_reconcile_stopping_policy(p_series_id uuid, p_from date, p_to date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_series public.recurring_task_series%rowtype;
  v_occurrence public.recurring_task_occurrences%rowtype;
  v_revision public.recurring_task_series_revisions%rowtype;
  v_date date;
  v_start date;
  v_end date;
  v_retained_before integer;
  v_retained_count integer;
  v_active_schedule boolean;
  v_next_state text;
  v_reason text;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Coverage range must be inclusive and ordered';
  end if;

  select *
  into v_series
  from public.recurring_task_series as series
  where series.id = p_series_id
  for update;
  if not found then
    raise exception 'Recurring Task Series not found';
  end if;

  -- A revision, pause, end, or a shortened stopping policy can make an
  -- already-materialized Open Occurrence provisional. Only untouched rows may
  -- be withdrawn; overridden rows remain retained as Extra Occurrences.
  for v_occurrence in
    select occurrence.*
    from public.recurring_task_occurrences as occurrence
    where occurrence.series_id = p_series_id
      and occurrence.state = 'open'
      and (
        occurrence.scheduled_date between p_from and p_to
        or (
          v_series.last_scheduled_date is not null
          and occurrence.scheduled_date > v_series.last_scheduled_date
        )
      )
    order by occurrence.scheduled_date, occurrence.id
    for update
  loop
    select exists (
      select 1
      from public.recurring_task_series_revisions as revision
      where revision.series_id = p_series_id
        and revision.state = 'active'
        and v_occurrence.scheduled_period = any(planner_private.routine_periods_at(p_series_id,v_occurrence.scheduled_date))
        and revision.effective_from <= v_occurrence.scheduled_date
        and (
          revision.effective_to is null
          or v_occurrence.scheduled_date < revision.effective_to
        )
        and (
          v_series.last_scheduled_date is null
          or v_occurrence.scheduled_date <= v_series.last_scheduled_date
        )
        and exists (
          select 1
          from public.recurring_task_scheduled_dates(
            revision.recurrence_rule,
            revision.recurrence_anchor,
            revision.activation_date,
            v_occurrence.scheduled_date,
            v_occurrence.scheduled_date
          ) as dates
          where dates.scheduled_date = v_occurrence.scheduled_date
        )
    ) into v_active_schedule;

    if v_series.occurrence_limit is not null then
      select count(*)::integer
      into v_retained_before
      from public.recurring_task_occurrences as prior
      where prior.series_id = p_series_id
        and prior.state <> 'withdrawn'
        and prior.scheduled_date < v_occurrence.scheduled_date;
    else
      v_retained_before := 0;
    end if;

    if not v_active_schedule
       or (
         v_series.occurrence_limit is not null
         and v_retained_before >= v_series.occurrence_limit
       ) then
      v_next_state := case
        when v_occurrence.overrides <> '{}'::jsonb then 'extra'
        else 'withdrawn'
      end;
      update public.recurring_task_occurrences
      set state = v_next_state,
          updated_at = now()
      where id = v_occurrence.id;
      update public.tasks
      set recurrence_occurrence_state = v_next_state,
          updated_at = now()
      where id = v_occurrence.task_id;
    end if;
  end loop;

  -- A revision may add back a date that an earlier revision withdrew. Do not
  -- resurrect pause/end/skip absences, an Ended Series, a date after the
  -- inclusive boundary, or a date beyond the retained-history limit.
  if v_series.status <> 'ended' then
    select count(*)::integer
    into v_retained_count
    from public.recurring_task_occurrences as occurrence
    where occurrence.series_id = p_series_id
      and occurrence.state <> 'withdrawn';

    for v_occurrence in
      select occurrence.*
      from public.recurring_task_occurrences as occurrence
      where occurrence.series_id = p_series_id
        and occurrence.state = 'withdrawn'
        and occurrence.scheduled_date between p_from and p_to
      order by occurrence.scheduled_date, occurrence.id
      for update
    loop
      if exists (
        select 1
        from public.recurring_task_intentional_absences as absence
        where absence.series_id = p_series_id
          and absence.scheduled_date = v_occurrence.scheduled_date
          and (absence.scheduled_period = v_occurrence.scheduled_period or absence.scheduled_period = '' and absence.reason in ('paused','ended'))
      ) then
        continue;
      end if;

      select revision.*
      into v_revision
      from public.recurring_task_series_revisions as revision
      where revision.series_id = p_series_id
        and revision.state = 'active'
        and v_occurrence.scheduled_period = any(planner_private.routine_periods_at(p_series_id,v_occurrence.scheduled_date))
        and revision.effective_from <= v_occurrence.scheduled_date
        and (
          revision.effective_to is null
          or v_occurrence.scheduled_date < revision.effective_to
        )
        and (
          v_series.last_scheduled_date is null
          or v_occurrence.scheduled_date <= v_series.last_scheduled_date
        )
        and exists (
          select 1
          from public.recurring_task_scheduled_dates(
            revision.recurrence_rule,
            revision.recurrence_anchor,
            revision.activation_date,
            v_occurrence.scheduled_date,
            v_occurrence.scheduled_date
          ) as dates
          where dates.scheduled_date = v_occurrence.scheduled_date
        )
      order by revision.effective_from desc
      limit 1;
      if not found then
        continue;
      end if;

      if v_series.occurrence_limit is not null
         and v_retained_count >= v_series.occurrence_limit then
        continue;
      end if;

      update public.recurring_task_occurrences
      set state = 'open',
          revision_id = v_revision.id,
          details = v_revision.defaults || v_occurrence.overrides,
          due_date = case
            when v_occurrence.overrides ? 'dueDate' then v_occurrence.due_date
            else v_occurrence.scheduled_date
          end,
          updated_at = now()
      where id = v_occurrence.id;
      update public.tasks
      set title = coalesce((v_revision.defaults || v_occurrence.overrides)->>'title', title),
          description = (v_revision.defaults || v_occurrence.overrides)->>'description',
          priority = coalesce(((v_revision.defaults || v_occurrence.overrides)->>'priority')::integer, priority),
          category_id = ((v_revision.defaults || v_occurrence.overrides)->>'categoryId')::uuid,
          due_date = case
            when v_occurrence.overrides ? 'dueDate' then due_date
            else v_occurrence.scheduled_date
          end,
          due_time = ((v_revision.defaults || v_occurrence.overrides)->>'dueTime')::time,
          sort_order = coalesce(((v_revision.defaults || v_occurrence.overrides)->>'sortOrder')::double precision, sort_order),
          status = coalesce((v_revision.defaults || v_occurrence.overrides)->>'status', status),
          section = coalesce((v_revision.defaults || v_occurrence.overrides)->>'section', section),
          project_id = ((v_revision.defaults || v_occurrence.overrides)->>'projectId')::uuid,
          recurrence_occurrence_state = 'open',
          updated_at = now()
      where id = v_occurrence.task_id;
      v_retained_count := v_retained_count + 1;
    end loop;
  end if;

  -- Persist intentional absence for every scheduled date suppressed by an
  -- inactive revision or by a stopping policy. Pause-suppressed dates never
  -- become ledger occurrences and therefore never consume the limit.
  for v_revision in
    select revision.*
    from public.recurring_task_series_revisions as revision
    where revision.series_id = p_series_id
      and revision.effective_from <= p_to
      and (revision.effective_to is null or revision.effective_to > p_from)
    order by revision.effective_from, revision.id
  loop
    v_start := greatest(p_from, v_revision.effective_from);
    v_end := least(p_to, coalesce(v_revision.effective_to - 1, p_to));
    if v_start > v_end then
      continue;
    end if;

    for v_date in
      select dates.scheduled_date
      from public.recurring_task_scheduled_dates(
        v_revision.recurrence_rule,
        v_revision.recurrence_anchor,
        v_revision.activation_date,
        v_start,
        v_end
      ) as dates
      order by dates.scheduled_date
    loop
      v_reason := null;
      if v_revision.state <> 'active' then
        v_reason := case v_revision.state
          when 'paused' then 'paused'
          else 'ended'
        end;
      elsif v_series.last_scheduled_date is not null
         and v_date > v_series.last_scheduled_date then
        v_reason := 'ended';
      else
        select count(*)::integer
        into v_retained_count
        from public.recurring_task_occurrences as occurrence
        where occurrence.series_id = p_series_id
          and occurrence.state <> 'withdrawn';
        if v_series.occurrence_limit is not null
           and v_retained_count >= v_series.occurrence_limit
           and not exists (
             select 1
             from public.recurring_task_occurrences as occurrence
             where occurrence.series_id = p_series_id
               and occurrence.scheduled_date = v_date
               and occurrence.state <> 'withdrawn'
           ) then
          v_reason := 'ended';
        end if;
      end if;

      if v_reason is not null then
        insert into public.recurring_task_intentional_absences(
          series_id, scheduled_date, reason
        ) values (p_series_id, v_date, v_reason)
        on conflict (series_id, scheduled_date, scheduled_period) do update
          set reason = case
            when public.recurring_task_intentional_absences.reason = 'skipped'
              then public.recurring_task_intentional_absences.reason
            else excluded.reason
          end;
      end if;
    end loop;
  end loop;

  select count(*)::integer
  into v_retained_count
  from public.recurring_task_occurrences as occurrence
  where occurrence.series_id = p_series_id
    and occurrence.state <> 'withdrawn';

  update public.recurring_task_series
  set coverage_horizon = case
        when coverage_horizon is null or p_to > coverage_horizon then p_to
        else coverage_horizon
      end,
      status = case
        when occurrence_limit is not null
          and v_retained_count >= occurrence_limit then 'ended'
        when last_scheduled_date is not null
          and p_to >= last_scheduled_date then 'ended'
        else status
      end,
      updated_at = now()
  where id = p_series_id;
end;
$function$;

CREATE OR REPLACE FUNCTION planner_private.recurring_task_occurrence_command_atomic(p_operation text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_requested_user_id uuid := nullif(p_request->>'userId', '')::uuid;
  v_authenticated_user_id uuid := auth.uid();
  v_user_id uuid;
  v_series_id uuid := nullif(p_request->>'seriesId', '')::uuid;
  v_occurrence_id uuid := nullif(p_request->>'occurrenceId', '')::uuid;
  v_series public.recurring_task_series%rowtype;
  v_occurrence public.recurring_task_occurrences%rowtype;
  v_operation_key text;
  v_fingerprint text;
  v_existing_idempotency public.recurring_task_idempotency%rowtype;
  v_outcome jsonb;
  v_schedule_exists boolean;
begin
  perform set_config('betterr.recurring_lifecycle', 'on', true);

  if coalesce(auth.role(), '') = 'service_role' then
    v_user_id := coalesce(v_requested_user_id, v_authenticated_user_id);
  else
    if v_authenticated_user_id is null
       or v_requested_user_id is distinct from v_authenticated_user_id then
      return jsonb_build_object('status', 'not-found', 'type', 'not-found');
    end if;
    v_user_id := v_authenticated_user_id;
  end if;
  if v_user_id is null then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  select * into v_series
  from public.recurring_task_series as series
  where series.id = v_series_id
    and series.user_id = v_user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  v_operation_key := coalesce(
    nullif(p_request->>'idempotencyKey', ''),
    nullif(p_request->>'operationKey', '')
  );
  v_fingerprint := md5(
    jsonb_build_object(
      'operation', p_operation,
      'request', p_request - 'idempotencyKey' - 'operationKey'
    )::text
  );

  if v_operation_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || v_operation_key, 0)
    );
    select * into v_existing_idempotency
    from public.recurring_task_idempotency as record
    where record.user_id = v_user_id
      and record.operation_key = v_operation_key
    for update;
    if found then
      if v_existing_idempotency.fingerprint <> v_fingerprint then
        return jsonb_build_object(
          'status', 'conflict',
          'type', 'conflict',
          'reason', 'Idempotency key was reused for a different request'
        );
      end if;
      return jsonb_set(
        jsonb_set(
          v_existing_idempotency.outcome,
          '{status}',
          '"already-applied"'::jsonb
        ),
        '{type}',
        '"already-applied"'::jsonb
      );
    end if;
  end if;

  if p_request ? 'expectedRevisionToken'
     and (p_request->>'expectedRevisionToken')::integer <> v_series.revision_token then
    return jsonb_build_object(
      'status', 'conflict',
      'type', 'conflict',
      'expectedRevisionToken', (p_request->>'expectedRevisionToken')::integer,
      'actualRevisionToken', v_series.revision_token
    );
  end if;

  if p_operation not in (
    'skip-occurrence',
    'complete-occurrence',
    'reopen-occurrence'
  ) then
    return jsonb_build_object(
      'status', 'invalid-transition',
      'type', 'invalid-transition',
      'reason', 'Unsupported occurrence command'
    );
  end if;

  select * into v_occurrence
  from public.recurring_task_occurrences as occurrence
  where occurrence.id = v_occurrence_id
    and occurrence.series_id = v_series_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found', 'type', 'not-found');
  end if;

  if p_operation = 'skip-occurrence' then
    if v_occurrence.state = 'skipped' then
      v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
      return jsonb_set(
        jsonb_set(v_outcome, '{status}', '"already-applied"'::jsonb),
        '{type}',
        '"already-applied"'::jsonb
      );
    end if;
    if v_occurrence.state not in ('open', 'extra') then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Only Open or Extra Occurrences can be skipped'
      );
    end if;
    if v_occurrence.task_id is null
       or not exists (
         select 1
         from public.tasks as task
         where task.id = v_occurrence.task_id
           and task.user_id = v_user_id
       ) then
      return jsonb_build_object('status', 'not-found', 'type', 'not-found');
    end if;

    update public.recurring_task_occurrences
    set state = 'skipped',
        completed_at = null,
        updated_at = now()
    where id = v_occurrence.id;
    insert into public.recurring_task_intentional_absences(
      series_id, scheduled_date, reason, scheduled_period
    ) values (v_series_id, v_occurrence.scheduled_date, 'skipped', v_occurrence.scheduled_period)
    on conflict (series_id, scheduled_date, scheduled_period) do update
      set reason = 'skipped';
    delete from public.tasks
    where id = v_occurrence.task_id
      and user_id = v_user_id;
  elsif p_operation = 'complete-occurrence' then
    if v_occurrence.state = 'completed' then
      v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
      return jsonb_set(
        jsonb_set(v_outcome, '{status}', '"already-applied"'::jsonb),
        '{type}',
        '"already-applied"'::jsonb
      );
    end if;
    if v_occurrence.state not in ('open', 'extra') then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Only Open or Extra Occurrences can be completed'
      );
    end if;
    if v_occurrence.task_id is null
       or not exists (
         select 1
         from public.tasks as task
         where task.id = v_occurrence.task_id
           and task.user_id = v_user_id
       ) then
      return jsonb_build_object('status', 'not-found', 'type', 'not-found');
    end if;

    update public.recurring_task_occurrences
    set state = 'completed',
        completed_at = now(),
        updated_at = now()
    where id = v_occurrence.id;
    update public.tasks
    set is_completed = true,
        status = 'done',
        completed_at = coalesce(completed_at, now()),
        recurrence_occurrence_state = 'completed',
        updated_at = now()
    where id = v_occurrence.task_id
      and user_id = v_user_id;
  else
    if v_occurrence.state in ('open', 'extra') then
      v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
      return jsonb_set(
        jsonb_set(v_outcome, '{status}', '"already-applied"'::jsonb),
        '{type}',
        '"already-applied"'::jsonb
      );
    end if;
    if v_occurrence.state <> 'completed' then
      return jsonb_build_object(
        'status', 'invalid-transition',
        'type', 'invalid-transition',
        'reason', 'Only completed Occurrences can be reopened'
      );
    end if;
    if v_occurrence.task_id is null
       or not exists (
         select 1
         from public.tasks as task
         where task.id = v_occurrence.task_id
           and task.user_id = v_user_id
       ) then
      return jsonb_build_object('status', 'not-found', 'type', 'not-found');
    end if;

    select exists (
      select 1
      from public.recurring_task_series_revisions as revision
      where revision.series_id = v_series_id
        and revision.state = 'active'
        and v_occurrence.scheduled_period = any(planner_private.routine_periods_at(v_series_id,v_occurrence.scheduled_date))
        and revision.effective_from <= v_occurrence.scheduled_date
        and (
          revision.effective_to is null
          or v_occurrence.scheduled_date < revision.effective_to
        )
        and (
          v_series.last_scheduled_date is null
          or v_occurrence.scheduled_date <= v_series.last_scheduled_date
        )
        and exists (
          select 1
          from public.recurring_task_scheduled_dates(
            revision.recurrence_rule,
            revision.recurrence_anchor,
            revision.activation_date,
            v_occurrence.scheduled_date,
            v_occurrence.scheduled_date
          ) as dates
          where dates.scheduled_date = v_occurrence.scheduled_date
        )
    ) into v_schedule_exists;

    update public.recurring_task_occurrences
    set state = case when v_schedule_exists then 'open' else 'extra' end,
        completed_at = null,
        updated_at = now()
    where id = v_occurrence.id;
    update public.tasks
    set is_completed = false,
        status = 'todo',
        completed_at = null,
        recurrence_occurrence_state = case
          when v_schedule_exists then 'open' else 'extra' end,
        updated_at = now()
    where id = v_occurrence.task_id
      and user_id = v_user_id;
  end if;

  update public.recurring_task_series
  set updated_at = now()
  where id = v_series_id;

  v_outcome := public.recurring_task_series_snapshot(v_series_id, 'complete');
  if v_operation_key is not null then
    insert into public.recurring_task_idempotency(
      user_id, operation_key, fingerprint, series_id, outcome
    ) values (
      v_user_id, v_operation_key, v_fingerprint, v_series_id, v_outcome
    );
  end if;
  return v_outcome;
end;
$function$;
-- Period routines never pass through reservation creation.
do $reserve_periods$
declare definition text;
begin
 select pg_get_functiondef('planner_private.reserve_routine_occurrence(uuid)'::regprocedure) into definition;
 if position('if occurrence.state not in' in definition)=0 then raise exception 'Unexpected reservation boundary'; end if;
 definition:=replace(definition,'if occurrence.state not in',
   'if occurrence.scheduled_period<>'''' or occurrence.state not in');
 definition:=replace(definition,'if not found or not planner_private.routine_interval_valid',
   'if not found or schedule.start_time is null or not planner_private.routine_interval_valid');
 execute definition;
end $reserve_periods$;

create function planner_private.routine_snapshot_v2(p_date date) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); series_id uuid; result jsonb; rows jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found'); end if;
 if p_date is null then return jsonb_build_object('status','invalid'); end if;
 for series_id in select s.id from public.recurring_task_series s join public.planner_routine_schedules r on r.series_id=s.id
   where s.user_id=owner_id and r.user_id=owner_id and s.status<>'ended'
     and not exists(select 1 from public.recurring_task_occurrences o where o.series_id=s.id and o.scheduled_date=p_date)
   order by s.id loop
   result:=public.recurring_task_lifecycle('ensure-coverage',jsonb_build_object('userId',owner_id,'seriesId',series_id,
     'range',jsonb_build_object('from',p_date,'to',p_date)));
   if result->>'status' not in ('complete','already-applied') then raise exception 'Routine coverage unavailable'; end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('series',to_jsonb(s),'schedule',to_jsonb(r)||to_jsonb(h),
   'occurrence',to_jsonb(o),'task',to_jsonb(t),'event',to_jsonb(e),'period',p.period,'date',coalesce(p.date,o.scheduled_date),
   'supported',planner_private.routine_rule_supported(v.recurrence_rule),
   'timeIssue',o.scheduled_period='' and not planner_private.routine_interval_valid(o.scheduled_date,h.start_time,h.end_time,s.time_zone) and e.id is null,
   'startInstant',case when e.id is not null then (e.start_date+e.start_time) at time zone e.timezone end)
   order by array_position(array['morning','midday','afternoon','evening'],p.period),h.start_time,o.id),'[]') into rows
 from public.planner_routine_schedules r join public.recurring_task_series s on s.id=r.series_id
 join public.recurring_task_occurrences o on o.series_id=s.id
 join public.recurring_task_series_revisions v on v.id=o.revision_id
 cross join lateral (select rev.* from public.planner_routine_schedule_revisions rev
   where rev.series_id=s.id and rev.effective_from<=o.scheduled_date order by rev.effective_from desc limit 1) h
 left join public.planner_routine_period_placements p on p.occurrence_id=o.id and p.user_id=owner_id
 left join public.tasks t on t.id=o.task_id and t.user_id=owner_id
 left join public.calendar_events e on e.routine_occurrence_id=o.id and e.user_id=owner_id
 where r.user_id=owner_id and s.user_id=owner_id and coalesce(p.date,o.scheduled_date)=p_date;
 return jsonb_build_object('status','complete','rows',rows);
end $$;
revoke all on function planner_private.routine_snapshot_v2(date) from public,anon;
grant execute on function planner_private.routine_snapshot_v2(date) to authenticated;
create function public.planner_routine_snapshot_v2(p_date date) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.routine_snapshot_v2(p_date) $$;
revoke all on function public.planner_routine_snapshot_v2(date) from public,anon;
grant execute on function public.planner_routine_snapshot_v2(date) to authenticated;

-- The v1 contract cannot represent null clock strings. Preserve timed history.
create or replace function public.planner_routine_snapshot(p_date date) returns jsonb
language sql security invoker set search_path=pg_catalog as $$
 select result||jsonb_build_object('rows',coalesce((select jsonb_agg(row) from jsonb_array_elements(result->'rows') row
   where row->'occurrence'->>'scheduled_period'=''),'[]'))
 from (select planner_private.routine_snapshot_v2(p_date) result) snapshot
$$;

create function planner_private.routine_series_snapshot_v2() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); result jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found'); end if;
 result:=planner_private.routine_series_snapshot();
 return result||jsonb_build_object('rows',coalesce((select jsonb_agg(row||jsonb_build_object('timingMode',r.timing_mode,'periods',r.periods)
   ||case when n.day is not null and (row->>'nextDate' is null or n.day<=(row->>'nextDate')::date) then
     jsonb_build_object('nextDate',n.day,'nextPeriod',n.period,'nextStartTime',null,'nextStartInstant',null,'nextReason',null)
     else jsonb_build_object('nextPeriod',null) end)
   from jsonb_array_elements(result->'rows') row
   join public.planner_routine_schedules r on r.series_id=(row->>'id')::uuid
   join public.recurring_task_series s on s.id=r.series_id
   left join lateral (
     select candidates.day,candidates.period from (
       select p.date as day,p.period from public.planner_routine_period_placements p
       join public.recurring_task_occurrences o on o.id=p.occurrence_id
       where p.series_id=s.id and p.user_id=owner_id and p.active and o.state in ('open','extra')
         and p.date>=(statement_timestamp() at time zone s.time_zone)::date
       union all
       select d.scheduled_date as day,slot.period from public.recurring_task_series_revisions rv
       cross join lateral public.recurring_task_scheduled_dates(rv.recurrence_rule,rv.recurrence_anchor,rv.activation_date,
         greatest((statement_timestamp() at time zone s.time_zone)::date,rv.effective_from),
         least(greatest((statement_timestamp() at time zone s.time_zone)::date,rv.effective_from)+366,
           coalesce(rv.effective_to-1,'9999-12-31'::date),coalesce(s.last_scheduled_date,'9999-12-31'::date))) d
       cross join lateral unnest(planner_private.routine_periods_at(s.id,d.scheduled_date)) slot(period)
       where rv.series_id=s.id and rv.state='active' and s.status<>'ended' and slot.period<>''
         and planner_private.routine_rule_supported(rv.recurrence_rule)
         and (s.occurrence_limit is null or (select count(*) from public.recurring_task_occurrences kept
           where kept.series_id=s.id and kept.state<>'withdrawn')<s.occurrence_limit)
         and not exists(select 1 from public.recurring_task_intentional_absences a where a.series_id=s.id
           and a.scheduled_date=d.scheduled_date and (a.scheduled_period=slot.period or a.scheduled_period='' and a.reason in ('paused','ended')))
         and not exists(select 1 from public.recurring_task_occurrences o where o.series_id=s.id
           and o.scheduled_date=d.scheduled_date and o.scheduled_period=slot.period)
     ) candidates order by candidates.day,array_position(array['morning','midday','afternoon','evening'],candidates.period) limit 1
   ) n on true where r.user_id=owner_id),'[]'));
end $$;
revoke all on function planner_private.routine_series_snapshot_v2() from public,anon;
grant execute on function planner_private.routine_series_snapshot_v2() to authenticated;
create function public.planner_routine_series_snapshot_v2() returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.routine_series_snapshot_v2() $$;
revoke all on function public.planner_routine_series_snapshot_v2() from public,anon;
grant execute on function public.planner_routine_series_snapshot_v2() to authenticated;
create or replace function public.planner_routine_series_snapshot() returns jsonb
language sql security invoker set search_path=pg_catalog as $$
 select result||jsonb_build_object('rows',coalesce((select jsonb_agg(row) from jsonb_array_elements(result->'rows') row
   where row->>'timingMode'='time'),'[]')) from (select planner_private.routine_series_snapshot_v2() result) snapshot
$$;

alter function planner_private.routine_command(jsonb) rename to timed_routine_command;
create function planner_private.routine_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); request_id uuid; receipt public.planner_command_receipts;
 result jsonb; series_id uuid; day date; zone text; periods text[];
begin
 if owner_id is null then return jsonb_build_object('status','not-found'); end if;
 if jsonb_typeof(p_request) is distinct from 'object' then return jsonb_build_object('status','invalid'); end if;
 if p_request->>'operation'='skip' and p_request->>'timingMode'='period' then
   return planner_private.timed_routine_command(p_request-'timingMode');
 end if;
 if p_request->>'operation'='edit' and p_request->>'timingMode'='period' then
   return planner_private.edit_period_routine(p_request);
 end if;
 if coalesce(p_request->>'timingMode','time')='time' then
   if p_request->>'operation' in ('edit','skip') and exists(select 1 from public.recurring_task_occurrences o
     join public.recurring_task_series s on s.id=o.series_id where s.user_id=owner_id
       and o.id=(p_request->>'occurrenceId')::uuid and o.scheduled_period<>'') then
     return jsonb_build_object('status','unsupported');
   end if;
   return planner_private.timed_routine_command(p_request-'timingMode');
 end if;
 if p_request->>'operation' is distinct from 'create' or p_request->>'timingMode' is distinct from 'period'
   or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','title','date','timezone','timingMode','periods','rule','steps'))
   or jsonb_typeof(p_request->'periods') is distinct from 'array'
   or length(btrim(coalesce(p_request->>'title',''))) not between 1 and 100
   or coalesce(p_request->>'date','')!~'^\d{4}-\d{2}-\d{2}$'
   or coalesce(planner_private.routine_rule_supported(p_request->'rule'),false)=false then return jsonb_build_object('status','invalid'); end if;
 request_id:=(p_request->>'operationId')::uuid; day:=(p_request->>'date')::date; zone:=p_request->>'timezone';
 select array_agg(value) into periods from jsonb_array_elements_text(p_request->'periods') value;
 if request_id is null or not planner_private.valid_routine_periods(periods)
   or not exists(select 1 from pg_timezone_names where name=zone) then return jsonb_build_object('status','invalid'); end if;
 select array_agg(value order by ordinal) into periods from unnest(array['morning','midday','afternoon','evening']) with ordinality as period(value,ordinal)
   where value=any(periods);
 if p_request ? 'steps' and (not planner_private.valid_steps(p_request->'steps')
   or exists(select 1 from jsonb_array_elements(p_request->'steps') s where (s->>'checked')::boolean)) then return jsonb_build_object('status','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
 select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
 if found then
   if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
   return jsonb_set(receipt.outcome,'{status}','"already-applied"');
 end if;
 result:=public.recurring_task_lifecycle('create-series',jsonb_build_object('userId',owner_id,'idempotencyKey',request_id,
   'recurrenceRule',p_request->'rule','recurrenceAnchor',day,'activationDate',day,'timeZone',zone,
   'defaults',jsonb_build_object('title',btrim(p_request->>'title'),'dueTime',null,'steps',coalesce(p_request->'steps','[]'::jsonb))));
 if result->>'status' not in ('complete','already-applied') then return result; end if;
 series_id:=(result->'series'->>'id')::uuid;
 insert into public.planner_routine_schedules(series_id,user_id,timing_mode,periods,is_protected)
   values(series_id,owner_id,'period',periods,false);
 perform planner_private.routine_snapshot_v2(day);
 result:=jsonb_build_object('status','complete','seriesId',series_id);
 insert into public.planner_command_receipts values(owner_id,request_id,p_request,result);
 return result;
exception when invalid_text_representation or datetime_field_overflow or check_violation or not_null_violation then
 return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.routine_command(jsonb) from public,anon;
grant execute on function planner_private.routine_command(jsonb) to authenticated;
create or replace function public.planner_routine_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.routine_command(p_request) $$;

-- Existing time-only positional inserts must name their columns after expansion.
do $schedule_columns$
declare definition text;
begin
 select pg_get_functiondef('planner_private.routine_series_command(jsonb)'::regprocedure) into definition;
 if position('insert into public.planner_routine_schedule_revisions values' in definition)=0 then raise exception 'Unexpected series schedule writer'; end if;
 definition:=replace(definition,'insert into public.planner_routine_schedule_revisions values',
   'insert into public.planner_routine_schedule_revisions(series_id,effective_from,user_id,start_time,end_time,is_protected) values');
 execute definition;
end $schedule_columns$;


-- Period-aware series revisions.
CREATE OR REPLACE FUNCTION planner_private.routine_series_preview(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare series public.recurring_task_series; revision public.recurring_task_series_revisions;
 schedule public.planner_routine_schedules; day date; impact jsonb; affected integer; preserved integer;
 starts time; ends time; periods text[]; target_mode text;
begin
 if auth.uid() is null then return jsonb_build_object('status','not-found'); end if;
 if jsonb_typeof(p_request) is distinct from 'object' or coalesce(p_request->>'operation','') not in ('revise','pause','resume','end')
   or coalesce(p_request->>'effectiveDate','')!~'^\d{4}-\d{2}-\d{2}$'
   or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','seriesId','effectiveDate','expectedSeriesToken','expectedScheduleVersion','title','startTime','endTime','protected','rule','steps','timingMode','periods'))
 then return jsonb_build_object('status','invalid'); end if;
 select * into series from public.recurring_task_series where id=(p_request->>'seriesId')::uuid and user_id=auth.uid();
 if not found then return jsonb_build_object('status','not-found'); end if;
 select * into schedule from public.planner_routine_schedules where series_id=series.id and user_id=auth.uid();
 if not found then return jsonb_build_object('status','unsupported'); end if;
 select * into revision from public.recurring_task_series_revisions where id=series.current_revision_id;
 if series.revision_token is distinct from (p_request->>'expectedSeriesToken')::integer
   or schedule.version is distinct from (p_request->>'expectedScheduleVersion')::uuid then return jsonb_build_object('status','conflict'); end if;
 if not planner_private.routine_rule_supported(revision.recurrence_rule) then return jsonb_build_object('status','unsupported'); end if;
 day:=(p_request->>'effectiveDate')::date;
 target_mode:=case when p_request->>'operation'='revise' then coalesce(p_request->>'timingMode','time') else schedule.timing_mode end;
 if target_mode not in ('time','period') then return jsonb_build_object('status','invalid'); end if;
 if p_request->>'operation'='revise' and schedule.timing_mode='period' and not (p_request ? 'timingMode') then
   return jsonb_build_object('status','unsupported'); end if;
 if (schedule.timing_mode='period' or target_mode='period') and day<=(statement_timestamp() at time zone series.time_zone)::date then
   return jsonb_build_object('status','invalid'); end if;
 if day<greatest((statement_timestamp() at time zone series.time_zone)::date,series.activation_date,revision.effective_from)
   or day>greatest((statement_timestamp() at time zone series.time_zone)::date,series.activation_date,revision.effective_from)+366
   or series.status='ended' or (p_request->>'operation'='pause' and series.status<>'active')
   or (p_request->>'operation'='resume' and series.status<>'paused') then return jsonb_build_object('status','invalid'); end if;
 if p_request->>'operation'='resume' and (day+schedule.start_time) at time zone series.time_zone<=statement_timestamp()
 then return jsonb_build_object('status','invalid'); end if;
 if p_request->>'operation'='revise' then
   if p_request ? 'steps' then
     if not planner_private.valid_steps(p_request->'steps') then return jsonb_build_object('status','invalid'); end if;
     if exists(select 1 from jsonb_array_elements(p_request->'steps') s where (s->>'checked')::boolean) then return jsonb_build_object('status','invalid'); end if;
   end if;
   if target_mode='period' then
     if jsonb_typeof(p_request->'periods') is distinct from 'array' or p_request ?| array['startTime','endTime','protected']
       or length(btrim(coalesce(p_request->>'title',''))) not between 1 and 100
       or not coalesce(planner_private.routine_rule_supported(p_request->'rule'),false) then return jsonb_build_object('status','invalid'); end if;
     select array_agg(value) into periods from jsonb_array_elements_text(p_request->'periods') value;
     if not planner_private.valid_routine_periods(periods) then return jsonb_build_object('status','invalid'); end if;
   else
   if p_request ? 'periods' then return jsonb_build_object('status','invalid'); end if;
   if length(btrim(coalesce(p_request->>'title',''))) not between 1 and 100
     or not coalesce(planner_private.routine_rule_supported(p_request->'rule'),false)
     or jsonb_typeof(p_request->'protected') is distinct from 'boolean'
     or coalesce(p_request->>'startTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
     or coalesce(p_request->>'endTime','')!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
   then return jsonb_build_object('status','invalid'); end if;
   starts:=(p_request->>'startTime')::time; ends:=(p_request->>'endTime')::time;
   if not planner_private.routine_interval_valid(day,starts,ends,series.time_zone)
     or (day+starts) at time zone series.time_zone<=statement_timestamp() then return jsonb_build_object('status','invalid'); end if;
   end if;
 end if;
 impact:=planner_private.routine_series_impact(series.id,day);
 select count(*) filter(where not (i->>'preserved')::boolean),count(*) filter(where (i->>'preserved')::boolean)
   into affected,preserved from jsonb_array_elements(impact) i;
 return jsonb_build_object('status','complete','affected',affected,'preserved',preserved,'effectiveDate',day,
   'token',md5(jsonb_build_object('request',p_request,'impact',impact)::text));
exception when invalid_text_representation or datetime_field_overflow then return jsonb_build_object('status','invalid');
end $function$;

CREATE OR REPLACE FUNCTION planner_private.routine_series_command(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare owner_id uuid:=auth.uid(); request_id uuid:=(p_request->>'operationId')::uuid;
 series public.recurring_task_series; schedule public.planner_routine_schedules;
 receipt public.planner_command_receipts; preview jsonb; impact jsonb; result jsonb;
 day date; occurrence public.recurring_task_occurrences; event public.calendar_events; slot record;
 lifecycle_request jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found'); end if;
 if request_id is null then return jsonb_build_object('status','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
 select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
 if found then
   if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
   return jsonb_set(receipt.outcome,'{status}','"already-applied"');
 end if;
 select * into series from public.recurring_task_series where id=(p_request->>'seriesId')::uuid and user_id=owner_id for update;
 if not found then return jsonb_build_object('status','not-found'); end if;
 perform 1 from public.recurring_task_occurrences where series_id=series.id order by id for update;
 perform 1 from public.tasks where recurring_series_id=series.id and user_id=owner_id order by id for update;
 perform 1 from public.calendar_events where user_id=owner_id and routine_occurrence_id in
   (select id from public.recurring_task_occurrences where series_id=series.id) order by id for update;
 preview:=planner_private.routine_series_preview(p_request-'operationId'-'previewToken');
 if preview->>'status'<>'complete' then return preview; end if;
 if preview->>'token' is distinct from p_request->>'previewToken' then return jsonb_build_object('status','conflict'); end if;
 day:=(p_request->>'effectiveDate')::date;
 select * into schedule from public.planner_routine_schedules where series_id=series.id;
 impact:=planner_private.routine_series_impact(series.id,day);
 -- Retain all details of exceptions and already-started work. The lifecycle
 -- keeps these as Extra Occurrences if the new rule removes their date.
 for occurrence in select o.* from public.recurring_task_occurrences o
   where o.series_id=series.id and o.state in ('open','extra') and o.id in
     (select (i->>'id')::uuid from jsonb_array_elements(impact) i where (i->>'preserved')::boolean)
   order by o.id loop
   result:=public.recurring_task_lifecycle('edit-occurrence',jsonb_build_object('userId',owner_id,'seriesId',series.id,
     'occurrenceId',occurrence.id,'taskId',occurrence.task_id,'scope','this',
     'idempotencyKey',request_id::text||':preserve:'||occurrence.id::text,'updates',occurrence.details||occurrence.overrides));
   if result->>'status' not in ('complete','already-applied') then raise exception using errcode='PT409',message='Routine preservation rejected',detail=result::text; end if;
 end loop;
 if p_request->>'operation'='revise' then
   insert into public.planner_routine_schedule_revisions
     (series_id,effective_from,user_id,start_time,end_time,is_protected,timing_mode,periods)
   values(series.id,day,owner_id,(p_request->>'startTime')::time,(p_request->>'endTime')::time,
     coalesce((p_request->>'protected')::boolean,false),coalesce(p_request->>'timingMode','time'),
     case when p_request->>'timingMode'='period' then array(select value from
       unnest(array['morning','midday','afternoon','evening']) with ordinality p(value,ordinal)
       where p_request->'periods' ? value order by ordinal) else '{}'::text[] end)
   on conflict(series_id,effective_from) do update set start_time=excluded.start_time,end_time=excluded.end_time,
     is_protected=excluded.is_protected,timing_mode=excluded.timing_mode,periods=excluded.periods;
   update public.planner_routine_schedules r set start_time=h.start_time,end_time=h.end_time,is_protected=h.is_protected,
     timing_mode=h.timing_mode,periods=h.periods,version=gen_random_uuid()
   from public.planner_routine_schedule_revisions h where r.series_id=series.id and h.series_id=series.id and h.effective_from=day;
 end if;
 -- Materialize the still-active interval before a future terminal boundary.
 -- Once ended the shared lifecycle intentionally creates no more occurrences.
 if p_request->>'operation'='end' and day>greatest((statement_timestamp() at time zone series.time_zone)::date,series.activation_date) then
   result:=public.recurring_task_lifecycle('ensure-coverage',jsonb_build_object('userId',owner_id,'seriesId',series.id,
     'range',jsonb_build_object('from',greatest((statement_timestamp() at time zone series.time_zone)::date,series.activation_date),'to',day-1)));
   if result->>'status' not in ('complete','already-applied') then raise exception using errcode='PT409',message='Routine coverage rejected'; end if;
 end if;
 lifecycle_request:=jsonb_build_object('userId',owner_id,'seriesId',series.id,'idempotencyKey',request_id,'expectedRevisionToken',series.revision_token,
   'effectiveDate',day,'scope','following','coverage',jsonb_build_object('from',day,'to',greatest(day,series.coverage_horizon)));
 if p_request->>'operation'='revise' then
   lifecycle_request:=lifecycle_request||jsonb_build_object('recurrenceRule',p_request->'rule','defaults',jsonb_build_object('title',btrim(p_request->>'title'))||case when p_request ? 'steps' then jsonb_build_object('steps',p_request->'steps') else '{}'::jsonb end);
 end if;
 result:=public.recurring_task_lifecycle((p_request->>'operation')||'-series',lifecycle_request);
 -- Failure must unwind preservation, time policy and lifecycle together.
 if result->>'status' not in ('complete','already-applied') then
   raise exception using errcode='PT409',message='Routine series transition rejected',detail=result::text;
 end if;
 for occurrence in select o.* from public.recurring_task_occurrences o
   where o.series_id=series.id and o.scheduled_date>=day and o.state='open' and o.overrides='{}'::jsonb
   order by o.id loop
   select * into slot from planner_private.routine_schedule_at(series.id,occurrence.scheduled_date);
   select * into event from public.calendar_events where routine_occurrence_id=occurrence.id and user_id=owner_id;
   if occurrence.scheduled_period<>'' or slot.start_time is null or not planner_private.routine_interval_valid(occurrence.scheduled_date,slot.start_time,slot.end_time,series.time_zone) then
     if event.id is not null then perform public.delete_calendar_event_with_reminders(owner_id,event.id); end if;
   elsif event.id is null then
     perform planner_private.reserve_routine_occurrence(occurrence.id);
   else
     perform public.update_calendar_event_with_reminders(owner_id,event.id,jsonb_build_object('title',occurrence.details->>'title',
       'start_date',occurrence.scheduled_date,'end_date',planner_private.routine_end_date(occurrence.scheduled_date,slot.start_time,slot.end_time),'start_time',slot.start_time,'end_time',slot.end_time),null);
     update public.calendar_events set is_protected=slot.is_protected
       where id=event.id and user_id=owner_id and is_protected is distinct from slot.is_protected;
   end if;
 end loop;
 result:=jsonb_build_object('status','complete','seriesId',series.id);
 insert into public.planner_command_receipts values(owner_id,request_id,p_request,result);
 return result;
exception when sqlstate 'PT409' then return jsonb_build_object('status','conflict');
 when invalid_text_representation or datetime_field_overflow or check_violation or not_null_violation then return jsonb_build_object('status','invalid');
end $function$;
create function planner_private.edit_period_routine(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); request_id uuid; receipt public.planner_command_receipts;
 series public.recurring_task_series; occurrence public.recurring_task_occurrences; task public.tasks;
 placement public.planner_routine_period_placements; result jsonb; outcome jsonb; day date; chosen_period text;
begin
 if owner_id is null then return jsonb_build_object('status','not-found'); end if;
 if jsonb_typeof(p_request) is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','timingMode','seriesId','occurrenceId',
     'expectedSeriesToken','expectedOccurrenceVersion','expectedTaskVersion','expectedEventVersion','title','date','period','steps'))
   or length(btrim(coalesce(p_request->>'title',''))) not between 1 and 100
   or coalesce(p_request->>'date','')!~'^\d{4}-\d{2}-\d{2}$'
   or coalesce(p_request->>'period','') not in ('morning','midday','afternoon','evening')
   or p_request->>'expectedEventVersion' is not null then return jsonb_build_object('status','invalid'); end if;
 request_id:=(p_request->>'operationId')::uuid; day:=(p_request->>'date')::date; chosen_period:=p_request->>'period';
 if request_id is null or p_request ? 'steps' and not planner_private.valid_steps(p_request->'steps') then return jsonb_build_object('status','invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
 select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
 if found then
   if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
   return jsonb_set(receipt.outcome,'{status}','"already-applied"');
 end if;
 select * into series from public.recurring_task_series where id=(p_request->>'seriesId')::uuid and user_id=owner_id for update;
 if not found then return jsonb_build_object('status','not-found'); end if;
 if not exists(select 1 from public.recurring_task_series_revisions v where v.id=series.current_revision_id
   and planner_private.routine_rule_supported(v.recurrence_rule)) then return jsonb_build_object('status','unsupported'); end if;
 select * into occurrence from public.recurring_task_occurrences where id=(p_request->>'occurrenceId')::uuid and series_id=series.id for update;
 if not found then return jsonb_build_object('status','not-found'); end if;
 if occurrence.scheduled_period='' or occurrence.state not in ('open','extra') then return jsonb_build_object('status','unsupported'); end if;
 select * into task from public.tasks where id=occurrence.task_id and user_id=owner_id for update;
 if not found then return jsonb_build_object('status','not-found'); end if;
 select * into placement from public.planner_routine_period_placements where occurrence_id=occurrence.id and user_id=owner_id for update;
 if not found then return jsonb_build_object('status','not-found'); end if;
 if series.revision_token is distinct from (p_request->>'expectedSeriesToken')::integer
   or occurrence.version is distinct from (p_request->>'expectedOccurrenceVersion')::uuid
   or task.version is distinct from (p_request->>'expectedTaskVersion')::uuid then return jsonb_build_object('status','conflict'); end if;
 -- Materialize the destination before checking for an as-yet-unread sibling.
 perform planner_private.routine_snapshot_v2(day);
 if exists(select 1 from public.planner_routine_period_placements p where p.series_id=series.id and p.date=day
   and p.period=chosen_period and p.active and p.occurrence_id<>occurrence.id) then return jsonb_build_object('status','conflict','reason','occupied-period'); end if;
 result:=public.recurring_task_lifecycle('edit-occurrence',jsonb_build_object('userId',owner_id,'seriesId',series.id,
   'occurrenceId',occurrence.id,'taskId',task.id,'scope','this','scheduledDate',occurrence.scheduled_date,
   'expectedTaskVersion',task.version,'expectedRevisionToken',series.revision_token,'expectedRevisionId',occurrence.revision_id,
   'idempotencyKey',request_id,'updates',jsonb_build_object('title',btrim(p_request->>'title'))));
 if result->>'status' not in ('complete','already-applied') then return result; end if;
 update public.planner_routine_period_placements p set date=day,period=p_request->>'period' where p.occurrence_id=occurrence.id;
 outcome:=jsonb_build_object('status','complete','seriesId',series.id);
 if p_request ? 'steps' then
   result:=planner_private.change_task_steps(task.id,p_request->'steps');
   if result->>'status'<>'complete' then raise exception using errcode='PT409',message='Period steps changed concurrently'; end if;
   update public.planner_changes set before_state=before_state||jsonb_build_object('task',to_jsonb(task),'occurrence',to_jsonb(occurrence),'routinePlacement',to_jsonb(placement)),
     after_state=after_state||jsonb_build_object('routinePlacement',(select to_jsonb(p) from public.planner_routine_period_placements p where p.occurrence_id=occurrence.id))
     where id=(result->>'changeId')::uuid and user_id=owner_id;
   outcome:=outcome||result;
 end if;
 insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
 return outcome;
exception when unique_violation or sqlstate 'PT409' then return jsonb_build_object('status','conflict');
 when invalid_text_representation or datetime_field_overflow or check_violation or not_null_violation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.edit_period_routine(jsonb) from public,anon,authenticated;

alter table public.tasks drop constraint tasks_planned_period_valid;
alter table public.tasks add constraint tasks_planned_period_valid check (
 planned_period is null or (planned_date is not null and recurring_series_id is null
   and planned_period in ('morning','midday','afternoon','evening')));
comment on column public.tasks.planned_period is 'Optional Morning, Midday, Afternoon or Evening grouping within the planned date; NULL means Anytime.';
do $task_midday$
declare item record; definition text;
begin
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','planner_private') and p.prokind='f' and p.prosrc like '%planned_period%'
     and p.prosrc like '%''morning'',''afternoon'',''evening''%' loop
   definition:=replace(pg_get_functiondef(item.oid),'''morning'',''afternoon'',''evening''','''morning'',''midday'',''afternoon'',''evening''');
   execute definition;
 end loop;
end $task_midday$;

-- Undo of an editor save restores placement together with its task and steps.
create function planner_private.period_planner_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); change public.planner_changes; result jsonb; placement jsonb;
begin
 if owner_id is null or p_request->>'operation' is distinct from 'undo' then
   return planner_private.steps_planner_command(p_request);
 end if;
 if exists(select 1 from public.planner_command_receipts where user_id=owner_id and operation_id=(p_request->>'operationId')::uuid) then
   return planner_private.steps_planner_command(p_request);
 end if;
 select * into change from public.planner_changes where id=(p_request->>'changeId')::uuid and user_id=owner_id for update;
 if not found or not (change.before_state ? 'routinePlacement') then return planner_private.steps_planner_command(p_request); end if;
 select to_jsonb(p) into placement from public.planner_routine_period_placements p
   where p.occurrence_id=(change.after_state->'routinePlacement'->>'occurrence_id')::uuid and p.user_id=owner_id;
 if placement is distinct from change.after_state->'routinePlacement' then return jsonb_build_object('status','conflict'); end if;
 result:=planner_private.steps_planner_command(p_request);
 if result->>'status'='complete' then
   -- The inner command now holds occurrence/task locks; recheck before writing.
   select to_jsonb(p) into placement from public.planner_routine_period_placements p
     where p.occurrence_id=(change.after_state->'routinePlacement'->>'occurrence_id')::uuid and p.user_id=owner_id for update;
   if placement is distinct from change.after_state->'routinePlacement' then raise exception using errcode='PT409',message='Routine placement changed'; end if;
   update public.planner_routine_period_placements set date=(change.before_state->'routinePlacement'->>'date')::date,
     period=change.before_state->'routinePlacement'->>'period'
     where occurrence_id=(change.before_state->'routinePlacement'->>'occurrence_id')::uuid and user_id=owner_id;
 end if;
 return result;
exception when unique_violation or sqlstate 'PT409' then return jsonb_build_object('status','conflict');
 when invalid_text_representation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.period_planner_command(jsonb) from public,anon;
grant execute on function planner_private.period_planner_command(jsonb) to authenticated;
create or replace function public.planner_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.period_planner_command(p_request) $$;

