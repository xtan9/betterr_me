import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlaidClient } from "@/lib/plaid/client";
import { BankConnectionsDB, MoneyAccountsDB } from "@/lib/db";
import {
  getAccessToken,
  removeAccessToken,
} from "@/lib/plaid/token-exchange";
import { log } from "@/lib/logger";
import { z } from "zod";

const disconnectSchema = z.object({
  keep_transactions: z.boolean(),
});

/**
 * POST /api/money/accounts/[id]/disconnect
 * Disconnect a bank connection: revoke Plaid access, remove Vault secret,
 * optionally delete Plaid-sourced transactions.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = disconnectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const bankConnectionsDB = new BankConnectionsDB(supabase);
    const bankConnection = await bankConnectionsDB.getById(id);

    if (!bankConnection) {
      return NextResponse.json(
        { error: "Bank connection not found" },
        { status: 404 }
      );
    }

    const adminClient = createAdminClient();

    // Revoke Plaid access
    try {
      const accessToken = await getAccessToken(id, adminClient);
      const plaidClient = createPlaidClient();
      await plaidClient.itemRemove({ access_token: accessToken });
    } catch (revokeError) {
      // Log but continue — the connection should still be disconnected locally
      log.warn("Failed to revoke Plaid access token", {
        bank_connection_id: id,
        error: String(revokeError),
      });
    }

    // Remove access token from Vault
    try {
      await removeAccessToken(id, adminClient);
    } catch (vaultError) {
      log.warn("Failed to remove access token from Vault", {
        bank_connection_id: id,
        error: String(vaultError),
      });
    }

    // Optionally delete Plaid-sourced transactions
    if (!parsed.data.keep_transactions) {
      const accountsDB = new MoneyAccountsDB(supabase);
      const accounts = await accountsDB.getByBankConnection(id);
      const accountIds = accounts.map((a) => a.id);

      if (accountIds.length > 0) {
        const { error: deleteError } = await adminClient
          .from("transactions")
          .delete()
          .in("account_id", accountIds)
          .eq("source", "plaid");

        if (deleteError) throw deleteError;
      }
    }

    // Update bank_connection status
    await bankConnectionsDB.updateStatus(id, "disconnected");

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("POST /api/money/accounts/[id]/disconnect error", error);
    return NextResponse.json(
      { error: "Failed to disconnect bank connection" },
      { status: 500 }
    );
  }
}
