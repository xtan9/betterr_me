import { z } from "zod";
import { RUNWAY_REGIONS } from "@/lib/finance/runway-regions";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_ITEM_TYPES,
  EXPENSE_ITEM_TYPE_VALUES,
} from "@/lib/finance/runway-expenses";

export const MAX_CUSHION_AMOUNT_CENTS = 100_000_000_000;
const cents = z.number().finite().int().min(0).max(MAX_CUSHION_AMOUNT_CENTS);
const confidence = z.enum([
  "confirmed",
  "estimated",
  "needs_review",
  "skipped",
]);
const money = z.object({ cents, confidence }).strict();
const income = z
  .object({
    employment: z.enum([
      "employed",
      "self_employed",
      "unemployed",
      "not_working",
    ]),
    monthly_take_home_cents: cents,
    estimated_monthly_take_home_cents: cents,
    entered_amount_cents: cents,
    entered_period: z.enum(["monthly", "annual"]),
    entered_as: z.enum(["net", "gross"]),
    gross_amount_cents: cents,
    gross_period: z.enum(["monthly", "annual"]),
    net_amount_cents: cents,
    net_period: z.enum(["monthly", "annual"]),
    tax_filing_status: z.enum(["single", "married_joint", "married_separate", "head_household"]),
    annual_other_deductions_cents: cents,
    take_home_source: z.enum(["estimated", "user_confirmed"]),
    confidence,
    estimate_rule_version: z.string().max(80).optional(),
    take_home_reviewed: z.boolean().optional(),
  })
  .strict();
const expenseCategory = z.enum(EXPENSE_CATEGORIES);

export const householdRunwayAnswersSchema = z
  .object({
    schema_version: z.literal(4),
    country: z.enum(["US", "CA", "CN", "TW"]),
    region: z.string().trim().min(1).max(20),
    currency: z.enum(["USD", "CAD", "CNY", "TWD"]),
    shares_finances: z.boolean(),
    has_children: z.boolean(),
    has_support_obligations: z.boolean(),
    mine: income,
    partner: income.nullable(),
    other_income_sources: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            type: z.enum([
              "rental_net",
              "side_business",
              "dividends_interest",
              "support",
              "pension_benefits",
              "other",
            ]),
            label: z.string().trim().max(100).optional(),
            monthly_cents: cents,
            confidence,
          })
          .strict()
          .superRefine((source, context) => {
            if (source.type === "other" && !source.label) {
              context.addIssue({
                code: "custom",
                message: "Custom income needs a label",
                path: ["label"],
              });
            }
          }),
      )
      .max(20),
    available_cash: money,
    assets: z
      .object({
        liquid_investments: money,
        illiquid_investments: money,
        home_equity: money,
        retirement_tax_deferred: money,
        retirement_tax_free: money,
      })
      .strict(),
    housing_tenure: z.enum(["rent", "own", "other"]).nullable(),
    expense_mode: z.enum(["guided", "quick"]),
    expense_items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            category: expenseCategory,
            type: z.enum(EXPENSE_ITEM_TYPE_VALUES),
            label: z.string().trim().max(100).optional(),
            current_amount_cents: cents,
            interruption_amount_cents: cents,
            frequency: z.enum(["monthly", "quarterly", "annual"]),
            confidence,
          })
          .strict(),
      )
      .max(100),
    completed_expense_categories: z.array(expenseCategory).max(10),
    expense_category_modes: z.record(z.string(), z.enum(["subtotal", "itemized"])),
    expense_category_subtotals: z.record(z.string(), z.object({
      current_monthly_cents: cents,
      interruption_monthly_cents: cents,
      confidence,
    }).strict()),
    quick_expenses: z
      .object({
        current_monthly_cents: cents,
        interruption_monthly_cents: cents,
        confidence,
      })
      .strict(),
    extreme_access: z
      .object({
        illiquid_investments_cents: cents,
        retirement_tax_deferred_cents: cents,
        retirement_tax_free_cents: cents,
      })
      .strict(),
    updated_at: z.string().datetime(),
  })
  .strict()
  .superRefine((answers, context) => {
    if (
      !RUNWAY_REGIONS[answers.country].some(
        (region) => region.code === answers.region,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Region is not valid for the selected country",
        path: ["region"],
      });
    }
    const caps = [
      [
        answers.extreme_access.illiquid_investments_cents,
        answers.assets.illiquid_investments.cents,
        "illiquid_investments_cents",
      ],
      [
        answers.extreme_access.retirement_tax_deferred_cents,
        answers.assets.retirement_tax_deferred.cents,
        "retirement_tax_deferred_cents",
      ],
      [
        answers.extreme_access.retirement_tax_free_cents,
        answers.assets.retirement_tax_free.cents,
        "retirement_tax_free_cents",
      ],
    ] as const;
    for (const [usable, balance, field] of caps) {
      if (usable > balance) {
        context.addIssue({
          code: "custom",
          message: "Usable amount cannot exceed the entered balance",
          path: ["extreme_access", field],
        });
      }
    }
    answers.expense_items.forEach((item, index) => {
      if (!(EXPENSE_ITEM_TYPES[item.category] as readonly string[]).includes(item.type)) {
        context.addIssue({
          code: "custom",
          message: "Expense type does not belong to its category",
          path: ["expense_items", index, "type"],
        });
      }
    });
  });

