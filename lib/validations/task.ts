import { z } from "zod";

export const taskStatusSchema = z.enum(['backlog', 'todo', 'in_progress', 'done']);

export const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(100, "Title must be 100 characters or less"),
  description: z.string().max(500).optional().nullable(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  category: z.enum(["work", "personal", "shopping", "other"]).nullable().optional(),
  due_date: z.string().nullable().optional(),
  due_time: z.string().nullable().optional(),
  completion_difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().optional(),
  status: taskStatusSchema.optional(),
  section: z.enum(['personal', 'work']).optional(),
  project_id: z.string().uuid().nullable().optional(),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const taskUpdateSchema = taskFormSchema
  .partial()
  .extend({
    is_completed: z.boolean().optional(),
    completed_at: z.string().nullable().optional(),
    status: taskStatusSchema.optional(),
    section: z.enum(['personal', 'work']).optional(),
    sort_order: z.number().optional(),
    project_id: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type TaskUpdateValues = z.infer<typeof taskUpdateSchema>;
