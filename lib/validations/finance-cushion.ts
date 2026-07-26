import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/lib/finance/cushion";

export const MAX_CUSHION_AMOUNT_CENTS = 100_000_000_000;
const cents = z.number().finite().int().min(0).max(MAX_CUSHION_AMOUNT_CENTS);
const confidence = z.enum(["confirmed", "estimated", "skipped"]);
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
    entered_amount_cents: cents,
    entered_period: z.enum(["monthly", "annual"]),
    entered_as: z.enum(["net", "gross"]),
    confidence,
    take_home_reviewed: z.boolean(),
    estimate_rule_version: z.string().max(80).optional(),
  })
  .strict();
const expense = z
  .object({ current_cents: cents, interruption_cents: cents, confidence })
  .strict();

export const householdRunwayAnswersSchema = z
  .object({
    schema_version: z.literal(2),
    country: z.enum(["US", "CA", "CN", "TW"]),
    region: z.string().trim().min(1).max(100),
    currency: z.enum(["USD", "CAD", "CNY", "TWD"]),
    shares_finances: z.boolean(),
    has_children: z.boolean(),
    has_support_obligations: z.boolean(),
    mine: income,
    partner: income.nullable(),
    other_monthly_income: money,
    available_cash: money,
    confirmed_funds: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            amount_cents: cents,
            arrives_month: z.number().int().min(1).max(120),
            confidence: z.literal("confirmed"),
          })
          .strict(),
      )
      .max(20),
    taxable_investments: money,
    investment_access_percent: z.number().int().min(0).max(100),
    retirement_accounts: money,
    home_equity: money,
    expenses: z
      .object(
        Object.fromEntries(
          EXPENSE_CATEGORIES.map((key) => [key, expense]),
        ) as Record<(typeof EXPENSE_CATEGORIES)[number], typeof expense>,
      )
      .strict(),
    temporary_income: z
      .object({
        monthly_cents: cents,
        remaining_months: z.number().int().min(1).max(120),
        confidence,
      })
      .strict()
      .nullable(),
    updated_at: z.string().datetime(),
  })
  .strict();

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
