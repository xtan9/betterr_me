import { z } from "zod";

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  color: z.string().min(1, "Color is required"),
  icon: z.string().max(50).nullable().optional(),
});

export type CategoryCreateValues = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type CategoryUpdateValues = z.infer<typeof categoryUpdateSchema>;
