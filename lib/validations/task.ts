import { z } from "zod";

export const taskFormSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be 100 characters or less"),
  description: z.string().max(500).optional().nullable(),
  intention: z.string().max(200).optional().nullable(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  category: z.enum(["work", "personal", "shopping", "other"]).nullable(),
  due_date: z.string().nullable(),
  due_time: z.string().nullable(),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;
