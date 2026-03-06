import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHousehold } from "@/lib/db/households";
import { BankConnectionsDB, RecurringBillsDB } from "@/lib/db";
import { getAccessToken } from "@/lib/plaid/token-exchange";
import { fetchRecurringTransactions } from "@/lib/plaid/recurring";
import { log } from "@/lib/logger";

/**
 * POST /api/money/bills/sync
 * Trigger Plaid recurring transaction sync for all connected bank accounts.
 * Fetches detected recurring charges and upserts them as bills.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const adminClient = createAdminClient();
    const connectionsDB = new BankConnectionsDB(adminClient);
    const billsDB = new RecurringBillsDB(adminClient);

    // Fetch all bank connections for the household
    const connections = await connectionsDB.getByHousehold(householdId);
    const activeConnections = connections.filter(
      (c) => c.status === "connected"
    );

    let totalBillsFound = 0;

    for (const connection of activeConnections) {
      try {
        // Get decrypted access token from Vault
        const accessToken = await getAccessToken(connection.id, adminClient);

        // Fetch recurring transactions from Plaid
        const { outflows } = await fetchRecurringTransactions(accessToken);

        if (outflows.length === 0) continue;

        // Map Plaid account_ids to our internal account UUIDs
        const plaidAccountIds = [
          ...new Set(outflows.map((b) => b.account_id)),
        ];
        const { data: accounts, error: accError } = await adminClient
          .from("accounts")
          .select("id, plaid_account_id")
          .eq("bank_connection_id", connection.id)
          .in("plaid_account_id", plaidAccountIds);

        if (accError) throw accError;

        const accountMap = new Map(
          (accounts || []).map(
            (a: { plaid_account_id: string; id: string }) => [
              a.plaid_account_id,
              a.id,
            ]
          )
        );

        // Only include bills where account_id was successfully mapped
        const validBills = outflows
          .filter((bill) => accountMap.has(bill.account_id))
          .map((bill) => ({
            ...bill,
            account_id: accountMap.get(bill.account_id)!,
          }));

        if (validBills.length > 0) {
          await billsDB.upsertFromPlaid(householdId, validBills);
          totalBillsFound += validBills.length;
        }
      } catch (connError) {
        // Log but don't fail on individual connection errors
        // (some connections may have expired tokens)
        log.warn("Bills sync failed for connection", {
          connectionId: connection.id,
          institution: connection.institution_name,
          error:
            connError instanceof Error ? connError.message : String(connError),
        });
      }
    }

    return NextResponse.json({ synced: true, bills_found: totalBillsFound });
  } catch (error) {
    log.error("POST /api/money/bills/sync error", error);
    return NextResponse.json(
      { error: "Failed to sync bills" },
      { status: 500 }
    );
  }
}
