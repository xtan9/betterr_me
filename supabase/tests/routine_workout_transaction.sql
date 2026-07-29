-- Run after `supabase db reset --local` against the local instance.
-- The transaction rolls back all synthetic identities and workout data.
begin;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '48500000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'routine-workout@example.test',
  crypt('not-used', gen_salt('bf')),
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.exercises (
  id,
  name,
  muscle_group_primary,
  equipment,
  exercise_type
)
values
  (
    '48500000-0000-4000-8000-000000000002',
    'Transaction bench press',
    'chest',
    'barbell',
    'weight_reps'
  ),
  (
    '48500000-0000-4000-8000-000000000003',
    'Transaction plank',
    'core',
    'none',
    'duration'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '48500000-0000-4000-8000-000000000001',
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
          "exercise_id": "48500000-0000-4000-8000-000000000003",
          "sort_order": 20,
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
      },
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
    or (outcome->'exercises'->1->>'sort_order')::double precision <> 20
    or jsonb_array_length(outcome->'exercises'->1->'sets') <> 1
    or (outcome->'exercises'->1->'sets'->0->>'duration_seconds')::integer <> 60
  then
    raise exception 'successful routine conversion was incorrect: %', outcome;
  end if;
end
$$;

delete from public.workouts
where user_id = '48500000-0000-4000-8000-000000000001';

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

rollback;
