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
  is_custom,
  measurement_convention
)
values
  (
    '48500000-0000-4000-8000-000000000002',
    '48500000-0000-4000-8000-000000000001',
    'Transaction bench press',
    'chest',
    'barbell',
    'weight_reps',
    true,
    'barbell-total'
  ),
  (
    '48500000-0000-4000-8000-000000000003',
    '48500000-0000-4000-8000-000000000001',
    'Transaction plank',
    'core',
    'none',
    'distance_duration',
    true,
    null
  );

set local role authenticated;
-- Before C the invoker consumes a reviewed legacy conversion. After C the
-- actual command creates authoritative per-set content; supplied Start arrays
-- cannot override that source. Both rollout states retain transaction coverage.
do $$ begin
  if (public.train_template_capabilities()->'templates'->>'ready')::boolean then
    if public.execute_train_template_command('{"protocolVersion":1,"operationId":"48500000-0000-4000-8000-000000000004","command":{"kind":"create","name":"Authoritative transaction routine","notes":null,"entries":[{"id":"48500000-0000-4000-8000-000000000020","exerciseId":"48500000-0000-4000-8000-000000000002","notes":"Pause at the bottom","restSeconds":120,"targets":[{"id":"48500000-0000-4000-8000-000000000021","kind":"working","measurements":{"weightKg":80,"reps":8,"durationSeconds":null,"distanceMeters":null}},{"id":"48500000-0000-4000-8000-000000000022","kind":"working","measurements":{"weightKg":80,"reps":8,"durationSeconds":null,"distanceMeters":null}}]},{"id":"48500000-0000-4000-8000-000000000030","exerciseId":"48500000-0000-4000-8000-000000000003","notes":"Hold steady","restSeconds":45,"targets":[{"id":"48500000-0000-4000-8000-000000000031","kind":"working","measurements":{"weightKg":null,"reps":null,"durationSeconds":60,"distanceMeters":null}}]}]}}'::jsonb)->>'status' is distinct from 'accepted' then
      raise exception 'Current template setup failed';
    end if;
  else
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
  end if;
end $$;

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

  if outcome->>'title' <> (case when (public.train_template_capabilities()->'templates'->>'ready')::boolean then 'Authoritative transaction routine' else 'Successful transaction workout' end)
    or outcome->>'routine_id' <> '48500000-0000-4000-8000-000000000004'
    or jsonb_array_length(outcome->'exercises') <> 2
    or outcome->'exercises'->0->>'exercise_id'
      <> '48500000-0000-4000-8000-000000000002'
    or (outcome->'exercises'->0->>'sort_order')::double precision <> (case when (public.train_template_capabilities()->'templates'->>'ready')::boolean then 0 else 10 end)
    or outcome->'exercises'->0->>'notes' <> 'Pause at the bottom'
    or (outcome->'exercises'->0->>'rest_timer_seconds')::integer <> 120
    or jsonb_array_length(outcome->'exercises'->0->'sets') <> 2
    or (outcome->'exercises'->0->'sets'->0->>'set_number')::integer <> 1
    or (outcome->'exercises'->0->'sets'->0->>'weight_kg')::numeric <> 80
    or (outcome->'exercises'->0->'sets'->0->>'reps')::integer <> 8
    or (outcome->'exercises'->0->'sets'->1->>'set_number')::integer <> 2
    or outcome->'exercises'->1->>'exercise_id'
      <> '48500000-0000-4000-8000-000000000003'
    or (outcome->'exercises'->1->>'sort_order')::double precision <> (case when (public.train_template_capabilities()->'templates'->>'ready')::boolean then 1 else 10 end)
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

-- Model an already-stored unsafe second entry without granting ordinary
-- callers content DML. Start must roll back its parent and first child.
update public.routine_exercises set notes=repeat('x',2001)
where id='48500000-0000-4000-8000-000000000030';

set local role authenticated;

