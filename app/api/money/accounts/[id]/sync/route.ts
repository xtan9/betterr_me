import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BankConnectionsDB } from "@/lib/db";
import { getAccessToken } from "@/lib/plaid/token-exchange";
import { syncTransactions } from "@/lib/plaid/sync";
import { log } from "@/lib/logger";

/**
 * POST /api/money/accounts/[id]/sync
 * Manually trigger a transaction sync for a specific bank connection.
 */
export async function POST(
  _request: NextRequest,
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

    const bankConnectionsDB = new BankConnectionsDB(supabase);
    const bankConnection = await bankConnectionsDB.getById(id);

    if (!bankConnection) {
      return NextResponse.json(
        { error: "Bank connection not found" },
        { status: 404 }
      );
    }

    if (bankConnection.status !== "connected") {
      return NextResponse.json(
        { error: "Bank connection is not in connected status" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const accessToken = await getAccessToken(id, adminClient);

    const result = await syncTransactions(
      accessToken,
      bankConnection.sync_cursor,
      id,
      bankConnection.household_id,
      adminClient
    );

    return NextResponse.json({
      success: true,
      transactions_synced: result.added + result.modified + result.removed,
    });
  } catch (error) {
    log.error("POST /api/money/accounts/[id]/sync error", error);
    return NextResponse.json(
      { error: "Failed to sync transactions" },
      { status: 500 }
    );
  }
}
