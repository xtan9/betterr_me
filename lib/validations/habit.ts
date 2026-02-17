import { z } from "zod";

export const habitFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  description: z.string().max(500).optional().nullable(),
  category: z.enum(["health", "wellness", "learning", "productivity", "other"]).nullable().optional(),
  frequency: z.discriminatedUnion("type", [
    z.object({ type: z.literal("daily") }),
    z.object({ type: z.literal("weekdays") }),
    z.object({ type: z.literal("weekly") }),
    z.object({ type: z.literal("times_per_week"), count: z.union([z.literal(2), z.literal(3)]) }),
    z.object({ type: z.literal("custom"), days: z.array(z.number().min(0).max(6)).min(1, "Select at least one day") }),
  ]),
});

export type HabitFormValues = z.infer<typeof habitFormSchema>;

export const habitUpdateSchema = habitFormSchema
  .partial()
  .extend({
    status: z.enum(["active", "paused", "archived"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type HabitUpdateValues = z.infer<typeof habitUpdateSchema>;
