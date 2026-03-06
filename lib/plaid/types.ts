/**
 * Plaid integration types for BetterR.Me money tracking.
 *
 * Sign convention:
 * Our DB uses accounting convention: positive = inflow (income), negative = outflow (expense).
 * Plaid uses positive = outflow (spending). Invert sign during sync via toCents(-amount).
 */

/**
 * Data returned from Plaid after token exchange.
 * Used to populate bank_connections and accounts tables.
 */
export interface PlaidItemData {
  item_id: string;
  access_token: string;
  institution_id: string | null;
  institution_name: string | null;
}

/**
 * Represents a single account from Plaid's /accounts/get response.
 */
export interface PlaidAccountData {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: "depository" | "credit" | "loan" | "investment" | "other";
  subtype: string | null;
  balance_current: number | null;
  balance_available: number | null;
}

/**
 * Result of a cursor-based transaction sync operation.
 */
export interface PlaidSyncResult {
  added: PlaidSyncTransaction[];
  modified: PlaidSyncTransaction[];
  removed: PlaidRemovedTransaction[];
  cursor: string;
  has_more: boolean;
}

/**
 * A transaction from the /transactions/sync response.
 */
export interface PlaidSyncTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  name: string;
  merchant_name: string | null;
  date: string; // YYYY-MM-DD
  pending: boolean;
  personal_finance_category: {
    primary: string;
    detailed: string;
  } | null;
}

/**
 * A removed transaction reference from /transactions/sync.
 */
export interface PlaidRemovedTransaction {
  transaction_id: string;
}

/**
 * Sync status derived from bank_connections.status + last_synced_at.
 * - syncing: initial sync after connecting, before first sync completes
 * - synced: connected + recent sync (within 24 hours)
 * - stale: connected + old sync (over 24 hours)
 * - error: bank connection has an error status
 */
export type SyncStatus = "syncing" | "synced" | "stale" | "error";

/**
 * Result returned from the full exchange-and-store flow.
 */
export interface ExchangeResult {
  bankConnectionId: string;
  accounts: Array<{
    id: string;
    name: string;
    subtype: string | null;
    balance_cents: number;
  }>;
}

/**
 * Result returned from a sync operation.
 */
export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  cursor: string;
}
