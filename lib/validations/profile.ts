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
