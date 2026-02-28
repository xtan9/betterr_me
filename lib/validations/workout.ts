import { z } from "zod";

/** Schema for creating a new workout (POST /api/workouts). */
export const workoutCreateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  routine_id: z.string().uuid().nullable().optional(),
});

/** Schema for updating a workout (PATCH /api/workouts/[id]). */
export const workoutUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    notes: z.string().max(2000).nullable().optional(),
    status: z.enum(["in_progress", "completed", "discarded"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/** Schema for adding an exercise to a workout (POST /api/workouts/[id]/exercises). */
export const addExerciseToWorkoutSchema = z.object({
  exercise_id: z.string().uuid(),
  rest_timer_seconds: z.number().int().min(0).max(600).optional(),
});

/** Schema for updating a workout exercise (PATCH /api/workouts/[id]/exercises/[weId]). */
export const workoutExerciseUpdateSchema = z
  .object({
    notes: z.string().max(2000).nullable().optional(),
    rest_timer_seconds: z.number().int().min(0).max(600).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/** Schema for creating a set (POST /api/workouts/[id]/exercises/[weId]/sets). */
export const workoutSetCreateSchema = z.object({
  set_type: z
    .enum(["warmup", "normal", "drop", "failure"])
    .default("normal"),
  weight_kg: z.number().min(0).max(99999.99).nullable().optional(),
  reps: z.number().int().min(0).max(9999).nullable().optional(),
  duration_seconds: z.number().int().min(0).max(86400).nullable().optional(),
  distance_meters: z.number().min(0).max(999999.99).nullable().optional(),
  is_completed: z.boolean().default(false),
});

/** Schema for updating a set (PATCH /api/workouts/[id]/exercises/[weId]/sets). */
export const workoutSetUpdateSchema = z
  .object({
    set_type: z.enum(["warmup", "normal", "drop", "failure"]).optional(),
    weight_kg: z.number().min(0).max(99999.99).nullable().optional(),
    reps: z.number().int().min(0).max(9999).nullable().optional(),
    duration_seconds: z
      .number()
      .int()
      .min(0)
      .max(86400)
      .nullable()
      .optional(),
    distance_meters: z
      .number()
      .min(0)
      .max(999999.99)
      .nullable()
      .optional(),
    is_completed: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type WorkoutCreateValues = z.infer<typeof workoutCreateSchema>;
export type WorkoutUpdateValues = z.infer<typeof workoutUpdateSchema>;
export type AddExerciseToWorkoutValues = z.infer<
  typeof addExerciseToWorkoutSchema
>;
export type WorkoutExerciseUpdateValues = z.infer<
  typeof workoutExerciseUpdateSchema
>;
export type WorkoutSetCreateValues = z.infer<typeof workoutSetCreateSchema>;
export type WorkoutSetUpdateValues = z.infer<typeof workoutSetUpdateSchema>;
