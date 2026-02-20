import { z } from "zod";

export const projectSectionSchema = z.enum(['personal', 'work']);

export const projectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or less"),
  section: projectSectionSchema,
  color: z.string().min(1, "Color is required"),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const projectUpdateSchema = projectFormSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type ProjectUpdateValues = z.infer<typeof projectUpdateSchema>;