const runwayAdjustmentCents = z
  .number()
  .finite()
  .int()
  .min(0)
  .max(MAX_CUSHION_AMOUNT_CENTS);

export const runwayAdjustmentsSchema = z
  .object({
    expense_reduction_cents: runwayAdjustmentCents.default(0),
    added_cash_cents: runwayAdjustmentCents.default(0),
    added_monthly_income_cents: runwayAdjustmentCents.default(0),
    expected_unconfirmed_funds_cents: runwayAdjustmentCents.default(0),
    usable_illiquid_investments_cents: runwayAdjustmentCents.default(0),
    usable_retirement_tax_deferred_cents: runwayAdjustmentCents.default(0),
    usable_retirement_tax_free_cents: runwayAdjustmentCents.default(0),
  })
  .strict();

export const householdRunwayAssessmentInputSchema = z.object({
  answers: householdRunwayAnswersSchema,
  adjustments: runwayAdjustmentsSchema.default({}),
  startDate: z.date().optional(),
});

const attributionSchema = z
  .object({
    video: z.string().max(120).optional(),
    campaign: z.string().max(120).optional(),
    cta: z.string().max(120).optional(),
    landing_variant: z.string().max(120).optional(),
    language: z.string().max(20).optional(),
  })
  .strict();

export const financeCushionPlanSchema = z
  .object({
    answers: householdRunwayAnswersSchema,
    status: z.enum(["in_progress", "completed"]),
    attribution: attributionSchema.default({}),
    create_snapshot: z.boolean().default(false),
    snapshot_action_id: z.string().uuid().optional(),
    snapshot_trigger: z.enum(["completed", "updated", "imported"]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.create_snapshot &&
      (!value.snapshot_action_id || !value.snapshot_trigger)
    ) {
      context.addIssue({
        code: "custom",
        message: "Snapshot id and trigger are required",
        path: ["snapshot_action_id"],
      });
    }
  });

export const financeCushionEventSchema = z
  .object({
    action_id: z.string().uuid(),
    session_id: z.string().uuid(),
    event_name: z.enum([
      "landing_view",
      "started",
      "skipped",
      "completed",
      "result_interaction",
      "registration_clicked",
    ]),
    step_id: z.string().max(64).optional(),
    locale: z.string().max(16).optional(),
    attribution: attributionSchema.optional(),
  })
  .strict();

// Retained for legacy V1 callers and focused compatibility tests.
export const financeCushionInputSchema = z
  .object({
    liquid_resources_cents: cents,
    monthly_essential_expenses_cents: cents.min(1),
    monthly_continuing_income_cents: cents.default(0),
  })
  .strict();

export type FinanceCushionInput = z.output<typeof financeCushionInputSchema>;
export type FinanceCushionPlanInput = z.output<typeof financeCushionPlanSchema>;
