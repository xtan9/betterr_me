import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HouseholdsDB, resolveHousehold } from "@/lib/db/households";
import { log } from "@/lib/logger";

/**
 * POST /api/money/household/leave
 * Leave the current household (non-owner members only).
 * Creates a new solo household for the departing member.
 */
export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const householdsDB = new HouseholdsDB(supabase);

    // Verify current user is NOT owner (owner can't leave)
    const role = await householdsDB.getMemberRole(householdId, user.id);
    if (role === "owner") {
      return NextResponse.json(
        {
          error:
            "Owner cannot leave the household. Transfer ownership first or remove all members.",
        },
        { status: 400 }
      );
    }

    // Use adminClient for cross-household operations
    const adminClient = createAdminClient();
    await householdsDB.removeMember(householdId, user.id, adminClient);

    // Get the new household_id for the departing member
    const { data: newMembership } = await adminClient
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({
      household_id: newMembership?.household_id,
    });
  } catch (error) {
    log.error("POST /api/money/household/leave error", error);
    return NextResponse.json(
      { error: "Failed to leave household" },
      { status: 500 }
    );
  }
}
