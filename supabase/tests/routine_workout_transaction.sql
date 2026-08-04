-- Run after `supabase db reset --local` against the local instance.
-- constrained-sql-fixture: true
-- The transaction rolls back all synthetic identities and workout data.
begin;

select public.sql_fixture_create_auth_user(
  '48500000-0000-4000-8000-000000000001',
  'routine-workout@example.test'
);

select set_config(
  'request.jwt.claim.sub',
  '48500000-0000-4000-8000-000000000001',
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
    '48500000-0000-4000-8000-000000000002',
    '48500000-0000-4000-8000-000000000001',
    'Transaction bench press',
    'chest',
    'barbell',
    'weight_reps',
    true
  ),
  (
    '48500000-0000-4000-8000-000000000003',
    '48500000-0000-4000-8000-000000000001',
    'Transaction plank',
    'core',
    'none',
    'distance_duration',
    true
  );

insert into public.routines (
  id,
  user_id,
  name
)
values (
  '48500000-0000-4000-8000-000000000004',
  '48500000-0000-4000-8000-000000000001',
  'Transaction routine'
);

set local role authenticated;

-- The production RPC returns the complete nested mapping in source order.
do $$
declare
  outcome jsonb;
begin
  outcome := public.start_workout_from_routine(
    '48500000-0000-4000-8000-000000000001',
    '{
      "title": "Successful transaction workout",
      "routine_id": "48500000-0000-4000-8000-000000000004"
    }'::jsonb,
    '[
      {
        "exercise": {
          "exercise_id": "48500000-0000-4000-8000-000000000002",
          "sort_order": 10,
          "notes": "Pause at the bottom",
          "rest_timer_seconds": 120
        },
        "sets": [
          {
            "set_number": 1,
            "set_type": "normal",
            "weight_kg": 80,
            "reps": 8,
            "duration_seconds": null,
            "distance_meters": null,
            "is_completed": false,
            "rpe": null
          },
          {
            "set_number": 2,
            "set_type": "normal",
            "weight_kg": 80,
            "reps": 8,
            "duration_seconds": null,
            "distance_meters": null,
            "is_completed": false,
            "rpe": null
          }
        ]
      },
      {
        "exercise": {
          "exercise_id": "48500000-0000-4000-8000-000000000003",
          "sort_order": 10,
          "notes": "Hold steady",
          "rest_timer_seconds": 45
        },
        "sets": [
          {
            "set_number": 1,
            "set_type": "normal",
            "weight_kg": null,
            "reps": null,
            "duration_seconds": 60,
            "distance_meters": null,
            "is_completed": false,
            "rpe": null
          }
        ]
      }
    ]'::jsonb
  );

  if outcome->>'title' <> 'Successful transaction workout'
    or outcome->>'routine_id' <> '48500000-0000-4000-8000-000000000004'
    or jsonb_array_length(outcome->'exercises') <> 2
    or outcome->'exercises'->0->>'exercise_id'
      <> '48500000-0000-4000-8000-000000000002'
    or (outcome->'exercises'->0->>'sort_order')::double precision <> 10
    or outcome->'exercises'->0->>'notes' <> 'Pause at the bottom'
    or (outcome->'exercises'->0->>'rest_timer_seconds')::integer <> 120
    or jsonb_array_length(outcome->'exercises'->0->'sets') <> 2
    or (outcome->'exercises'->0->'sets'->0->>'set_number')::integer <> 1
    or (outcome->'exercises'->0->'sets'->0->>'weight_kg')::numeric <> 80
    or (outcome->'exercises'->0->'sets'->0->>'reps')::integer <> 8
    or (outcome->'exercises'->0->'sets'->1->>'set_number')::integer <> 2
    or outcome->'exercises'->1->>'exercise_id'
      <> '48500000-0000-4000-8000-000000000003'
    or (outcome->'exercises'->1->>'sort_order')::double precision <> 10
    or jsonb_array_length(outcome->'exercises'->1->'sets') <> 1
    or (outcome->'exercises'->1->'sets'->0->>'duration_seconds')::integer <> 60
  then
    raise exception 'successful routine conversion was incorrect: %', outcome;
  end if;
end
$$;

-- A second start for the same user is an expected active-session conflict;
-- the unique partial index rejects only this new insert and leaves the first
-- session intact until the fixture removes it below.
do $$
begin
  perform public.start_workout_from_routine(
    '48500000-0000-4000-8000-000000000001',
    '{
      "title": "Conflicting transaction workout",
      "routine_id": "48500000-0000-4000-8000-000000000004"
    }'::jsonb,
    '[]'::jsonb
  );
  raise exception 'active workout conflict unexpectedly succeeded';
exception
  when unique_violation then null;
end
$$;

reset role;

delete from public.workouts
where user_id = '48500000-0000-4000-8000-000000000001';

set local role authenticated;

