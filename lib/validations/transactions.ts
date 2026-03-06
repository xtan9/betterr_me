import { z } from "zod";

/**
 * Zod schema for transaction search/filter query parameters.
 * Used at API boundaries for GET /api/money/transactions.
 */
export const transactionFilterSchema = z.object({
  search: z.string().optional(),
  account_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  amount_min: z.coerce.number().optional(),
  amount_max: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type TransactionFilterValues = z.infer<typeof transactionFilterSchema>;
