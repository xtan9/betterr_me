-- Keep user-owned custom exercises isolated when they are referenced by a
-- routine or workout. Preset exercises remain shareable.

drop policy if exists "Users can view exercises in own workouts"
  on public.workout_exercises;
create policy "Users can view exercises in own workouts"
  on public.workout_exercises for select
  using (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercises.workout_id
        and workouts.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.exercises
      where exercises.id = workout_exercises.exercise_id
        and (exercises.user_id is null or exercises.user_id = auth.uid())
    )
  );

drop policy if exists "Users can add exercises to own workouts"
  on public.workout_exercises;
create policy "Users can add exercises to own workouts"
  on public.workout_exercises for insert
  with check (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercises.workout_id
        and workouts.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.exercises
      where exercises.id = workout_exercises.exercise_id
        and (exercises.user_id is null or exercises.user_id = auth.uid())
    )
  );

drop policy if exists "Users can update exercises in own workouts"
  on public.workout_exercises;
create policy "Users can update exercises in own workouts"
  on public.workout_exercises for update
  using (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercises.workout_id
        and workouts.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.exercises
      where exercises.id = workout_exercises.exercise_id
        and (exercises.user_id is null or exercises.user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercises.workout_id
        and workouts.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.exercises
      where exercises.id = workout_exercises.exercise_id
        and (exercises.user_id is null or exercises.user_id = auth.uid())
    )
  );

drop policy if exists "Users can remove exercises from own workouts"
  on public.workout_exercises;
create policy "Users can remove exercises from own workouts"
  on public.workout_exercises for delete
  using (
    exists (
      select 1
      from public.workouts
      where workouts.id = workout_exercises.workout_id
        and workouts.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.exercises
      where exercises.id = workout_exercises.exercise_id
        and (exercises.user_id is null or exercises.user_id = auth.uid())
    )
  );

drop policy if exists "Users can view exercises in own routines"
  on public.routine_exercises;
create policy "Users can view exercises in own routines"
  on public.routine_exercises for select
  using (
    exists (
      select 1
      from public.routines
      where routines.id = routine_exercises.routine_id
        and routines.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.exercises
      where exercises.id = routine_exercises.exercise_id
        and (exercises.user_id is null or exercises.user_id = auth.uid())
    )
  );

drop policy if exists "Users can add exercises to own routines"
  on public.routine_exercises;
create policy "Users can add exercises to own routines"
  on public.routine_exercises for insert
  with check (
    exists (
      select 1
      from public.routines
      where routines.id = routine_exercises.routine_id
        and routines.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.exercises
      where exercises.id = routine_exercises.exercise_id
        and (exercises.user_id is null or exercises.user_id = auth.uid())
    )
  );

drop policy if exists "Users can update exercises in own routines"
  on public.routine_exercises;
create policy "Users can update exercises in own routines"
  on public.routine_exercises for update
  using (
    exists (
      select 1
      from public.routines
      where routines.id = routine_exercises.routine_id
        and routines.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.exercises
      where exercises.id = routine_exercises.exercise_id
        and (exercises.user_id is null or exercises.user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.routines
      where routines.id = routine_exercises.routine_id
        and routines.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.exercises
      where exercises.id = routine_exercises.exercise_id
        and (exercises.user_id is null or exercises.user_id = auth.uid())
    )
  );

drop policy if exists "Users can delete exercises from own routines"
  on public.routine_exercises;
create policy "Users can delete exercises from own routines"
  on public.routine_exercises for delete
  using (
    exists (
      select 1
      from public.routines
      where routines.id = routine_exercises.routine_id
        and routines.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.exercises
      where exercises.id = routine_exercises.exercise_id
        and (exercises.user_id is null or exercises.user_id = auth.uid())
    )
  );
