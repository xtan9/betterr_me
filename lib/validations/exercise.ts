import { z } from "zod";

export const exerciseFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  muscle_group_primary: z.enum([
    "chest",
    "back",
    "shoulders",
    "biceps",
    "triceps",
    "forearms",
    "core",
    "quadriceps",
    "hamstrings",
    "glutes",
    "calves",
    "traps",
    "lats",
    "full_body",
    "cardio",
    "other",
  ]),
  muscle_groups_secondary: z.array(
    z.enum([
      "chest",
      "back",
      "shoulders",
      "biceps",
      "triceps",
      "forearms",
      "core",
      "quadriceps",
      "hamstrings",
      "glutes",
      "calves",
      "traps",
      "lats",
      "full_body",
      "cardio",
      "other",
    ])
  ),
  equipment: z.enum([
    "barbell",
    "dumbbell",
    "machine",
    "bodyweight",
    "kettlebell",
    "cable",
    "band",
    "other",
    "none",
  ]),
  exercise_type: z.enum([
    "weight_reps",
    "bodyweight_reps",
    "weighted_bodyweight",
    "assisted_bodyweight",
    "duration",
    "duration_weight",
    "distance_duration",
    "weight_distance",
  ]),
});

export const exerciseUpdateSchema = exerciseFormSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;
