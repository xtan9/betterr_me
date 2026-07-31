-- Run after `supabase db reset --local` against the local instance.
-- ralph-ci: true
-- This fixture uses the constrained runner's administrative setup helper,
-- exercises the application roles, and rolls everything back so no synthetic
-- identities or rows remain.
--
-- The personal-record boundary is the workout -> workout_exercises ->
-- workout_sets chain. Personal records are derived from completed normal sets;
-- there is no separate personal-record table to authorize.

begin;

create function pg_temp.expect_sqlstate(
  statement text,
  expected_state text,
  failure_message text
)
returns void
language plpgsql
as $$
declare
  actual_state text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state = expected_state then
      return;
    end if;
    raise exception '%: expected SQLSTATE %, got %',
      failure_message, expected_state, actual_state;
  end;

  raise exception '%: expected SQLSTATE %, but statement succeeded',
    failure_message, expected_state;
end;
$$;

create function pg_temp.expect_no_rows(statement text, failure_message text)
returns void
language plpgsql
as $$
declare
  affected_rows integer;
begin
  execute statement;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception '%: expected zero affected rows, got %',
      failure_message, affected_rows;
  end if;
end;
$$;

select public.ralph_ci_create_auth_user(
  '21000000-0000-0000-0000-000000000001',
  'personal-records-a@example.test'
);
select public.ralph_ci_create_auth_user(
  '21000000-0000-0000-0000-000000000002',
  'personal-records-b@example.test'
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'journal_entries',
    'journal_entry_links',
    'exercises',
    'routines',
    'routine_exercises',
    'workouts',
    'workout_exercises',
    'workout_sets',
    'finance_cushions',
    'finance_cushion_snapshots'
  ] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = table_name
        and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on %', table_name;
    end if;
  end loop;
end
$$;

-- Seed owner A's journal and workout records as the owning application role.
-- The constrained runner helper above is the administrative setup seam.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000001',
  true
);

insert into public.journal_entries (
  id, user_id, entry_date, title, content, mood, word_count, tags
)
values
  (
    '23000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '2026-07-01',
    'A journal entry',
    '{"type":"doc","content":[]}'::jsonb,
    4,
    3,
    array['reflection']
  ),
  (
    '23000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000001',
    '2026-07-02',
    'A entry to delete',
    '{"type":"doc","content":[]}'::jsonb,
    3,
    2,
    array['cleanup']
  );

insert into public.journal_entry_links (id, entry_id, link_type, link_id)
values (
  '24000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'task',
  '31000000-0000-0000-0000-000000000001'
);

insert into public.exercises (
  id, user_id, name, muscle_group_primary, equipment, exercise_type, is_custom
)
values
  (
    '22000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'A deadlift',
    'back',
    'barbell',
    'weight_reps',
    true
  ),
  (
    '22000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000001',
    'A exercise to delete',
    'quadriceps',
    'bodyweight',
    'bodyweight_reps',
    true
  );

insert into public.routines (id, user_id, name, notes)
values (
  '25000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'A routine',
  'A routine note'
);

insert into public.routine_exercises (
  id, routine_id, exercise_id, sort_order, target_sets, target_reps,
  target_weight_kg, rest_timer_seconds, notes
)
values (
  '26000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  1,
  3,
  5,
  100,
  120,
  'A routine exercise'
);

insert into public.workouts (
  id, user_id, title, status, started_at, completed_at, duration_seconds,
  notes, routine_id
)
values
  (
    '27000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'A completed workout',
    'completed',
    '2026-07-01 08:00:00+00',
    '2026-07-01 08:45:00+00',
    2700,
    'A workout note',
    '25000000-0000-0000-0000-000000000001'
  ),
  (
    '27000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000001',
    'A workout to delete',
    'completed',
    '2026-07-02 08:00:00+00',
    '2026-07-02 08:30:00+00',
    1800,
    null,
    null
  );

insert into public.workout_exercises (
  id, workout_id, exercise_id, sort_order, notes, rest_timer_seconds
)
values (
  '28000000-0000-0000-0000-000000000001',
  '27000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  1,
  'A workout exercise',
  120
);

insert into public.workout_sets (
  id, workout_exercise_id, set_number, set_type, weight_kg, reps,
  is_completed, rpe
)
values
  (
    '29000000-0000-0000-0000-000000000001',
    '28000000-0000-0000-0000-000000000001',
    1,
    'normal',
    100,
    5,
    true,
    8
  ),
  (
    '29000000-0000-0000-0000-000000000003',
    '28000000-0000-0000-0000-000000000001',
    2,
    'normal',
    90,
    4,
    true,
    7
  );

-- Seed owner B's records with the administrative setup identity.
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000002',
  true
);

insert into public.journal_entries (
  id, user_id, entry_date, title, content, mood, word_count, tags
)
values (
  '23000000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000002',
  '2026-07-01',
  'B journal entry',
  '{"type":"doc","content":[]}'::jsonb,
  2,
  3,
  array['private']
);

insert into public.journal_entry_links (id, entry_id, link_type, link_id)
values (
  '24000000-0000-0000-0000-000000000002',
  '23000000-0000-0000-0000-000000000002',
  'project',
  '31000000-0000-0000-0000-000000000002'
);

insert into public.exercises (
  id, user_id, name, muscle_group_primary, equipment, exercise_type, is_custom
)
values (
  '22000000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000002',
  'B squat',
  'quadriceps',
  'barbell',
  'weight_reps',
  true
);

insert into public.routines (id, user_id, name, notes)
values (
  '25000000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000002',
  'B routine',
  null
);

