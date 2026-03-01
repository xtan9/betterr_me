import { z } from "zod";

/** Schema for creating a new routine (POST /api/routines). */
export const routineCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  notes: z.string().max(2000).nullable().optional(),
});

/** Schema for updating a routine (PATCH /api/routines/[id]). */
export const routineUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/** Schema for adding an exercise to a routine (POST /api/routines/[id]/exercises). */
export const routineExerciseAddSchema = z.object({
  exercise_id: z.string().uuid(),
  target_sets: z.number().int().min(1).max(20).default(3),
  target_reps: z.number().int().min(0).max(9999).nullable().optional(),
  target_weight_kg: z.number().min(0).max(99999.99).nullable().optional(),
  target_duration_seconds: z
    .number()
    .int()
    .min(0)
    .max(86400)
    .nullable()
    .optional(),
  rest_timer_seconds: z.number().int().min(0).max(600).default(90),
  notes: z.string().max(2000).nullable().optional(),
});

/** Schema for updating a routine exercise (PATCH /api/routines/[id]/exercises/[reId]). */
export const routineExerciseUpdateSchema = z
  .object({
    target_sets: z.number().int().min(1).max(20).optional(),
    target_reps: z.number().int().min(0).max(9999).nullable().optional(),
    target_weight_kg: z.number().min(0).max(99999.99).nullable().optional(),
    target_duration_seconds: z
      .number()
      .int()
      .min(0)
      .max(86400)
      .nullable()
      .optional(),
    rest_timer_seconds: z.number().int().min(0).max(600).optional(),
    notes: z.string().max(2000).nullable().optional(),
    sort_order: z.number().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

/** Schema for saving a workout as a routine (POST /api/workouts/[id]/save-as-routine). */
export const saveAsRoutineSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type RoutineCreateValues = z.infer<typeof routineCreateSchema>;
export type RoutineUpdateValues = z.infer<typeof routineUpdateSchema>;
export type RoutineExerciseAddValues = z.infer<typeof routineExerciseAddSchema>;
export type RoutineExerciseUpdateValues = z.infer<
  typeof routineExerciseUpdateSchema
>;
export type SaveAsRoutineValues = z.infer<typeof saveAsRoutineSchema>;
