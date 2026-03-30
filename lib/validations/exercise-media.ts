import { z } from "zod";

export const syncExerciseMediaSchema = z.object({
  threshold: z.number().min(0).max(1).optional().default(0.5),
  dryRun: z.boolean().optional().default(false),
});

export type SyncExerciseMediaInput = z.infer<typeof syncExerciseMediaSchema>;
