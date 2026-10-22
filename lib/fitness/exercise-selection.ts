import type { Equipment, Exercise, MuscleGroup } from "@/lib/db/types";

interface ExerciseFilters {
  search: string;
  muscleGroup: MuscleGroup | null;
  equipment: Equipment | null;
}

/** Select and group the exercise catalog in its existing display order. */
export function selectExercises(
  exercises: readonly Exercise[],
  { search, muscleGroup, equipment }: ExerciseFilters,
) {
  const query = search.toLowerCase();
  const filteredExercises: Exercise[] = [];
  const groupedExercises = new Map<MuscleGroup, Exercise[]>();
  for (const exercise of exercises) {
    if (query && !exercise.name.toLowerCase().includes(query)) continue;
    if (muscleGroup && exercise.muscle_group_primary !== muscleGroup) continue;
    if (equipment && exercise.equipment !== equipment) continue;
    filteredExercises.push(exercise);
    const group = groupedExercises.get(exercise.muscle_group_primary);
    if (group) group.push(exercise);
    else groupedExercises.set(exercise.muscle_group_primary, [exercise]);
  }
  return { filteredExercises, groupedExercises };
}