insert into public.routine_exercises (
  id, routine_id, exercise_id, sort_order, target_sets, target_reps,
  target_weight_kg, rest_timer_seconds
)
values (
  '26000000-0000-0000-0000-000000000002',
  '25000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000002',
  1,
  4,
  6,
  80,
  90
);

insert into public.workouts (
  id, user_id, title, status, started_at, completed_at, duration_seconds
)
values (
  '27000000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000002',
  'B completed workout',
  'completed',
  '2026-07-01 09:00:00+00',
  '2026-07-01 09:40:00+00',
  2400
);

insert into public.workout_exercises (
  id, workout_id, exercise_id, sort_order, notes, rest_timer_seconds
)
values (
  '28000000-0000-0000-0000-000000000002',
  '27000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000002',
  1,
  null,
  90
);

insert into public.workout_sets (
  id, workout_exercise_id, set_number, set_type, weight_kg, reps,
  is_completed, rpe
)
values (
  '29000000-0000-0000-0000-000000000002',
  '28000000-0000-0000-0000-000000000002',
  1,
  'normal',
  110,
  3,
  true,
  9
);

insert into public.finance_cushions (
  id, user_id, liquid_resources_cents, monthly_essential_expenses_cents,
  monthly_continuing_income_cents
)
values (
  '2a000000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000002',
  60000,
  30000,
  0
);

insert into public.finance_cushion_snapshots (
  id, plan_id, user_id, action_id, trigger, scenario, months_covered,
  sustainable, result, model_version
)
values (
  '2b000000-0000-0000-0000-000000000002',
  '2a000000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000002',
  '2c000000-0000-0000-0000-000000000002',
  'completed',
  'current',
  2,
  false,
  '{"months_covered":2}'::jsonb,
  '2.0.0'
);

-- Journal: owner A can read and mutate only A's rows, while the duplicate
-- date and duplicate link assertions prove the relevant integrity rules.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000001',
  true
);

do $$
declare
  affected_rows integer;
