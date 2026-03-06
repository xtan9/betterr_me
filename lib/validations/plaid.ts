import { z } from "zod";
import { moneyAmountSchema } from "./money";

/**
 * Schema for manual transaction entry form.
 * Amount is a positive number (sign determined by transaction type in UI).
 */
export const manualTransactionSchema = z.object({
  amount: moneyAmountSchema.refine((val) => val > 0, {
    message: "Amount must be greater than zero",
  }),
  description: z
    .string()
    .min(1, "Description is required")
    .max(500, "Description must be under 500 characters"),
  transaction_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  category: z.string().optional(),
  account_id: z.union([
    z.literal("cash"),
    z.string().uuid("Invalid account ID"),
  ]),
});

export type ManualTransactionInput = z.infer<typeof manualTransactionSchema>;

/**
 * Schema for Plaid public token exchange request.
 */
export const exchangeTokenSchema = z.object({
  public_token: z
    .string()
    .startsWith("public-", "Invalid public token format"),
});

export type ExchangeTokenInput = z.infer<typeof exchangeTokenSchema>;

/**
 * Schema for Plaid webhook payload (basic shape validation).
 * Full webhook processing handles specific types/codes separately.
 */
export const webhookPayloadSchema = z.object({
  webhook_type: z.string(),
  webhook_code: z.string(),
  item_id: z.string(),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
