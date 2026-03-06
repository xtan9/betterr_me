import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { BankConnectionsDB, MoneyAccountsDB } from "@/lib/db";
import type { BankConnection, MoneyAccount } from "@/lib/db/types";
import type { SyncStatus } from "@/lib/plaid/types";
import { log } from "@/lib/logger";

/**
 * Derive sync status from a bank connection's state.
 */
function deriveSyncStatus(conn: BankConnection): SyncStatus {
  if (conn.status === "error") return "error";

  if (conn.status === "connected") {
    // Initial sync: no cursor and never synced
    if (!conn.last_synced_at && !conn.sync_cursor) return "syncing";

    // Check if synced within last 24 hours
    if (conn.last_synced_at) {
      const lastSynced = new Date(conn.last_synced_at).getTime();
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (lastSynced > twentyFourHoursAgo) return "synced";
    }

    // Connected but stale
    return "stale";
  }

  // Default for disconnected or other statuses
  return "error";
}

/**
 * GET /api/money/accounts
 * List all accounts grouped by bank connection with sync status and net worth.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const bankConnectionsDB = new BankConnectionsDB(supabase);
    const accountsDB = new MoneyAccountsDB(supabase);

    const connections = await bankConnectionsDB.getByHousehold(householdId);
    const allAccounts = await accountsDB.getByHousehold(householdId);

    // Group accounts by bank_connection_id
    const accountsByConnection = new Map<string, MoneyAccount[]>();
    const standaloneAccounts: MoneyAccount[] = [];

    for (const account of allAccounts) {
      if (account.bank_connection_id) {
        const existing = accountsByConnection.get(
          account.bank_connection_id
        ) || [];
        existing.push(account);
        accountsByConnection.set(account.bank_connection_id, existing);
      } else {
        standaloneAccounts.push(account);
      }
    }

    const groupedConnections = connections.map((conn) => ({
      id: conn.id,
      institution_name: conn.institution_name,
      institution_id: conn.institution_id,
      status: conn.status,
      sync_status: deriveSyncStatus(conn),
      last_synced_at: conn.last_synced_at,
      error_code: conn.error_code,
      error_message: conn.error_message,
      accounts: (accountsByConnection.get(conn.id) || []).map((acc) => ({
        id: acc.id,
        name: acc.name,
        account_type: acc.account_type,
        balance_cents: acc.balance_cents,
        mask: acc.mask,
        is_hidden: acc.is_hidden,
      })),
    }));

    // Calculate net worth from all accounts (including standalone)
    let netWorthCents = 0;
    for (const account of allAccounts) {
      if (!account.is_hidden) {
        netWorthCents += account.balance_cents;
      }
    }

    return NextResponse.json({
      connections: groupedConnections,
      standalone_accounts: standaloneAccounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
        account_type: acc.account_type,
        balance_cents: acc.balance_cents,
        is_hidden: acc.is_hidden,
      })),
      net_worth_cents: netWorthCents,
    });
  } catch (error) {
    log.error("GET /api/money/accounts error", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
