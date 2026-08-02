import { z } from "zod";

/** Browser Profile Details form contract in domain casing. */
export const profileDetailsFormSchema = z
  .object({
    fullName: z.string().max(100).optional().nullable(),
    avatarUrl: z
      .string()
      .url()
      .optional()
      .nullable()
      .or(z.literal("")),
  })
  .strict();

export type ProfileDetailsFormValues = z.infer<
  typeof profileDetailsFormSchema
>;
