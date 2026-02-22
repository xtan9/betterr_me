import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken } from "@/lib/plaid/token-exchange";
import { syncTransactions } from "@/lib/plaid/sync";
import { log } from "@/lib/logger";

/**
 * GET /api/cron/sync-transactions
 * Vercel Cron job: sync transactions for all connected bank connections.
 * Runs every 6 hours as a safety net for missed webhooks.
 * Protected by CRON_SECRET bearer token.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get("Authorization");
    const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

    if (!authHeader || authHeader !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Get all connected bank connections
    const { data: connections, error: connError } = await adminClient
      .from("bank_connections")
      .select("id, household_id, sync_cursor")
      .eq("status", "connected");

    if (connError) throw connError;

    let synced = 0;
    let errors = 0;

    for (const conn of connections || []) {
      try {
        const accessToken = await getAccessToken(conn.id, adminClient);
        await syncTransactions(
          accessToken,
          conn.sync_cursor,
          conn.id,
          conn.household_id,
          adminClient
        );
        synced++;
      } catch (syncError) {
        errors++;
        log.error("Cron sync failed for connection", syncError, {
          bank_connection_id: conn.id,
        });

        // Update status to error but continue to next connection
        await adminClient
          .from("bank_connections")
          .update({
            status: "error",
            error_code: "SYNC_FAILED",
            error_message:
              syncError instanceof Error
                ? syncError.message
                : "Sync failed during cron job",
          })
          .eq("id", conn.id);
      }
    }

    log.info("Cron sync completed", { synced, errors });
    return NextResponse.json({ synced, errors });
  } catch (error) {
    log.error("GET /api/cron/sync-transactions error", error);
    return NextResponse.json(
      { error: "Cron sync failed" },
      { status: 500 }
    );
  }
}
