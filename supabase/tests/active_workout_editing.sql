-- Run after `supabase db reset --local` against the local instance.
-- ralph-ci: true
-- The fixture covers the public mutation boundary, including real row-lock
-- serialization for exercise ordering and set numbering.

-- Remove residue from an interrupted concurrency run before creating the
-- disposable identities again.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '64600000-0000-0000-0000-000000000001',
  false
);
delete from public.workouts
where user_id = '64600000-0000-0000-0000-000000000001';
select set_config(
  'request.jwt.claim.sub',
  '64600000-0000-0000-0000-000000000002',
  false
);
delete from public.workouts
where user_id = '64600000-0000-0000-0000-000000000002';
reset role;

do $$
begin
  begin
    perform public.ralph_ci_delete_auth_user(
      '64600000-0000-0000-0000-000000000001'
    );
  exception when others then null;
  end;
  begin
    perform public.ralph_ci_delete_auth_user(
      '64600000-0000-0000-0000-000000000002'
    );
  exception when others then null;
  end;
end
$$;

begin;

select public.ralph_ci_create_auth_user(
  '64600000-0000-0000-0000-000000000001',
  'active-workout-editing@example.test'
);
select public.ralph_ci_create_auth_user(
  '64600000-0000-0000-0000-000000000002',
  'other-active-workout-editing@example.test'
);

select set_config(
  'request.jwt.claim.sub',
  '64600000-0000-0000-0000-000000000001',
  true
);

insert into public.exercises (
  id,
  user_id,
  name,
  muscle_group_primary,
  equipment,
  exercise_type,
  is_custom
)
values
  (
    '64600000-0000-0000-0000-000000000101',
    '64600000-0000-0000-0000-000000000001',
    'Active edit bench press',
    'chest',
    'barbell',
    'weight_reps',
    true
  ),
  (
    '64600000-0000-0000-0000-000000000102',
    '64600000-0000-0000-0000-000000000001',
    'Active edit squat',
    'quadriceps',
    'barbell',
    'weight_reps',
    true
  ),
  (
    '64600000-0000-0000-0000-000000000103',
    '64600000-0000-0000-0000-000000000001',
    'Active edit row',
    'back',
    'barbell',
    'weight_reps',
    true
  ),
  (
    '64600000-0000-0000-0000-000000000104',
    '64600000-0000-0000-0000-000000000001',
    'Active edit press',
    'shoulders',
    'barbell',
    'weight_reps',
    true
  );

insert into public.workouts (id, user_id, title, status, notes)
values
  (
    '64600000-0000-0000-0000-000000000401',
    '64600000-0000-0000-0000-000000000001',
    'Active edit workout',
    'in_progress',
    null
  ),
  (
    '64600000-0000-0000-0000-000000000403',
    '64600000-0000-0000-0000-000000000001',
    'Terminal edit workout',
    'completed',
    null
  );

insert into public.workout_exercises (
  id,
  workout_id,
  exercise_id,
  sort_order,
  notes,
  rest_timer_seconds
)
values
  (
    '64600000-0000-0000-0000-000000000501',
    '64600000-0000-0000-0000-000000000401',
    '64600000-0000-0000-0000-000000000101',
    65536,
    null,
    90
  ),
  (
    '64600000-0000-0000-0000-000000000503',
    '64600000-0000-0000-0000-000000000403',
    '64600000-0000-0000-0000-000000000101',
    65536,
    null,
    90
  );

insert into public.workout_sets (
  id,
  workout_exercise_id,
  set_number,
  set_type,
  weight_kg,
  reps,
  is_completed,
  rpe
)
values
  (
    '64600000-0000-0000-0000-000000000601',
    '64600000-0000-0000-0000-000000000501',
    1,
    'normal',
    80,
    8,
    false,
    null
  ),
  (
    '64600000-0000-0000-0000-000000000603',
    '64600000-0000-0000-0000-000000000503',
    1,
    'normal',
    40,
    8,
    false,
    null
  );

