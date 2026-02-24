import { z } from "zod";

/**
 * Validates a money amount (in dollars) that can be safely converted to cents.
 * Range: -999,999,999.99 to 999,999,999.99 (fits in BIGINT cents)
 */
export const moneyAmountSchema = z
  .number()
  .min(-999_999_999.99, "Amount too small")
  .max(999_999_999.99, "Amount too large")
  .refine(
    (val) => {
      // Ensure at most 2 decimal places
      const str = val.toString();
      const decimalIndex = str.indexOf(".");
      if (decimalIndex === -1) return true;
      return str.length - decimalIndex - 1 <= 2;
    },
    { message: "Amount must have at most 2 decimal places" }
  );

/**
 * Validates a UUID format for household_id.
 */
export const householdIdSchema = z.string().uuid("Invalid household ID format");

// =============================================================================
// CATEGORY SCHEMAS
// =============================================================================

export const categoryCreateSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  icon: z.string().max(10).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  display_name: z.string().min(1).max(50).trim().optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field required" }
);

// =============================================================================
// MERCHANT RULE SCHEMAS
// =============================================================================

export const merchantRuleCreateSchema = z.object({
  merchant_name: z.string().min(1).max(200).trim(),
  category_id: z.string().uuid(),
});

// =============================================================================
// TRANSACTION UPDATE / SPLIT SCHEMAS
// =============================================================================

export const transactionUpdateSchema = z
  .object({
    category_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field required",
  });

export const transactionSplitSchema = z.object({
  splits: z
    .array(
      z.object({
        category_id: z.string().uuid(),
        amount_cents: z.number().int(),
        notes: z.string().max(200).nullable().optional(),
      })
    )
    .min(2, "At least 2 splits required"),
});

// =============================================================================
// INCOME CONFIRMATION & INSIGHT DISMISS SCHEMAS (Phase 24)
// =============================================================================

export const incomeConfirmationSchema = z.object({
  merchant_name: z.string().min(1, "Merchant name required"),
  amount_cents: z.number().int(),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY"]),
  next_expected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

export const insightDismissSchema = z.object({
  insight_id: z.string().min(1, "Insight ID required"),
});
