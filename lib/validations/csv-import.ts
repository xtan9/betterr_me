import { z } from "zod";

/**
 * Zod schema for a single CSV import row.
 */
export const csvImportRowSchema = z.object({
  transaction_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  amount: z.number(),
  description: z.string().min(1, "Description is required").max(500),
  merchant_name: z.string().max(200).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
});

/**
 * Zod schema for the full CSV import API payload.
 */
export const csvImportSchema = z.object({
  account_id: z.union([z.literal("cash"), z.string().uuid()]),
  rows: z.array(csvImportRowSchema).min(1).max(5000),
  skip_duplicates: z.boolean().default(true),
});

/** Type for a single CSV import row. */
export type CsvImportRow = z.infer<typeof csvImportRowSchema>;

/** Type for the full CSV import payload. */
export type CsvImportPayload = z.infer<typeof csvImportSchema>;
