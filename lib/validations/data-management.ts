import { z } from "zod";

/**
 * Zod schema for export transaction query parameters.
 * Both date_from and date_to are optional — omitting means "all time".
 */
export const exportTransactionsSchema = z.object({
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type ExportTransactionsValues = z.infer<typeof exportTransactionsSchema>;

/**
 * Zod schema for money data deletion confirmation.
 * Requires the exact literal "DELETE" to proceed.
 */
export const deleteMoneyDataSchema = z.object({
  confirmation: z.literal("DELETE"),
});

export type DeleteMoneyDataValues = z.infer<typeof deleteMoneyDataSchema>;
