import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HouseholdsDB } from "@/lib/db";
import { createPlaidClient } from "@/lib/plaid/client";
import {
  getAccessToken,
  removeAccessToken,
} from "@/lib/plaid/token-exchange";
import { deleteMoneyDataSchema } from "@/lib/validations/data-management";
import { log } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Revoke all Plaid access tokens and remove Vault secrets for a household's
 * active bank connections. Gracefully handles individual failures.
 */
async function revokeAllPlaidTokens(
  householdId: string,
  adminClient: SupabaseClient
): Promise<void> {
  const { data: connections, error } = await adminClient
    .from("bank_connections")
    .select("id")
    .eq("household_id", householdId)
    .neq("status", "disconnected");

  if (error) {
    log.warn("Failed to query bank connections for revocation", {
      household_id: householdId,
      error: String(error),
    });
    return;
  }

  if (!connections || connections.length === 0) return;

  const plaidClient = createPlaidClient();

  for (const conn of connections) {
    // Revoke Plaid access
    try {
      const accessToken = await getAccessToken(conn.id, adminClient);
      await plaidClient.itemRemove({ access_token: accessToken });
    } catch (revokeError) {
      log.warn("Failed to revoke Plaid access token during data deletion", {
        bank_connection_id: conn.id,
        error: String(revokeError),
      });
    }

    // Remove from Vault
    try {
      await removeAccessToken(conn.id, adminClient);
    } catch (vaultError) {
      log.warn("Failed to remove access token from Vault during data deletion", {
        bank_connection_id: conn.id,
        error: String(vaultError),
      });
    }
  }
}

/**
 * POST /api/money/delete-data
 * Delete all money data for the authenticated user.
 *
 * Requires body: { confirmation: "DELETE" }
 *
 * Flow:
 * - Revokes all Plaid tokens and removes Vault secrets
 * - For multi-member households: leaves household, creates solo household, then deletes it
 * - For solo households: deletes household directly (CASCADE cleans up data)
 * - Returns { success: true }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate confirmation
    const body = await request.json();
    const parsed = deleteMoneyDataSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Resolve household
    const householdsDB = new HouseholdsDB(supabase);
    const householdId = await householdsDB.resolveHousehold(user.id);
    const memberCount = await householdsDB.getMemberCount(householdId);

    const adminClient = createAdminClient();

    if (memberCount > 1) {
      // Multi-member: leave household first, then delete the new solo household
      await householdsDB.removeMember(householdId, user.id, adminClient);

      // Resolve the new solo household created by removeMember
      const adminHouseholdsDB = new HouseholdsDB(adminClient);
      const newHouseholdId = await adminHouseholdsDB.resolveHousehold(user.id);

      // Revoke Plaid tokens on the new household (user's connections moved there)
      await revokeAllPlaidTokens(newHouseholdId, adminClient);

      // Delete membership then household
      await adminClient
        .from("household_members")
        .delete()
        .eq("user_id", user.id);

      await adminClient
        .from("households")
        .delete()
        .eq("id", newHouseholdId);
    } else {
      // Solo user: revoke tokens and delete household directly
      await revokeAllPlaidTokens(householdId, adminClient);

      // Delete membership first (no FK cascade from households to members)
      await adminClient
        .from("household_members")
        .delete()
        .eq("household_id", householdId);

      // Delete household — CASCADE removes accounts, transactions, budgets, etc.
      await adminClient
        .from("households")
        .delete()
        .eq("id", householdId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("POST /api/money/delete-data error", error);
    return NextResponse.json(
      { error: "Failed to delete money data" },
      { status: 500 }
    );
  }
}
