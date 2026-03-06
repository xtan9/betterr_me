import { createPlaidClient } from "./client";
import { toCents } from "@/lib/money/arithmetic";
import type { TransactionStream } from "plaid";

/**
 * A bill detected from Plaid's recurring transaction streams.
 * Used as input to RecurringBillsDB.upsertFromPlaid().
 */
export interface DetectedBill {
  plaid_stream_id: string;
  account_id: string;
  merchant_name: string | null;
  description: string;
  amount_cents: number;
  frequency: string;
  predicted_next_date: string | null;
  first_date: string;
  last_date: string;
  is_active: boolean;
  status: string;
  category_primary: string | null;
}

/**
 * Fetch recurring transactions from Plaid and transform into DetectedBill records.
 *
 * Calls Plaid's `transactionsRecurringGet` endpoint which identifies recurring
 * payment streams using ML across millions of accounts. Returns both inflow
 * and outflow streams as DetectedBill arrays.
 *
 * Sign convention: Plaid positive = outflow (spending), our negative = outflow.
 * We apply `toCents(-(stream.last_amount.amount))` to invert.
 *
 * @param accessToken - Decrypted Plaid access token for the bank connection
 * @returns Object with inflows and outflows arrays of DetectedBill
 */
export async function fetchRecurringTransactions(
  accessToken: string
): Promise<{ inflows: DetectedBill[]; outflows: DetectedBill[] }> {
  const plaid = createPlaidClient();

  const response = await plaid.transactionsRecurringGet({
    access_token: accessToken,
  });

  const transform = (stream: TransactionStream): DetectedBill => ({
    plaid_stream_id: stream.stream_id,
    account_id: stream.account_id,
    merchant_name: stream.merchant_name,
    description: stream.description,
    // Invert Plaid sign: Plaid positive = outflow, our negative = outflow
    amount_cents: toCents(-(stream.last_amount?.amount ?? 0)),
    frequency: stream.frequency,
    predicted_next_date: stream.predicted_next_date ?? null,
    first_date: stream.first_date,
    last_date: stream.last_date,
    is_active: stream.is_active,
    status: stream.status,
    category_primary: stream.personal_finance_category?.primary ?? null,
  });

  return {
    inflows: response.data.inflow_streams.map(transform),
    outflows: response.data.outflow_streams.map(transform),
  };
}