select set_config(
  'request.jwt.claim.sub',
  '64600000-0000-0000-0000-000000000002',
  true
);

insert into public.exercises (
  id,
  user_id,
  name,
  muscle_group_primary,
  equipment,
  exercise_type,
  is_custom
)
values (
  '64600000-0000-0000-0000-000000000201',
  '64600000-0000-0000-0000-000000000002',
  'Other user exercise',
  'chest',
  'barbell',
  'weight_reps',
  true
);

insert into public.workouts (id, user_id, title, status, notes)
values (
  '64600000-0000-0000-0000-000000000402',
  '64600000-0000-0000-0000-000000000002',
  'Other user workout',
  'in_progress',
  null
);

insert into public.workout_exercises (
  id,
  workout_id,
  exercise_id,
  sort_order,
  notes,
  rest_timer_seconds
)
values (
  '64600000-0000-0000-0000-000000000502',
  '64600000-0000-0000-0000-000000000402',
  '64600000-0000-0000-0000-000000000201',
  65536,
  null,
  90
);

insert into public.workout_sets (
  id,
  workout_exercise_id,
  set_number,
  set_type,
  weight_kg,
  reps,
  is_completed,
  rpe
)
values (
  '64600000-0000-0000-0000-000000000602',
  '64600000-0000-0000-0000-000000000502',
  1,
  'normal',
  60,
  8,
  false,
  null
);

