import { z } from "zod";

export const profileFormSchema = z.object({
  full_name: z.string().max(100).optional().nullable(),
  avatar_url: z
    .string()
    .url()
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

// NOTE: `role` is intentionally excluded — role changes must go through admin tooling only.
export const profileUpdateSchema = profileFormSchema
  .partial()
  .extend({
    timezone: z.string().min(1).max(100).optional().nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type ProfileUpdateValues = z.infer<typeof profileUpdateSchema>;