-- The invalid set type fails only after the workout, both workout exercises,
-- and the first exercise's set have been inserted by the function.
do $$
begin
  perform public.start_workout_from_routine(
    '48500000-0000-4000-8000-000000000001',
    '{
      "title": "Atomic transaction workout",
      "routine_id": "48500000-0000-4000-8000-000000000004"
    }'::jsonb,
    '[
      {
        "exercise": {
          "exercise_id": "48500000-0000-4000-8000-000000000002",
          "sort_order": 10,
          "notes": null,
          "rest_timer_seconds": 90
        },
        "sets": [{
          "set_number": 1,
          "set_type": "normal",
          "weight_kg": 80,
          "reps": 8,
          "duration_seconds": null,
          "distance_meters": null,
          "is_completed": false,
          "rpe": null
        }]
      },
      {
        "exercise": {
          "exercise_id": "48500000-0000-4000-8000-000000000003",
          "sort_order": 20,
          "notes": null,
          "rest_timer_seconds": 45
        },
        "sets": [{
          "set_number": 1,
          "set_type": "unsupported",
          "weight_kg": null,
          "reps": null,
          "duration_seconds": 60,
          "distance_meters": null,
          "is_completed": false,
          "rpe": null
        }]
      }
    ]'::jsonb
  );
  raise exception 'routine conversion unexpectedly succeeded';
exception
  when check_violation then null;
end
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.workouts
    where user_id = '48500000-0000-4000-8000-000000000001'
  ) then
    raise exception 'workout remained after set creation failed';
  end if;

  if exists (
    select 1
    from public.workout_exercises as workout_exercise
    join public.workouts as workout
      on workout.id = workout_exercise.workout_id
    where workout.user_id = '48500000-0000-4000-8000-000000000001'
  ) then
    raise exception 'workout exercise remained after set creation failed';
  end if;

  if exists (
    select 1
    from public.workout_sets as workout_set
    join public.workout_exercises as workout_exercise
      on workout_exercise.id = workout_set.workout_exercise_id
    join public.workouts as workout
      on workout.id = workout_exercise.workout_id
    where workout.user_id = '48500000-0000-4000-8000-000000000001'
  ) then
    raise exception 'workout set remained after set creation failed';
  end if;
end
$$;

set local role authenticated;

-- Saving the inverse conversion returns one complete nested routine in source
-- order from the same transactional boundary.
do $$
declare
  outcome jsonb;
begin
  outcome := public.save_workout_as_routine(
    '48500000-0000-4000-8000-000000000001',
    '{"name": "Saved transaction routine", "notes": "Reusable"}'::jsonb,
    '[
      {
        "exercise_id": "48500000-0000-4000-8000-000000000002",
        "sort_order": 10,
        "target_sets": 2,
        "target_reps": 5,
        "target_weight_kg": 85,
        "target_duration_seconds": null,
        "target_distance_meters": null,
        "rest_timer_seconds": 120,
        "notes": "Pause at the bottom"
      },
      {
        "exercise_id": "48500000-0000-4000-8000-000000000003",
        "sort_order": 20,
        "target_sets": 2,
        "target_reps": null,
        "target_weight_kg": null,
        "target_duration_seconds": 60,
        "target_distance_meters": 100,
        "rest_timer_seconds": 45,
        "notes": null
      }
    ]'::jsonb
  );

  if outcome->>'name' <> 'Saved transaction routine'
    or outcome->>'notes' <> 'Reusable'
    or jsonb_array_length(outcome->'exercises') <> 2
    or outcome->'exercises'->0->>'exercise_id'
      <> '48500000-0000-4000-8000-000000000002'
    or (outcome->'exercises'->0->>'sort_order')::double precision <> 10
    or (outcome->'exercises'->0->>'target_sets')::integer <> 2
    or (outcome->'exercises'->0->>'target_reps')::integer <> 5
    or (outcome->'exercises'->0->>'target_weight_kg')::numeric <> 85
    or outcome->'exercises'->0->'exercise'->>'name'
      <> 'Transaction bench press'
    or outcome->'exercises'->1->>'exercise_id'
      <> '48500000-0000-4000-8000-000000000003'
    or (outcome->'exercises'->1->>'target_duration_seconds')::integer <> 60
    or (outcome->'exercises'->1->>'target_distance_meters')::numeric <> 100
  then
    raise exception 'successful workout conversion was incorrect: %', outcome;
  end if;
end
$$;

-- A late exercise-reference failure rolls back the routine and its first
-- exercise. Depending on policy ordering, PostgreSQL can reject the missing
-- reference at the RLS check or foreign-key seam.
do $$
begin
  perform public.save_workout_as_routine(
    '48500000-0000-4000-8000-000000000001',
    '{"name": "Atomic saved routine", "notes": null}'::jsonb,
    '[
      {
        "exercise_id": "48500000-0000-4000-8000-000000000002",
        "sort_order": 10,
        "target_sets": 2,
        "target_reps": 8,
        "target_weight_kg": 80,
        "target_duration_seconds": null,
        "target_distance_meters": null,
        "rest_timer_seconds": 90,
        "notes": null
      },
      {
        "exercise_id": "48500000-0000-4000-8000-000000000099",
        "sort_order": 20,
        "target_sets": 1,
        "target_reps": null,
        "target_weight_kg": null,
        "target_duration_seconds": 60,
        "target_distance_meters": 100,
        "rest_timer_seconds": 45,
        "notes": null
      }
    ]'::jsonb
  );
  raise exception 'workout conversion unexpectedly succeeded';
exception
  when foreign_key_violation then null;
  when insufficient_privilege then null;
end
$$;

reset role;

do $$
begin
  if exists (
    select 1 from public.routines
    where name = 'Atomic saved routine'
  ) then
    raise exception 'routine remained after exercise creation failed';
  end if;

  if exists (
    select 1
    from public.routine_exercises as routine_exercise
    join public.routines as routine on routine.id = routine_exercise.routine_id
    where routine.name = 'Atomic saved routine'
  ) then
    raise exception 'routine exercise remained after conversion failed';
  end if;
end
$$;

rollback;
