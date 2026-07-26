import { z } from "zod";

// Keep amounts well within JavaScript's safe integer range while still
// allowing realistic personal-finance inputs.
export const MAX_CUSHION_AMOUNT_CENTS = 100_000_000_000;

const centsSchema = z
  .number()
  .finite()
  .int()
  .min(0)
  .max(MAX_CUSHION_AMOUNT_CENTS);

export const financeCushionInputSchema = z
  .object({
    liquid_resources_cents: centsSchema,
    monthly_essential_expenses_cents: centsSchema.min(1),
    monthly_continuing_income_cents: centsSchema.default(0),
  })
  .strict();

export type FinanceCushionInput = z.output<typeof financeCushionInputSchema>;