select set_config(
  'request.jwt.claim.sub',
  '64600000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;

do $$
declare
  outcome jsonb;
  added_exercise_id uuid;
  added_set_id uuid;
begin
  outcome := public.update_active_workout(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    '{"title":"Edited active workout","notes":"Keep moving"}'::jsonb
  );
  if outcome->>'type' <> 'updated'
    or outcome->'workout'->>'title' <> 'Edited active workout'
    or outcome->'workout'->>'notes' <> 'Keep moving' then
    raise exception 'detail update returned unexpected outcome: %', outcome;
  end if;

  outcome := public.update_active_workout_exercise(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    '64600000-0000-0000-0000-000000000501',
    '{"notes":"Pause","rest_timer_seconds":120}'::jsonb
  );
  if outcome->>'type' <> 'updated'
    or outcome->'exercise'->>'notes' <> 'Pause'
    or (outcome->'exercise'->>'rest_timer_seconds')::integer <> 120 then
    raise exception 'exercise update returned unexpected outcome: %', outcome;
  end if;

  outcome := public.add_active_workout_exercise(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    '64600000-0000-0000-0000-000000000102',
    45
  );
  if outcome->>'type' <> 'added'
    or (outcome->'exercise'->>'sort_order')::double precision <> 131072
    or (outcome->'exercise'->>'rest_timer_seconds')::integer <> 45 then
    raise exception 'exercise add returned unexpected outcome: %', outcome;
  end if;
  added_exercise_id := (outcome->'exercise'->>'id')::uuid;

  outcome := public.add_active_workout_set(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    added_exercise_id,
    '{"set_type":"warmup","weight_kg":20,"reps":12,"rpe":6}'::jsonb
  );
  if outcome->>'type' <> 'added'
    or (outcome->'set'->>'set_number')::integer <> 1
    or outcome->'set'->>'set_type' <> 'warmup' then
    raise exception 'set add returned unexpected outcome: %', outcome;
  end if;
  added_set_id := (outcome->'set'->>'id')::uuid;

  outcome := public.update_active_workout_set(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    added_exercise_id,
    added_set_id,
    '{"weight_kg":25,"is_completed":true,"rpe":7}'::jsonb
  );
  if outcome->>'type' <> 'updated'
    or (outcome->'set'->>'weight_kg')::numeric <> 25
    or (outcome->'set'->>'is_completed')::boolean is distinct from true
    or (outcome->'set'->>'rpe')::integer <> 7 then
    raise exception 'set update returned unexpected outcome: %', outcome;
  end if;

  outcome := public.remove_active_workout_set(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    added_exercise_id,
    added_set_id
  );
  if outcome <> '{"type":"removed"}'::jsonb then
    raise exception 'set removal returned unexpected outcome: %', outcome;
  end if;

  outcome := public.remove_active_workout_exercise(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    added_exercise_id
  );
  if outcome <> '{"type":"removed"}'::jsonb then
    raise exception 'exercise removal returned unexpected outcome: %', outcome;
  end if;
end
$$;

-- Missing and cross-owner targets return the same masked outcome.
do $$
declare
  missing_workout jsonb;
  cross_owner_workout jsonb;
  missing_exercise jsonb;
  cross_owner_exercise jsonb;
  missing_set jsonb;
  cross_owner_set jsonb;
  cross_owner_exercise_add jsonb;
begin
  missing_workout := public.update_active_workout(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000099',
    '{"title":"hidden"}'::jsonb
  );
  cross_owner_workout := public.update_active_workout(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000402',
    '{"title":"hidden"}'::jsonb
  );
  missing_exercise := public.update_active_workout_exercise(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    '64600000-0000-0000-0000-000000000099',
    '{"notes":"hidden"}'::jsonb
  );
  cross_owner_exercise := public.update_active_workout_exercise(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    '64600000-0000-0000-0000-000000000502',
    '{"notes":"hidden"}'::jsonb
  );
  missing_set := public.update_active_workout_set(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    '64600000-0000-0000-0000-000000000501',
    '64600000-0000-0000-0000-000000000099',
    '{"reps":1}'::jsonb
  );
  cross_owner_set := public.update_active_workout_set(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    '64600000-0000-0000-0000-000000000501',
    '64600000-0000-0000-0000-000000000602',
    '{"reps":1}'::jsonb
  );
  cross_owner_exercise_add := public.add_active_workout_exercise(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000401',
    '64600000-0000-0000-0000-000000000201',
    90
  );

  if missing_workout <> '{"type":"not-found"}'::jsonb
    or cross_owner_workout <> missing_workout
    or missing_exercise <> '{"type":"not-found"}'::jsonb
    or cross_owner_exercise <> missing_exercise
    or missing_set <> '{"type":"not-found"}'::jsonb
    or cross_owner_set <> missing_set
    or cross_owner_exercise_add <> missing_exercise then
    raise exception
      'missing and cross-owner edits were not masked consistently: %, %, %, %, %, %, %',
      missing_workout,
      cross_owner_workout,
      missing_exercise,
      cross_owner_exercise,
      missing_set,
      cross_owner_set,
      cross_owner_exercise_add;
  end if;
end
$$;

-- Every edit operation rejects a terminal workout with a typed outcome.
do $$
declare
  outcome jsonb;
begin
  outcome := public.update_active_workout(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000403',
    '{"title":"blocked"}'::jsonb
  );
  if outcome->>'type' <> 'invalid-transition'
    or outcome->>'current_status' <> 'completed' then
    raise exception 'terminal detail edit was not rejected: %', outcome;
  end if;

  outcome := public.add_active_workout_exercise(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000403',
    '64600000-0000-0000-0000-000000000102',
    90
  );
  if outcome->>'type' <> 'invalid-transition' then
    raise exception 'terminal exercise add was not rejected: %', outcome;
  end if;

  outcome := public.update_active_workout_exercise(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000403',
    '64600000-0000-0000-0000-000000000503',
    '{"notes":"blocked"}'::jsonb
  );
  if outcome->>'type' <> 'invalid-transition' then
    raise exception 'terminal exercise update was not rejected: %', outcome;
  end if;

  outcome := public.remove_active_workout_exercise(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000403',
    '64600000-0000-0000-0000-000000000503'
  );
  if outcome->>'type' <> 'invalid-transition' then
    raise exception 'terminal exercise removal was not rejected: %', outcome;
  end if;

  outcome := public.add_active_workout_set(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000403',
    '64600000-0000-0000-0000-000000000503',
    '{"reps":1}'::jsonb
  );
  if outcome->>'type' <> 'invalid-transition' then
    raise exception 'terminal set add was not rejected: %', outcome;
  end if;

  outcome := public.update_active_workout_set(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000403',
    '64600000-0000-0000-0000-000000000503',
    '64600000-0000-0000-0000-000000000603',
    '{"reps":1}'::jsonb
  );
  if outcome->>'type' <> 'invalid-transition' then
    raise exception 'terminal set update was not rejected: %', outcome;
  end if;

  outcome := public.remove_active_workout_set(
    '64600000-0000-0000-0000-000000000001',
    '64600000-0000-0000-0000-000000000403',
    '64600000-0000-0000-0000-000000000503',
    '64600000-0000-0000-0000-000000000603'
  );
  if outcome->>'type' <> 'invalid-transition' then
    raise exception 'terminal set removal was not rejected: %', outcome;
  end if;
end
$$;

-- Two real database sessions race on exercise insertion. The workout row lock
-- makes MAX(sort_order) + 65536 produce two distinct positions.
reset role;
commit;
begin;
select set_config(
  'request.jwt.claim.sub',
  '64600000-0000-0000-0000-000000000001',
  false
);
select public.ralph_ci_open_connection('active-workout-exercise-a');
select public.ralph_ci_open_connection('active-workout-exercise-b');
select pg_advisory_lock(64664601);
select extensions.dblink_send_query(
  'active-workout-exercise-a',
  $query$
    with request_context as materialized (
      select set_config('request.jwt.claim.sub', '64600000-0000-0000-0000-000000000001', false),
             set_config('request.jwt.claims', '{"sub":"64600000-0000-0000-0000-000000000001"}', false)
    ),
    gate as materialized (
      select pg_advisory_xact_lock(64664601) from request_context
    )
    select public.add_active_workout_exercise(
      '64600000-0000-0000-0000-000000000001',
      '64600000-0000-0000-0000-000000000401',
      '64600000-0000-0000-0000-000000000103',
      90
    ) outcome
    from gate
  $query$
);
select extensions.dblink_send_query(
  'active-workout-exercise-b',
  $query$
    with request_context as materialized (
      select set_config('request.jwt.claim.sub', '64600000-0000-0000-0000-000000000001', false),
             set_config('request.jwt.claims', '{"sub":"64600000-0000-0000-0000-000000000001"}', false)
    ),
    gate as materialized (
      select pg_advisory_xact_lock(64664601) from request_context
    )
    select public.add_active_workout_exercise(
      '64600000-0000-0000-0000-000000000001',
      '64600000-0000-0000-0000-000000000401',
      '64600000-0000-0000-0000-000000000104',
      90
    ) outcome
    from gate
  $query$
);
select pg_sleep(0.1);
select pg_advisory_unlock(64664601);

create temporary table exercise_race_outcomes (outcome jsonb);
insert into exercise_race_outcomes
select outcome
from extensions.dblink_get_result('active-workout-exercise-a')
  as result(outcome jsonb);
insert into exercise_race_outcomes
select outcome
from extensions.dblink_get_result('active-workout-exercise-b')
  as result(outcome jsonb);
select * from extensions.dblink_get_result('active-workout-exercise-a')
  as exhausted(outcome jsonb);
select * from extensions.dblink_get_result('active-workout-exercise-b')
  as exhausted(outcome jsonb);
select extensions.dblink_disconnect('active-workout-exercise-a');
select extensions.dblink_disconnect('active-workout-exercise-b');

do $$
declare
  actual_orders double precision[];
begin
  select array_agg(sort_order order by sort_order)
  into actual_orders
  from public.workout_exercises
  where workout_id = '64600000-0000-0000-0000-000000000401'
    and exercise_id in (
      '64600000-0000-0000-0000-000000000103',
      '64600000-0000-0000-0000-000000000104'
    );

  if (select count(*) from exercise_race_outcomes where outcome->>'type' = 'added') <> 2
    or (select count(distinct sort_order)
        from public.workout_exercises
        where workout_id = '64600000-0000-0000-0000-000000000401'
          and exercise_id in (
            '64600000-0000-0000-0000-000000000103',
            '64600000-0000-0000-0000-000000000104'
          )) <> 2
    or actual_orders <> array[131072.0, 196608.0]::double precision[] then
    raise exception 'concurrent exercise ordering was not serialized: outcomes %, orders %',
      (select jsonb_agg(outcome) from exercise_race_outcomes),
      actual_orders;
  end if;
end
$$;

-- The same two-session race covers set numbering under one exercise lock.
reset role;
select public.ralph_ci_open_connection('active-workout-set-a');
select public.ralph_ci_open_connection('active-workout-set-b');
select pg_advisory_lock(64664602);
select extensions.dblink_send_query(
  'active-workout-set-a',
  $query$
    with request_context as materialized (
      select set_config('request.jwt.claim.sub', '64600000-0000-0000-0000-000000000001', false),
             set_config('request.jwt.claims', '{"sub":"64600000-0000-0000-0000-000000000001"}', false)
    ),
    gate as materialized (
      select pg_advisory_xact_lock(64664602) from request_context
    )
    select public.add_active_workout_set(
      '64600000-0000-0000-0000-000000000001',
      '64600000-0000-0000-0000-000000000401',
      '64600000-0000-0000-0000-000000000501',
      '{"reps":9}'::jsonb
    ) outcome
    from gate
  $query$
);
select extensions.dblink_send_query(
  'active-workout-set-b',
  $query$
    with request_context as materialized (
      select set_config('request.jwt.claim.sub', '64600000-0000-0000-0000-000000000001', false),
             set_config('request.jwt.claims', '{"sub":"64600000-0000-0000-0000-000000000001"}', false)
    ),
    gate as materialized (
      select pg_advisory_xact_lock(64664602) from request_context
    )
    select public.add_active_workout_set(
      '64600000-0000-0000-0000-000000000001',
      '64600000-0000-0000-0000-000000000401',
      '64600000-0000-0000-0000-000000000501',
      '{"reps":10}'::jsonb
    ) outcome
    from gate
  $query$
);
select pg_sleep(0.1);
select pg_advisory_unlock(64664602);

create temporary table set_race_outcomes (outcome jsonb);
insert into set_race_outcomes
select outcome
from extensions.dblink_get_result('active-workout-set-a')
  as result(outcome jsonb);
insert into set_race_outcomes
select outcome
from extensions.dblink_get_result('active-workout-set-b')
  as result(outcome jsonb);
select * from extensions.dblink_get_result('active-workout-set-a')
  as exhausted(outcome jsonb);
select * from extensions.dblink_get_result('active-workout-set-b')
  as exhausted(outcome jsonb);
select extensions.dblink_disconnect('active-workout-set-a');
select extensions.dblink_disconnect('active-workout-set-b');

do $$
begin
  if (select count(*) from set_race_outcomes where outcome->>'type' = 'added') <> 2
    or (select array_agg(set_number order by set_number)
        from public.workout_sets
        where workout_exercise_id = '64600000-0000-0000-0000-000000000501'
          and id not in ('64600000-0000-0000-0000-000000000601'))
       <> array[2, 3]::integer[] then
    raise exception 'concurrent set numbering was not serialized';
  end if;
end
$$;

reset role;
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '64600000-0000-0000-0000-000000000001',
  false
);
delete from public.workouts
where user_id = '64600000-0000-0000-0000-000000000001';
select set_config(
  'request.jwt.claim.sub',
  '64600000-0000-0000-0000-000000000002',
  false
);
delete from public.workouts
where user_id = '64600000-0000-0000-0000-000000000002';
reset role;
select public.ralph_ci_delete_auth_user(
  '64600000-0000-0000-0000-000000000001'
);
select public.ralph_ci_delete_auth_user(
  '64600000-0000-0000-0000-000000000002'
);
commit;
