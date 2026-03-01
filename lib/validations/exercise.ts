import { z } from "zod";
import {
  MUSCLE_GROUPS,
  EQUIPMENT,
  EXERCISE_TYPES,
} from "@/lib/constants/enums";

export const exerciseFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  muscle_group_primary: z.enum(MUSCLE_GROUPS),
  muscle_groups_secondary: z.array(z.enum(MUSCLE_GROUPS)),
  equipment: z.enum(EQUIPMENT),
  exercise_type: z.enum(EXERCISE_TYPES),
});

export const exerciseUpdateSchema = exerciseFormSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;
