import {
  recordedWorkoutSchema,
  recordedTime,
  recordedInstant as instant,
  type CapturedDefinition,
  type RecordedCompletion,
} from "@/lib/validations/workout-recording";
export type {
  CapturedDefinition,
  RecordedCompletion,
} from "@/lib/validations/workout-recording";
export type RecordedStatus = "legacy" | "recorded" | "unsupported";
export type RecordedSelection =
  | { status: "legacy" | "unsupported" }
  | { status: "recorded"; completion: RecordedCompletion };
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Exactly one authority. Unknown documents remain rows, not guessed legacy sets. */
export function selectRecordedCompletion(
  row: Record<string, unknown>,
): RecordedSelection {
  const old = row.native_completion,
    current = row.recorded_completion;
  if (old == null && current == null) return { status: "legacy" };
  if (old != null && current != null) return { status: "unsupported" };
  const value = old ?? current;
  if (
    !object(value) ||
    (old != null
      ? value.version !== 1
      : value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== 5) ||
    !recordedWorkoutSchema.safeParse(value).success
  )
    return { status: "unsupported" };
  const completion = value as RecordedCompletion;
  const time = recordedTime(completion);
  const startedAt = 'startedAt' in time ? time.startedAt : null;
  const completedAt = 'completedAt' in time ? time.completedAt : null;
  if (
    row.id !== completion.id ||
    row.user_id !== completion.ownerId ||
    row.status !== "completed" ||
    instant(row.started_at) !== instant(startedAt) ||
    instant(row.completed_at) !== instant(completedAt) ||
    row.duration_seconds !== time.durationSeconds ||
    ((completion.version === 4 || completion.version === 5 && completion.templateOrigin) && row.routine_id !== completion.templateOrigin!.content.id)
  )
    return { status: "unsupported" };
  if (Array.isArray(row.workout_exercises)) {
    const entries = row.workout_exercises;
    if (
      entries.length !== completion.exercises.length ||
      completion.exercises.some((captured) => {
        const entry = entries.find(
          (item) => object(item) && item.id === captured.id,
        );
        return (
          !object(entry) ||
          ("reference" in captured.definition &&
            entry.exercise_id !== captured.definition.reference.exerciseId) ||
          !Array.isArray(entry.sets) ||
          entry.sets.length !== captured.sets.length ||
          captured.sets.some(
            (set) =>
              !(entry.sets as unknown[]).some(
                (item) => object(item) && item.id === set.id,
              ),
          )
        );
      })
    )
      return { status: "unsupported" };
  }
  return { status: "recorded", completion };
}

export function recordedDefinition(
  selected: RecordedSelection,
  entryId: unknown,
): CapturedDefinition | null {
  if (selected.status !== "recorded") return null;
  return (
    selected.completion.exercises.find((entry) => entry.id === entryId)
      ?.definition ?? null
  );
}

export function recordedName(definition: CapturedDefinition) {
  return typeof definition.name === "string"
    ? definition.name
    : definition.name.en;
}

export function comparableDefinition(definition: CapturedDefinition | null) {
  return (
    !definition ||
    !("reference" in definition) ||
    definition.convention !== null
  );
}

export function recordedExercise(
  selected: RecordedSelection,
  entry: Record<string, unknown>,
) {
  const captured = recordedDefinition(selected, entry.id);
  if (!captured) return entry;
  return {
    ...entry,
    live_exercise: entry.exercise,
    recorded_definition: captured,
    exercise: {
      ...(object(entry.exercise) ? entry.exercise : {}),
      name: recordedName(captured),
      equipment: captured.equipment,
      exercise_type: captured.mode,
    },
  };
}

/** A per-exercise history query still uses its workout's captured meaning. */
export function historyMeasurementMode(
  row: Record<string, unknown>,
): string | null {
  if (!object(row.workout)) return null;
  const selected = selectRecordedCompletion(row.workout);
  if (selected.status === "unsupported") return null;
  if (selected.status === "recorded") {
    const captured = selected.completion.exercises.find(
      (entry) => entry.id === row.id,
    );
    if (
      !captured ||
      !Array.isArray(row.sets) ||
      row.sets.length !== captured.sets.length ||
      captured.sets.some(
        (set) =>
          !(row.sets as unknown[]).some(
            (item) => object(item) && item.id === set.id,
          ),
      )
    )
      return null;
    return comparableDefinition(captured.definition)
      ? captured.definition.mode
      : null;
  }
  return object(row.exercise) && typeof row.exercise.exercise_type === "string"
    ? row.exercise.exercise_type
    : "legacy";
}
