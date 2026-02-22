import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlaidClient } from "@/lib/plaid/client";
import { verifyPlaidWebhook } from "@/lib/plaid/webhooks";
import { syncTransactions } from "@/lib/plaid/sync";
import { getAccessToken } from "@/lib/plaid/token-exchange";
import { webhookPayloadSchema } from "@/lib/validations/plaid";
import { log } from "@/lib/logger";

/**
 * POST /api/money/plaid/webhook
 * Receive and process Plaid webhook events.
 * NO auth check — webhooks come from Plaid, verified via JWT/ES256.
 */
export async function POST(request: NextRequest) {
  try {
    // Read raw body as text for hash verification
    const body = await request.text();
    const plaidVerification = request.headers.get("Plaid-Verification") || "";

    const plaidClient = createPlaidClient();
    const isValid = await verifyPlaidWebhook(
      body,
      plaidVerification,
      plaidClient
    );

    if (!isValid) {
      log.warn("Plaid webhook verification failed");
      return NextResponse.json(
        { error: "Webhook verification failed" },
        { status: 401 }
      );
    }

    // Parse body as JSON after verification
    const payload = JSON.parse(body);
    const parsed = webhookPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      log.warn("Plaid webhook payload validation failed", {
        errors: parsed.error.flatten(),
      });
      // Still return 200 to prevent Plaid retries for malformed payloads
      return NextResponse.json({ received: true });
    }

    const { webhook_type, webhook_code, item_id } = parsed.data;
    log.info("Plaid webhook received", { webhook_type, webhook_code, item_id });

    const adminClient = createAdminClient();

    if (webhook_type === "TRANSACTIONS") {
      if (
        webhook_code === "SYNC_UPDATES_AVAILABLE" ||
        webhook_code === "INITIAL_UPDATE" ||
        webhook_code === "HISTORICAL_UPDATE"
      ) {
        // Look up bank_connection by plaid_item_id
        const { data: bankConnection, error: bcError } = await adminClient
          .from("bank_connections")
          .select("id, household_id, sync_cursor")
          .eq("plaid_item_id", item_id)
          .eq("status", "connected")
          .single();

        if (bcError || !bankConnection) {
          log.warn("Webhook: bank connection not found for item", { item_id });
          return NextResponse.json({ received: true });
        }

        try {
          const accessToken = await getAccessToken(
            bankConnection.id,
            adminClient
          );
          await syncTransactions(
            accessToken,
            bankConnection.sync_cursor,
            bankConnection.id,
            bankConnection.household_id,
            adminClient
          );
          log.info("Webhook: transaction sync completed", {
            bank_connection_id: bankConnection.id,
          });
        } catch (syncError) {
          log.error("Webhook: transaction sync failed", syncError, {
            bank_connection_id: bankConnection.id,
          });
        }
      }
    } else if (webhook_type === "ITEM") {
      if (webhook_code === "ERROR") {
        const errorCode = payload.error?.error_code || "UNKNOWN";
        const errorMessage =
          payload.error?.error_message || "An error occurred";

        await adminClient
          .from("bank_connections")
          .update({
            status: "error",
            error_code: errorCode,
            error_message: errorMessage,
          })
          .eq("plaid_item_id", item_id);

        log.warn("Webhook: item error", { item_id, errorCode, errorMessage });
      } else if (webhook_code === "PENDING_EXPIRATION") {
        await adminClient
          .from("bank_connections")
          .update({
            status: "error",
            error_code: "PENDING_EXPIRATION",
            error_message:
              "Bank connection access will expire soon. Please re-authenticate.",
          })
          .eq("plaid_item_id", item_id);

        log.warn("Webhook: item pending expiration", { item_id });
      }
    }

    // Always return 200 quickly to acknowledge receipt
    return NextResponse.json({ received: true });
  } catch (error) {
    log.error("POST /api/money/plaid/webhook error", error);
    // Return 200 even on error to prevent Plaid retries for our internal failures
    return NextResponse.json({ received: true });
  }
}
