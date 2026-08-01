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

/** Browser Profile Details form contract; storage naming stays in the legacy route adapter below. */
export const profileDetailsFormSchema = z.object({
  fullName: z.string().max(100).optional().nullable(),
  avatarUrl: z
    .string()
    .url()
    .optional()
    .nullable()
    .or(z.literal("")),
}).strict();

export type ProfileDetailsFormValues = z.infer<
  typeof profileDetailsFormSchema
>;

// NOTE: `role` is intentionally excluded — role changes must go through admin tooling only.
// `profileUpdateSchema` remains the snake_case compatibility contract for /api/profile.
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
