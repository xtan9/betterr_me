import { z } from "zod";
import { moneyAmountSchema } from "./money";

// =============================================================================
// BILL CREATE
// =============================================================================

/** Create a new recurring bill (manual entry) */
export const billCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long").trim(),
  amount: moneyAmountSchema.refine(
    (v) => v > 0,
    "Amount must be positive"
  ),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "ANNUALLY"]),
  next_due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date (YYYY-MM-DD)")
    .optional(),
});

// =============================================================================
// BILL UPDATE
// =============================================================================

/** Update an existing recurring bill */
export const billUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).trim().optional(),
    amount: moneyAmountSchema
      .refine((v) => v > 0, "Amount must be positive")
      .optional(),
    frequency: z
      .enum(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "ANNUALLY"])
      .optional(),
    next_due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date (YYYY-MM-DD)")
      .nullable()
      .optional(),
    user_status: z.enum(["auto", "confirmed", "dismissed"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field required",
  });

// =============================================================================
// BILL SYNC
// =============================================================================

/** Trigger Plaid recurring sync (no body needed) */
export const billSyncSchema = z.object({});

// =============================================================================
// INFERRED TYPES
// =============================================================================

export type BillCreateValues = z.infer<typeof billCreateSchema>;
export type BillUpdateValues = z.infer<typeof billUpdateSchema>;
