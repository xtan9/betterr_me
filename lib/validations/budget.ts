import { z } from "zod";
import { moneyAmountSchema } from "./money";

// =============================================================================
// BUDGET CATEGORY ALLOCATION
// =============================================================================

/** Category allocation within a budget envelope */
export const budgetCategoryInputSchema = z.object({
  category_id: z.string().uuid(),
  amount: moneyAmountSchema.refine((v) => v >= 0, "Amount must be non-negative"),
});

// =============================================================================
// BUDGET CREATE
// =============================================================================

/** Create a new budget for a month */
export const budgetCreateSchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}-01$/, "Must be first day of month (YYYY-MM-01)"),
    total: moneyAmountSchema.refine((v) => v > 0, "Total must be positive"),
    rollover_enabled: z.boolean().optional().default(false),
    categories: z
      .array(budgetCategoryInputSchema)
      .min(1, "At least one category required"),
  })
  .refine(
    (data) => {
      const sum = data.categories.reduce((acc, c) => acc + c.amount, 0);
      return sum <= data.total;
    },
    {
      message: "Category allocations cannot exceed total budget",
      path: ["categories"],
    }
  );

// =============================================================================
// BUDGET UPDATE
// =============================================================================

/** Update an existing budget */
export const budgetUpdateSchema = z
  .object({
    total: moneyAmountSchema
      .refine((v) => v > 0, "Total must be positive")
      .optional(),
    rollover_enabled: z.boolean().optional(),
    categories: z.array(budgetCategoryInputSchema).min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field required",
  })
  .refine(
    (data) => {
      // If both total and categories provided, validate envelope constraint
      if (data.total && data.categories) {
        const sum = data.categories.reduce((acc, c) => acc + c.amount, 0);
        return sum <= data.total;
      }
      return true;
    },
    {
      message: "Category allocations cannot exceed total budget",
      path: ["categories"],
    }
  );

// =============================================================================
// ROLLOVER CONFIRMATION
// =============================================================================

/** Confirm rollover from previous month to current */
export const rolloverConfirmSchema = z.object({
  from_budget_id: z.string().uuid(),
});

// =============================================================================
// QUERY SCHEMAS
// =============================================================================

/** Query params for spending analytics (month view) */
export const spendingQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format"),
});

/** Query params for spending trends (multi-month) */
export const trendQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).optional().default(12),
});

// =============================================================================
// INFERRED TYPES
// =============================================================================

export type BudgetCreateInput = z.infer<typeof budgetCreateSchema>;
export type BudgetUpdateInput = z.infer<typeof budgetUpdateSchema>;
export type BudgetCategoryInput = z.infer<typeof budgetCategoryInputSchema>;
export type RolloverConfirmInput = z.infer<typeof rolloverConfirmSchema>;
export type SpendingQueryInput = z.infer<typeof spendingQuerySchema>;
export type TrendQueryInput = z.infer<typeof trendQuerySchema>;