begin
  if (select count(*) from public.journal_entries) <> 2 then
    raise exception 'journal owner A cannot read both own entries';
  end if;
  if (select count(*) from public.journal_entry_links) <> 1
     or not exists (
       select 1 from public.journal_entry_links
       where id = '24000000-0000-0000-0000-000000000001'
     ) then
    raise exception 'journal owner A cannot read own link';
  end if;
  if exists (
    select 1 from public.journal_entries
    where user_id <> '21000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'journal owner A can read another user entry';
  end if;

  update public.journal_entries
  set title = 'A journal entry updated'
  where id = '23000000-0000-0000-0000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'journal owner A cannot update own entry';
  end if;
  if not exists (
    select 1 from public.journal_entries
    where id = '23000000-0000-0000-0000-000000000001'
      and title = 'A journal entry updated'
  ) then
    raise exception 'journal owner A update did not persist';
  end if;

  delete from public.journal_entries
  where id = '23000000-0000-0000-0000-000000000003';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or exists (
    select 1 from public.journal_entries
    where id = '23000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'journal owner A cannot delete own entry';
  end if;
end
$$;

insert into public.journal_entries (
  id, user_id, entry_date, title, content, mood, word_count
)
values (
  '23000000-0000-0000-0000-000000000004',
  '21000000-0000-0000-0000-000000000001',
  '2026-07-03',
  'A inserted journal entry',
  '{"type":"doc","content":[]}'::jsonb,
  5,
  4
);
insert into public.journal_entry_links (id, entry_id, link_type, link_id)
values (
  '24000000-0000-0000-0000-000000000003',
  '23000000-0000-0000-0000-000000000004',
  'project',
  '31000000-0000-0000-0000-000000000003'
);

select pg_temp.expect_sqlstate(
  $sql$
    insert into public.journal_entries (
      user_id, entry_date, title, content, mood, word_count
    ) values (
      '21000000-0000-0000-0000-000000000001',
      '2026-07-01',
      'duplicate journal date',
      '{"type":"doc","content":[]}'::jsonb,
      3,
      1
    )
  $sql$,
  '23505',
  'journal duplicate date was accepted'
);

select pg_temp.expect_sqlstate(
  $sql$
    insert into public.journal_entry_links (entry_id, link_type, link_id)
    values (
      '23000000-0000-0000-0000-000000000001',
      'task',
      '31000000-0000-0000-0000-000000000001'
    )
  $sql$,
  '23505',
  'duplicate journal link was accepted'
);

delete from public.journal_entry_links
where id = '24000000-0000-0000-0000-000000000003';
do $$
begin
  if exists (
    select 1 from public.journal_entry_links
    where id = '24000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'journal owner A cannot delete own link';
  end if;
end
$$;

-- Owner A cannot read or write B's journal rows. The explicit persistence
-- checks are intentionally outside the failing operation.
do $$
begin
  if exists (
    select 1 from public.journal_entries
    where id = '23000000-0000-0000-0000-000000000002'
  ) or exists (
    select 1 from public.journal_entry_links
    where id = '24000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'journal owner A can read owner B data';
  end if;
end
$$;

select pg_temp.expect_no_rows(
  $sql$update public.journal_entries set title = 'tampered' where id = '23000000-0000-0000-0000-000000000002'$sql$,
  'journal owner A updated owner B entry'
);
select pg_temp.expect_no_rows(
  $sql$delete from public.journal_entries where id = '23000000-0000-0000-0000-000000000002'$sql$,
  'journal owner A deleted owner B entry'
);
select pg_temp.expect_no_rows(
  $sql$delete from public.journal_entry_links where id = '24000000-0000-0000-0000-000000000002'$sql$,
  'journal owner A deleted owner B link'
);
select pg_temp.expect_sqlstate(
  $sql$
    insert into public.journal_entries (
      user_id, entry_date, title, content, mood, word_count
    ) values (
      '21000000-0000-0000-0000-000000000002',
      '2026-07-03',
      'cross-owner journal insert',
      '{"type":"doc","content":[]}'::jsonb,
      3,
      1
    )
  $sql$,
  '42501',
  'journal owner A inserted an owner B entry'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.journal_entry_links (entry_id, link_type, link_id) values ('23000000-0000-0000-0000-000000000002', 'task', '31000000-0000-0000-0000-000000000004')$sql$,
  '42501',
  'journal owner A inserted an owner B link'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  if (select count(*) from public.journal_entries where user_id = '21000000-0000-0000-0000-000000000002') <> 1
     or not exists (
       select 1 from public.journal_entries
       where id = '23000000-0000-0000-0000-000000000002'
         and title = 'B journal entry'
     ) then
    raise exception 'journal denied writes changed owner B state';
  end if;
  if (select count(*) from public.journal_entry_links where entry_id = '23000000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'journal link denied delete changed owner B state';
  end if;
end
$$;

-- Anonymous has no table privileges and therefore cannot read or write any
-- journal object, rather than being able to rely on a client-side filter.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_sqlstate('select * from public.journal_entries', '42501', 'anonymous journal read was allowed');
select pg_temp.expect_sqlstate('insert into public.journal_entries (user_id, entry_date, title, content, mood, word_count) values (''21000000-0000-0000-0000-000000000001'', ''2026-07-04'', ''anonymous'', ''{"type":"doc","content":[]}'', 3, 1)', '42501', 'anonymous journal insert was allowed');
select pg_temp.expect_sqlstate('update public.journal_entries set title = ''anonymous''', '42501', 'anonymous journal update was allowed');
select pg_temp.expect_sqlstate('delete from public.journal_entries', '42501', 'anonymous journal delete was allowed');
select pg_temp.expect_sqlstate('select * from public.journal_entry_links', '42501', 'anonymous journal-link read was allowed');
select pg_temp.expect_sqlstate('insert into public.journal_entry_links (entry_id, link_type, link_id) values (''23000000-0000-0000-0000-000000000001'', ''task'', ''31000000-0000-0000-0000-000000000003'')', '42501', 'anonymous journal-link insert was allowed');
select pg_temp.expect_sqlstate('delete from public.journal_entry_links', '42501', 'anonymous journal-link delete was allowed');
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000001',
  true
);
do $$
begin
  if (select count(*) from public.journal_entries) <> 2
     or not exists (
       select 1 from public.journal_entries
       where id = '23000000-0000-0000-0000-000000000001'
         and title = 'A journal entry updated'
     )
     or not exists (
       select 1 from public.journal_entries
       where id = '23000000-0000-0000-0000-000000000004'
         and title = 'A inserted journal entry'
     )
     or (select count(*) from public.journal_entry_links) <> 1 then
    raise exception 'anonymous journal writes changed owner A state';
  end if;
end
$$;

-- Workout/personal-record coverage starts with the owner-visible chain. The
-- max completed normal-set weight is the database input to a personal-record
-- calculation and must never include another user's set.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000001',
  true
);

do $$
declare
  affected_rows integer;
begin
  if (select count(*) from public.exercises where user_id = '21000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'workout owner A exercise visibility is incorrect';
  end if;
  if (select count(*) from public.routines) <> 1
     or (select count(*) from public.routine_exercises) <> 1
     or (select count(*) from public.workouts) <> 2
     or (select count(*) from public.workout_exercises) <> 1
     or (select count(*) from public.workout_sets) <> 2 then
    raise exception 'workout owner A visibility is incomplete';
  end if;

  insert into public.exercises (
    id, user_id, name, muscle_group_primary, equipment, exercise_type, is_custom
  ) values (
    '22000000-0000-0000-0000-000000000004',
    '21000000-0000-0000-0000-000000000001',
    'A inserted exercise',
    'shoulders',
    'dumbbell',
    'weight_reps',
    true
  );
  update public.exercises
  set name = 'A inserted exercise updated'
  where id = '22000000-0000-0000-0000-000000000004';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or not exists (
    select 1 from public.exercises
    where id = '22000000-0000-0000-0000-000000000004'
      and name = 'A inserted exercise updated'
  ) then
    raise exception 'workout owner A exercise update did not persist';
  end if;
  delete from public.exercises
  where id = '22000000-0000-0000-0000-000000000004';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or exists (
    select 1 from public.exercises
    where id = '22000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'workout owner A cannot delete own exercise';
  end if;

  insert into public.routines (id, user_id, name)
  values (
    '25000000-0000-0000-0000-000000000004',
    '21000000-0000-0000-0000-000000000001',
    'A inserted routine'
  );
  update public.routines
  set name = 'A inserted routine updated'
  where id = '25000000-0000-0000-0000-000000000004';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or not exists (
    select 1 from public.routines
    where id = '25000000-0000-0000-0000-000000000004'
      and name = 'A inserted routine updated'
  ) then
    raise exception 'workout owner A routine update did not persist';
  end if;

  insert into public.routine_exercises (
    id, routine_id, exercise_id, sort_order, target_sets, target_reps
  )
  values (
    '26000000-0000-0000-0000-000000000004',
    '25000000-0000-0000-0000-000000000004',
    '22000000-0000-0000-0000-000000000001',
    1,
    2,
    8
  );
  update public.routine_exercises
  set target_reps = 9, notes = 'A routine exercise updated'
  where id = '26000000-0000-0000-0000-000000000004';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or not exists (
    select 1 from public.routine_exercises
    where id = '26000000-0000-0000-0000-000000000004'
      and target_reps = 9
      and notes = 'A routine exercise updated'
  ) then
    raise exception 'workout owner A routine exercise update did not persist';
  end if;
  delete from public.routine_exercises
  where id = '26000000-0000-0000-0000-000000000004';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or exists (
    select 1 from public.routine_exercises
    where id = '26000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'workout owner A cannot delete own routine exercise';
  end if;
  delete from public.routines
  where id = '25000000-0000-0000-0000-000000000004';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or exists (
    select 1 from public.routines
    where id = '25000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'workout owner A cannot delete own routine';
  end if;

  insert into public.workout_exercises (
    id, workout_id, exercise_id, sort_order
  )
  values (
    '28000000-0000-0000-0000-000000000003',
    '27000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    2
  );
  insert into public.workout_sets (
    id, workout_exercise_id, set_number, set_type, weight_kg, reps,
    is_completed
  )
  values (
    '29000000-0000-0000-0000-000000000004',
    '28000000-0000-0000-0000-000000000003',
    1,
    'normal',
    70,
    10,
    true
  );
  update public.workout_sets
  set reps = 11
  where id = '29000000-0000-0000-0000-000000000004';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or not exists (
    select 1 from public.workout_sets
    where id = '29000000-0000-0000-0000-000000000004'
      and reps = 11
  ) then
    raise exception 'workout owner A workout set update did not persist';
  end if;
  update public.workout_exercises
  set notes = 'A workout exercise updated'
  where id = '28000000-0000-0000-0000-000000000003';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or not exists (
    select 1 from public.workout_exercises
    where id = '28000000-0000-0000-0000-000000000003'
      and notes = 'A workout exercise updated'
  ) then
    raise exception 'workout owner A workout exercise update did not persist';
  end if;

  insert into public.workouts (
    id, user_id, title, status, started_at
  ) values (
    '27000000-0000-0000-0000-000000000006',
    '21000000-0000-0000-0000-000000000001',
    'A active personal-record exclusion',
    'in_progress',
    '2026-07-03 08:00:00+00'
  );
  insert into public.workout_exercises (
    id, workout_id, exercise_id, sort_order
  ) values (
    '28000000-0000-0000-0000-000000000006',
    '27000000-0000-0000-0000-000000000006',
    '22000000-0000-0000-0000-000000000001',
    1
  );
  insert into public.workout_sets (
    id, workout_exercise_id, set_number, set_type, weight_kg, reps,
    is_completed
  ) values (
    '29000000-0000-0000-0000-000000000006',
    '28000000-0000-0000-0000-000000000006',
    1,
    'normal',
    999,
    1,
    true
  );

  update public.workouts
  set title = 'A completed workout updated'
  where id = '27000000-0000-0000-0000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'workout owner A cannot update own workout';
  end if;
  if not exists (
    select 1 from public.workouts
    where id = '27000000-0000-0000-0000-000000000001'
      and title = 'A completed workout updated'
  ) then
    raise exception 'workout owner A workout update did not persist';
  end if;

  if (select count(*)
      from public.workout_sets ws
      join public.workout_exercises we on we.id = ws.workout_exercise_id
      join public.workouts w on w.id = we.workout_id
      where w.user_id = '21000000-0000-0000-0000-000000000001'
        and w.status = 'completed'
        and we.exercise_id = '22000000-0000-0000-0000-000000000001'
        and ws.is_completed
        and ws.set_type = 'normal') <> 3
      or (select max(ws.weight_kg)
         from public.workout_sets ws
         join public.workout_exercises we on we.id = ws.workout_exercise_id
         join public.workouts w on w.id = we.workout_id
          where w.user_id = '21000000-0000-0000-0000-000000000001'
            and w.status = 'completed'
            and we.exercise_id = '22000000-0000-0000-0000-000000000001'
            and ws.is_completed
            and ws.set_type = 'normal') <> 100 then
    raise exception 'personal-record source includes the wrong workout rows';
  end if;
  if (select count(*)
      from public.workout_sets ws
      join public.workout_exercises we on we.id = ws.workout_exercise_id
      join public.workouts w on w.id = we.workout_id
      where w.user_id = '21000000-0000-0000-0000-000000000001'
        and w.status = 'completed'
        and we.exercise_id = '22000000-0000-0000-0000-000000000002'
        and ws.is_completed
        and ws.set_type = 'normal') <> 0 then
    raise exception 'personal-record source included another owner exercise';
  end if;

  delete from public.workouts
  where id = '27000000-0000-0000-0000-000000000006';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or exists (
    select 1 from public.workouts
    where id = '27000000-0000-0000-0000-000000000006'
  ) then
    raise exception 'workout owner A cannot delete the non-completed workout';
  end if;

  delete from public.workout_sets
  where id = '29000000-0000-0000-0000-000000000004';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or exists (
    select 1 from public.workout_sets
    where id = '29000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'workout owner A cannot delete own workout set';
  end if;
  delete from public.workout_exercises
  where id = '28000000-0000-0000-0000-000000000003';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or exists (
    select 1 from public.workout_exercises
    where id = '28000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'workout owner A cannot delete own workout exercise';
  end if;
end
$$;

-- A user cannot attach another user's custom exercise to an otherwise owned
-- routine or workout, including through an UPDATE of an existing child row.
select pg_temp.expect_sqlstate(
  $sql$insert into public.routine_exercises (id, routine_id, exercise_id, sort_order, target_sets, target_reps) values ('26000000-0000-0000-0000-000000000010', '25000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002', 2, 3, 5)$sql$,
  '42501',
  'workout owner A attached owner B exercise to a routine'
);
select pg_temp.expect_sqlstate(
  $sql$update public.routine_exercises set exercise_id = '22000000-0000-0000-0000-000000000002' where id = '26000000-0000-0000-0000-000000000001'$sql$,
  '42501',
  'workout owner A changed a routine to owner B exercise'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.workout_exercises (id, workout_id, exercise_id, sort_order) values ('28000000-0000-0000-0000-000000000010', '27000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002', 3)$sql$,
  '42501',
  'workout owner A attached owner B exercise to a workout'
);
select pg_temp.expect_sqlstate(
  $sql$update public.workout_exercises set exercise_id = '22000000-0000-0000-0000-000000000002' where id = '28000000-0000-0000-0000-000000000001'$sql$,
  '42501',
  'workout owner A changed a workout to owner B exercise'
);
do $$
begin
  if (select exercise_id from public.routine_exercises where id = '26000000-0000-0000-0000-000000000001')
       <> '22000000-0000-0000-0000-000000000001'
     or (select exercise_id from public.workout_exercises where id = '28000000-0000-0000-0000-000000000001')
       <> '22000000-0000-0000-0000-000000000001' then
    raise exception 'cross-owner exercise references changed owner A state';
  end if;
end
$$;

-- A cannot see B's workout chain and denied writes leave B unchanged.
do $$
begin
  if exists (select 1 from public.exercises where id = '22000000-0000-0000-0000-000000000002')
     or exists (select 1 from public.routines where id = '25000000-0000-0000-0000-000000000002')
     or exists (select 1 from public.routine_exercises where id = '26000000-0000-0000-0000-000000000002')
     or exists (select 1 from public.workouts where id = '27000000-0000-0000-0000-000000000002')
     or exists (select 1 from public.workout_exercises where id = '28000000-0000-0000-0000-000000000002')
     or exists (select 1 from public.workout_sets where id = '29000000-0000-0000-0000-000000000002') then
    raise exception 'workout owner A can read owner B data';
  end if;
end
$$;

select pg_temp.expect_no_rows(
  $sql$update public.workouts set title = 'tampered' where id = '27000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A updated owner B workout'
);
select pg_temp.expect_no_rows(
  $sql$delete from public.workouts where id = '27000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A deleted owner B workout'
);
select pg_temp.expect_no_rows(
  $sql$update public.exercises set name = 'tampered' where id = '22000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A updated owner B exercise'
);
select pg_temp.expect_no_rows(
  $sql$delete from public.exercises where id = '22000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A deleted owner B exercise'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.exercises (user_id, name, muscle_group_primary, equipment, exercise_type, is_custom) values ('21000000-0000-0000-0000-000000000002', 'cross-owner', 'back', 'barbell', 'weight_reps', true)$sql$,
  '42501',
  'workout owner A inserted owner B exercise'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.routines (id, user_id, name) values ('25000000-0000-0000-0000-000000000010', '21000000-0000-0000-0000-000000000002', 'cross-owner')$sql$,
  '42501',
  'workout owner A inserted owner B routine'
);
select pg_temp.expect_no_rows(
  $sql$update public.routines set name = 'tampered' where id = '25000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A updated owner B routine'
);
select pg_temp.expect_no_rows(
  $sql$delete from public.routines where id = '25000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A deleted owner B routine'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.routine_exercises (routine_id, exercise_id, sort_order) values ('25000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 2)$sql$,
  '42501',
  'workout owner A inserted owner B routine exercise'
);
select pg_temp.expect_no_rows(
  $sql$update public.routine_exercises set target_reps = 99 where id = '26000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A updated owner B routine exercise'
);
select pg_temp.expect_no_rows(
  $sql$delete from public.routine_exercises where id = '26000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A deleted owner B routine exercise'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.workouts (id, user_id, title, status) values ('27000000-0000-0000-0000-000000000010', '21000000-0000-0000-0000-000000000002', 'cross-owner', 'completed')$sql$,
  '42501',
  'workout owner A inserted owner B workout'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.workout_exercises (workout_id, exercise_id, sort_order) values ('27000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 2)$sql$,
  '42501',
  'workout owner A inserted owner B workout exercise'
);
select pg_temp.expect_no_rows(
  $sql$update public.workout_exercises set notes = 'tampered' where id = '28000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A updated owner B workout exercise'
);
select pg_temp.expect_no_rows(
  $sql$delete from public.workout_exercises where id = '28000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A deleted owner B workout exercise'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.workout_sets (workout_exercise_id, set_number, set_type, weight_kg, reps, is_completed) values ('28000000-0000-0000-0000-000000000002', 2, 'normal', 1, 1, true)$sql$,
  '42501',
  'workout owner A inserted owner B workout set'
);
select pg_temp.expect_no_rows(
  $sql$update public.workout_sets set reps = 99 where id = '29000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A updated owner B workout set'
);
select pg_temp.expect_no_rows(
  $sql$delete from public.workout_sets where id = '29000000-0000-0000-0000-000000000002'$sql$,
  'workout owner A deleted owner B workout set'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  if (select count(*) from public.exercises where user_id = '21000000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.routines where user_id = '21000000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.routine_exercises where routine_id = '25000000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.workouts where user_id = '21000000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.workout_exercises where workout_id = '27000000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.workout_sets where workout_exercise_id = '28000000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'workout denied writes changed owner B state';
  end if;
  if (select name from public.exercises where id = '22000000-0000-0000-0000-000000000002') <> 'B squat'
     or (select name from public.routines where id = '25000000-0000-0000-0000-000000000002') <> 'B routine'
     or (select target_reps from public.routine_exercises where id = '26000000-0000-0000-0000-000000000002') <> 6
     or (select title from public.workouts where id = '27000000-0000-0000-0000-000000000002') <> 'B completed workout'
     or (select notes from public.workout_exercises where id = '28000000-0000-0000-0000-000000000002') is not null
     or (select weight_kg from public.workout_sets where id = '29000000-0000-0000-0000-000000000002') <> 110 then
    raise exception 'workout cross-owner writes changed owner B values';
  end if;
end
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000001',
  true
);

-- The active-workout uniqueness constraint is an applicable database
-- invariant, not a client-side rule.
insert into public.workouts (id, user_id, title, status)
values (
  '27000000-0000-0000-0000-000000000004',
  '21000000-0000-0000-0000-000000000001',
  'A active workout',
  'in_progress'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.workouts (id, user_id, title, status) values ('27000000-0000-0000-0000-000000000005', '21000000-0000-0000-0000-000000000001', 'second active workout', 'in_progress')$sql$,
  '23505',
  'two active workouts were accepted for one owner'
);

-- Owner A can delete owned workouts. PostgreSQL's cascade then removes the
-- child rows, without silently removing owner B's records.
do $$
declare
  affected_rows integer;
begin
  delete from public.workouts where id in (
    '27000000-0000-0000-0000-000000000001',
    '27000000-0000-0000-0000-000000000003',
    '27000000-0000-0000-0000-000000000004'
  );
  get diagnostics affected_rows = row_count;
  if affected_rows <> 3
     or exists (
       select 1 from public.workouts
       where user_id = '21000000-0000-0000-0000-000000000001'
     )
     or exists (
       select 1
       from public.workout_exercises we
       join public.workouts w on w.id = we.workout_id
       where w.user_id = '21000000-0000-0000-0000-000000000001'
     )
     or exists (
       select 1
       from public.workout_sets ws
       join public.workout_exercises we on we.id = ws.workout_exercise_id
       join public.workouts w on w.id = we.workout_id
       where w.user_id = '21000000-0000-0000-0000-000000000001'
     ) then
    raise exception 'workout owner A delete did not remove the owned chain';
  end if;
end
$$;

-- B remains the sole visible owner when B reads the workout chain.
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  if (select count(*) from public.exercises where user_id = '21000000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.routines) <> 1
     or (select count(*) from public.routine_exercises) <> 1
     or (select count(*) from public.workouts) <> 1
     or (select count(*) from public.workout_exercises) <> 1
     or (select count(*) from public.workout_sets) <> 1 then
    raise exception 'workout owner B cannot read own surviving data';
  end if;
  if not exists (
    select 1 from public.workout_sets
    where id = '29000000-0000-0000-0000-000000000002'
      and weight_kg = 110
  ) or (select title from public.workouts where id = '27000000-0000-0000-0000-000000000002') <> 'B completed workout' then
    raise exception 'workout owner B state changed after denied writes';
  end if;
end
$$;

-- Anonymous cannot use any workout table, including the derived personal-
-- record source, through the public role.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_sqlstate('select * from public.exercises', '42501', 'anonymous exercise read was allowed');
select pg_temp.expect_sqlstate('insert into public.exercises (user_id, name, muscle_group_primary, equipment, exercise_type, is_custom) values (''21000000-0000-0000-0000-000000000001'', ''anonymous'', ''back'', ''barbell'', ''weight_reps'', true)', '42501', 'anonymous exercise insert was allowed');
select pg_temp.expect_sqlstate('update public.exercises set name = ''anonymous''', '42501', 'anonymous exercise update was allowed');
select pg_temp.expect_sqlstate('delete from public.exercises', '42501', 'anonymous exercise delete was allowed');
select pg_temp.expect_sqlstate('select * from public.routines', '42501', 'anonymous routine read was allowed');
select pg_temp.expect_sqlstate('insert into public.routines (user_id, name) values (''21000000-0000-0000-0000-000000000001'', ''anonymous'')', '42501', 'anonymous routine insert was allowed');
select pg_temp.expect_sqlstate('update public.routines set name = ''anonymous''', '42501', 'anonymous routine update was allowed');
select pg_temp.expect_sqlstate('delete from public.routines', '42501', 'anonymous routine delete was allowed');
select pg_temp.expect_sqlstate('select * from public.routine_exercises', '42501', 'anonymous routine-exercise read was allowed');
select pg_temp.expect_sqlstate('insert into public.routine_exercises (routine_id, exercise_id, sort_order) values (''25000000-0000-0000-0000-000000000002'', ''22000000-0000-0000-0000-000000000002'', 3)', '42501', 'anonymous routine-exercise insert was allowed');
select pg_temp.expect_sqlstate('update public.routine_exercises set target_reps = 1', '42501', 'anonymous routine-exercise update was allowed');
select pg_temp.expect_sqlstate('delete from public.routine_exercises', '42501', 'anonymous routine-exercise delete was allowed');
select pg_temp.expect_sqlstate('select * from public.workouts', '42501', 'anonymous workout read was allowed');
select pg_temp.expect_sqlstate('insert into public.workouts (user_id, title, status) values (''21000000-0000-0000-0000-000000000001'', ''anonymous'', ''completed'')', '42501', 'anonymous workout insert was allowed');
select pg_temp.expect_sqlstate('update public.workouts set title = ''anonymous''', '42501', 'anonymous workout update was allowed');
select pg_temp.expect_sqlstate('delete from public.workouts', '42501', 'anonymous workout delete was allowed');
select pg_temp.expect_sqlstate('select * from public.workout_exercises', '42501', 'anonymous workout-exercise read was allowed');
select pg_temp.expect_sqlstate('insert into public.workout_exercises (workout_id, exercise_id, sort_order) values (''27000000-0000-0000-0000-000000000002'', ''22000000-0000-0000-0000-000000000002'', 3)', '42501', 'anonymous workout-exercise insert was allowed');
select pg_temp.expect_sqlstate('update public.workout_exercises set notes = ''anonymous''', '42501', 'anonymous workout-exercise update was allowed');
select pg_temp.expect_sqlstate('delete from public.workout_exercises', '42501', 'anonymous workout-exercise delete was allowed');
select pg_temp.expect_sqlstate('select * from public.workout_sets', '42501', 'anonymous workout-set read was allowed');
select pg_temp.expect_sqlstate('insert into public.workout_sets (workout_exercise_id, set_number, set_type, is_completed) values (''28000000-0000-0000-0000-000000000002'', 2, ''normal'', true)', '42501', 'anonymous workout-set insert was allowed');
select pg_temp.expect_sqlstate('update public.workout_sets set reps = 99', '42501', 'anonymous workout-set update was allowed');
select pg_temp.expect_sqlstate('delete from public.workout_sets', '42501', 'anonymous workout-set delete was allowed');
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000001',
  true
);
do $$
begin
  if (select count(*) from public.exercises where user_id = '21000000-0000-0000-0000-000000000001') <> 2
     or (select count(*) from public.routines) <> 1
     or (select count(*) from public.routine_exercises) <> 1
     or (select count(*) from public.workouts) <> 0
     or (select count(*) from public.workout_exercises) <> 0
     or (select count(*) from public.workout_sets) <> 0
     or exists (select 1 from public.exercises where name = 'anonymous')
     or exists (select 1 from public.routines where name = 'anonymous') then
    raise exception 'anonymous workout writes changed owner A state';
  end if;
end
$$;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  if (select count(*) from public.exercises where user_id = '21000000-0000-0000-0000-000000000002') <> 1
     or (select count(*) from public.routines) <> 1
     or (select count(*) from public.routine_exercises) <> 1
     or (select count(*) from public.workouts) <> 1
     or (select count(*) from public.workout_exercises) <> 1
     or (select count(*) from public.workout_sets) <> 1
     or (select title from public.workouts where id = '27000000-0000-0000-0000-000000000002') <> 'B completed workout'
     or (select weight_kg from public.workout_sets where id = '29000000-0000-0000-0000-000000000002') <> 110 then
    raise exception 'anonymous workout writes changed owner B state';
  end if;
end
$$;

-- Finance: plans are owner-readable and owner-updatable; snapshots are
-- owner-readable and append-only. Cross-owner writes are followed by state
-- checks, and the unique constraints are asserted at the database seam.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000001',
  true
);

insert into public.finance_cushions (
  id, user_id, liquid_resources_cents, monthly_essential_expenses_cents,
  monthly_continuing_income_cents
)
values (
  '2a000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  120000,
  30000,
  5000
);

insert into public.finance_cushion_snapshots (
  id, plan_id, user_id, action_id, trigger, scenario, months_covered,
  sustainable, result, model_version
)
values (
  '2b000000-0000-0000-0000-000000000001',
  '2a000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '2c000000-0000-0000-0000-000000000001',
  'completed',
  'current',
  4,
  true,
  '{"months_covered":4}'::jsonb,
  '2.0.0'
);

do $$
declare
  affected_rows integer;
begin
  if (select count(*) from public.finance_cushions) <> 1
     or not exists (
       select 1 from public.finance_cushions
       where id = '2a000000-0000-0000-0000-000000000001'
         and liquid_resources_cents = 120000
     ) then
    raise exception 'finance owner A cannot read only own plan';
  end if;
  if (select count(*) from public.finance_cushion_snapshots) <> 1 then
    raise exception 'finance owner A cannot read own snapshot';
  end if;

  update public.finance_cushions
  set liquid_resources_cents = 125000
  where id = '2a000000-0000-0000-0000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 or not exists (
    select 1 from public.finance_cushions
    where id = '2a000000-0000-0000-0000-000000000001'
      and liquid_resources_cents = 125000
  ) then
    raise exception 'finance owner A update did not persist';
  end if;

  insert into public.finance_cushion_snapshots (
    plan_id, user_id, action_id, trigger, scenario, months_covered,
    sustainable, result, model_version
  ) values (
    '2a000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '2c000000-0000-0000-0000-000000000003',
    'updated',
    'current',
    5,
    true,
    '{"months_covered":5}'::jsonb,
    '2.0.0'
  );
  if (select count(*) from public.finance_cushion_snapshots) <> 2 then
    raise exception 'finance owner A cannot append own snapshot';
  end if;
end
$$;

select pg_temp.expect_sqlstate(
  $sql$insert into public.finance_cushions (user_id, liquid_resources_cents, monthly_essential_expenses_cents) values ('21000000-0000-0000-0000-000000000001', 1, 1)$sql$,
  '23505',
  'finance accepted a second plan for one owner'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.finance_cushion_snapshots (plan_id, user_id, action_id, trigger, scenario, sustainable, result, model_version) values ('2a000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000001', 'updated', 'duplicate', true, '{}'::jsonb, '2.0.0')$sql$,
  '23505',
  'finance accepted a duplicate snapshot action'
);
select pg_temp.expect_sqlstate(
  $sql$update public.finance_cushion_snapshots set scenario = 'tampered' where id = '2b000000-0000-0000-0000-000000000001'$sql$,
  '42501',
  'finance snapshot update privilege leaked'
);
select pg_temp.expect_sqlstate(
  $sql$delete from public.finance_cushion_snapshots where id = '2b000000-0000-0000-0000-000000000001'$sql$,
  '42501',
  'finance snapshot delete privilege leaked'
);

do $$
begin
  if exists (
    select 1 from public.finance_cushions
    where user_id = '21000000-0000-0000-0000-000000000002'
  ) or exists (
    select 1 from public.finance_cushion_snapshots
    where user_id = '21000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'finance owner A can read owner B data';
  end if;
end
$$;

select pg_temp.expect_no_rows(
  $sql$update public.finance_cushions set liquid_resources_cents = 999999 where user_id = '21000000-0000-0000-0000-000000000002'$sql$,
  'finance owner A updated owner B plan'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.finance_cushions (user_id, liquid_resources_cents, monthly_essential_expenses_cents) values ('21000000-0000-0000-0000-000000000002', 1, 1)$sql$,
  '42501',
  'finance owner A inserted owner B plan'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.finance_cushion_snapshots (plan_id, user_id, action_id, trigger, scenario, sustainable, result, model_version) values ('2a000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', '2c000000-0000-0000-0000-000000000010', 'updated', 'cross-owner', true, '{}'::jsonb, '2.0.0')$sql$,
  '42501',
  'finance owner A inserted owner B snapshot'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  if (select liquid_resources_cents from public.finance_cushions where user_id = '21000000-0000-0000-0000-000000000002') <> 60000
     or (select count(*) from public.finance_cushion_snapshots where user_id = '21000000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'finance denied writes changed owner B state';
  end if;
end
$$;

-- Owner B has the same positive access and still cannot cross into A.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000002',
  true
);
do $$
declare
  affected_rows integer;
begin
  if (select count(*) from public.finance_cushions) <> 1
     or (select count(*) from public.finance_cushion_snapshots) <> 1 then
    raise exception 'finance owner B cannot read own data';
  end if;
  update public.finance_cushions
  set liquid_resources_cents = 65000
  where user_id = '21000000-0000-0000-0000-000000000002';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'finance owner B cannot update own plan';
  end if;
  if exists (select 1 from public.finance_cushions where user_id = '21000000-0000-0000-0000-000000000001') then
    raise exception 'finance owner B can read owner A plan';
  end if;
end
$$;
select pg_temp.expect_no_rows(
  $sql$update public.finance_cushions set liquid_resources_cents = 999999 where user_id = '21000000-0000-0000-0000-000000000001'$sql$,
  'finance owner B updated owner A plan'
);
select pg_temp.expect_sqlstate(
  $sql$insert into public.finance_cushions (user_id, liquid_resources_cents, monthly_essential_expenses_cents) values ('21000000-0000-0000-0000-000000000001', 1, 1)$sql$,
  '42501',
  'finance owner B inserted owner A plan'
);

-- Anonymous has no direct access to the explicitly revoked finance tables.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_sqlstate('select * from public.finance_cushions', '42501', 'anonymous finance-plan read was allowed');
select pg_temp.expect_sqlstate('insert into public.finance_cushions (user_id, liquid_resources_cents, monthly_essential_expenses_cents) values (''21000000-0000-0000-0000-000000000001'', 1, 1)', '42501', 'anonymous finance-plan insert was allowed');
select pg_temp.expect_sqlstate('update public.finance_cushions set liquid_resources_cents = 1', '42501', 'anonymous finance-plan update was allowed');
select pg_temp.expect_sqlstate('delete from public.finance_cushions', '42501', 'anonymous finance-plan delete was allowed');
select pg_temp.expect_sqlstate('select * from public.finance_cushion_snapshots', '42501', 'anonymous finance-snapshot read was allowed');
select pg_temp.expect_sqlstate('insert into public.finance_cushion_snapshots (plan_id, user_id, action_id, trigger, scenario, sustainable, result, model_version) values (''2a000000-0000-0000-0000-000000000001'', ''21000000-0000-0000-0000-000000000001'', ''2c000000-0000-0000-0000-000000000011'', ''updated'', ''anonymous'', true, ''{}'', ''2.0.0'')', '42501', 'anonymous finance-snapshot insert was allowed');
select pg_temp.expect_sqlstate('update public.finance_cushion_snapshots set scenario = ''anonymous''', '42501', 'anonymous finance-snapshot update was allowed');
select pg_temp.expect_sqlstate('delete from public.finance_cushion_snapshots', '42501', 'anonymous finance-snapshot delete was allowed');
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000001',
  true
);
do $$
begin
  if (select liquid_resources_cents from public.finance_cushions) <> 125000
     or (select count(*) from public.finance_cushion_snapshots) <> 2
     or exists (select 1 from public.finance_cushion_snapshots where scenario = 'anonymous') then
    raise exception 'anonymous finance writes changed owner A state';
  end if;
end
$$;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  if (select liquid_resources_cents from public.finance_cushions) <> 65000
     or (select count(*) from public.finance_cushion_snapshots) <> 1
     or exists (select 1 from public.finance_cushion_snapshots where scenario = 'anonymous') then
    raise exception 'anonymous finance writes changed owner B state';
  end if;
end
$$;

rollback;
