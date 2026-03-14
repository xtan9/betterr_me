import { z } from "zod";

/**
 * Validation schema for household invitation.
 */
export const inviteSchema = z.object({
  email: z.string().email(),
});

export type InviteFormValues = z.infer<typeof inviteSchema>;

/**
 * Validation schema for account visibility change.
 */
export const visibilityChangeSchema = z.object({
  visibility: z.enum(["mine", "ours", "hidden"]),
});

export type VisibilityChangeValues = z.infer<typeof visibilityChangeSchema>;

/**
 * Validation schema for transaction household visibility flags.
 */
export const transactionVisibilitySchema = z
  .object({
    is_hidden_from_household: z.boolean().optional(),
    is_shared_to_household: z.boolean().optional(),
  })
  .refine(
    (d) => !(d.is_hidden_from_household && d.is_shared_to_household),
    { message: "Transaction cannot be both hidden and shared" }
  );

export type TransactionVisibilityValues = z.infer<
  typeof transactionVisibilitySchema
>;