-- The invalid set type fails only after the workout, both workout exercises,
-- and the first exercise's set have been inserted by the function.
do $$
begin
  if (public.train_template_capabilities()->'templates'->>'ready')::boolean then
    if public.start_train_template_workout('48500000-0000-4000-8000-000000000001','48500000-0000-4000-8000-000000000004')->>'status' is distinct from 'invalid_source' then
      raise exception 'Unsafe authoritative source unexpectedly started';
    end if;
    return;
  end if;
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
  if (public.train_template_capabilities()->'templates'->>'ready')::boolean then
    begin
      perform public.save_workout_as_routine('48500000-0000-4000-8000-000000000001','{"name":"Unkeyed old save"}','[]');
      raise exception 'C allowed the legacy content-write bypass';
    exception when insufficient_privilege then null; end;
    insert into public.workouts(id,user_id,title,status) values('48500000-0000-4000-8000-000000000050',auth.uid(),'Saved source','discarded');
    insert into public.workout_exercises(id,workout_id,exercise_id,sort_order,notes,rest_timer_seconds) values
      ('48500000-0000-4000-8000-000000000051','48500000-0000-4000-8000-000000000050','48500000-0000-4000-8000-000000000002',10,'Pause at the bottom',120),
      ('48500000-0000-4000-8000-000000000052','48500000-0000-4000-8000-000000000050','48500000-0000-4000-8000-000000000003',20,null,45);
    insert into public.workout_sets(workout_exercise_id,set_number,set_type,weight_kg,reps,duration_seconds,distance_meters,is_completed) values
      ('48500000-0000-4000-8000-000000000051',1,'normal',85,5,null,null,false),
      ('48500000-0000-4000-8000-000000000051',2,'normal',85,5,null,null,false),
      ('48500000-0000-4000-8000-000000000052',1,'normal',null,null,60,100,false),
      ('48500000-0000-4000-8000-000000000052',2,'normal',null,null,60,100,false);
    outcome:=public.execute_train_template_command('{"protocolVersion":1,"operationId":"48500000-0000-4000-8000-000000000053","command":{"kind":"save-workout-as-template","workoutId":"48500000-0000-4000-8000-000000000050","name":"Saved transaction routine"}}');
    if outcome->>'status' is distinct from 'accepted'
      or jsonb_array_length(outcome->'receipt'->'template'->'entries')<>2
      or outcome->'receipt'->'template'->'entries'->0->'targets'->'items'->0->'measurements' is distinct from '{"weightKg":"85","reps":"5","durationSeconds":null,"distanceMeters":null}'::jsonb
      or jsonb_array_length(outcome->'receipt'->'template'->'entries'->0->'targets'->'items')<>2
      or outcome->'receipt'->'template'->'entries'->1->'targets'->'items'->0->'measurements' is distinct from '{"weightKg":null,"reps":null,"durationSeconds":"60","distanceMeters":"100.00"}'::jsonb then
      raise exception 'Current representative conversion changed source facts: %',outcome;
    end if;
    return;
  end if;
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
  if (public.train_template_capabilities()->'templates'->>'ready')::boolean then
    if public.execute_train_template_command('{"protocolVersion":1,"operationId":"48500000-0000-4000-8000-000000000070","command":{"kind":"create","name":"Atomic saved routine","notes":null,"entries":[{"id":"48500000-0000-4000-8000-000000000071","exerciseId":"48500000-0000-4000-8000-000000000002","notes":"Pause at the bottom","restSeconds":120,"targets":[{"id":"48500000-0000-4000-8000-000000000073","kind":"working","measurements":{"weightKg":80,"reps":8,"durationSeconds":null,"distanceMeters":null}}]},{"id":"48500000-0000-4000-8000-000000000072","exerciseId":"48500000-0000-4000-8000-000000000099","notes":"Hold steady","restSeconds":45,"targets":[{"id":"48500000-0000-4000-8000-000000000074","kind":"working","measurements":{"weightKg":null,"reps":null,"durationSeconds":60,"distanceMeters":100}}]}]}}'::jsonb)->>'status' is distinct from 'invalid_template' then
      raise exception 'Current conversion accepted a missing exercise reference';
    end if;
    return;
  end if;
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
