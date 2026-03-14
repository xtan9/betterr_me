import { z } from "zod";
import { moneyAmountSchema } from "./money";

// =============================================================================
// GOAL CREATE
// =============================================================================

/** Create a new savings goal */
export const goalCreateSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100, "Name too long").trim(),
    target_amount: moneyAmountSchema.refine(
      (v) => v > 0,
      "Target amount must be positive"
    ),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date (YYYY-MM-DD)")
      .optional(),
    funding_type: z.enum(["manual", "linked"]),
    linked_account_id: z.string().uuid().optional(),
    icon: z.string().max(10).optional(),
    color: z.string().max(20).optional(),
  })
  .refine(
    (data) => {
      // linked_account_id is required when funding_type is "linked"
      if (data.funding_type === "linked" && !data.linked_account_id) {
        return false;
      }
      return true;
    },
    {
      message: "Linked account is required when funding type is 'linked'",
      path: ["linked_account_id"],
    }
  );

// =============================================================================
// GOAL UPDATE
// =============================================================================

/** Update an existing savings goal */
export const goalUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).trim().optional(),
    target_amount: moneyAmountSchema
      .refine((v) => v > 0, "Target amount must be positive")
      .optional(),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date (YYYY-MM-DD)")
      .nullable()
      .optional(),
    funding_type: z.enum(["manual", "linked"]).optional(),
    linked_account_id: z.string().uuid().nullable().optional(),
    icon: z.string().max(10).nullable().optional(),
    color: z.string().max(20).nullable().optional(),
    status: z.enum(["active", "completed", "archived"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field required",
  });

// =============================================================================
// CONTRIBUTION CREATE
// =============================================================================

/** Add a contribution to a savings goal */
export const contributionCreateSchema = z.object({
  amount: moneyAmountSchema.refine(
    (v) => v > 0,
    "Contribution amount must be positive"
  ),
  note: z.string().max(200, "Note too long").optional(),
});

// =============================================================================
// MANUAL ASSET CREATE
// =============================================================================

/** Create a new manual asset */
export const manualAssetCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long").trim(),
  value: moneyAmountSchema.refine(
    (v) => v > 0,
    "Value must be positive"
  ),
  asset_type: z.enum(["property", "vehicle", "investment", "other"]),
  notes: z.string().max(500, "Notes too long").optional(),
});

// =============================================================================
// MANUAL ASSET UPDATE
// =============================================================================

/** Update an existing manual asset */
export const manualAssetUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).trim().optional(),
    value: moneyAmountSchema
      .refine((v) => v > 0, "Value must be positive")
      .optional(),
    asset_type: z.enum(["property", "vehicle", "investment", "other"]).optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field required",
  });

// =============================================================================
// INFERRED TYPES
// =============================================================================

export type GoalCreateValues = z.infer<typeof goalCreateSchema>;
export type GoalUpdateValues = z.infer<typeof goalUpdateSchema>;
export type ContributionCreateValues = z.infer<typeof contributionCreateSchema>;
export type ManualAssetCreateValues = z.infer<typeof manualAssetCreateSchema>;
export type ManualAssetUpdateValues = z.infer<typeof manualAssetUpdateSchema>;
