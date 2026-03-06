import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HouseholdsDB, resolveHousehold } from "@/lib/db/households";
import { log } from "@/lib/logger";

/**
 * GET /api/money/household
 * Resolve the authenticated user's household_id.
 * Auto-creates a household on first access (lazy creation).
 * Returns members and pending invitations (owner only).
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
    const householdsDB = new HouseholdsDB(supabase);

    const [role, members] = await Promise.all([
      householdsDB.getMemberRole(householdId, user.id),
      householdsDB.getMembers(householdId),
    ]);

    // Only return invitations if user is owner
    const invitations =
      role === "owner"
        ? await householdsDB.getInvitations(householdId)
        : [];

    return NextResponse.json({
      household_id: householdId,
      user_id: user.id,
      role,
      members,
      invitations,
    });
  } catch (error) {
    log.error("GET /api/money/household error", error);
    return NextResponse.json(
      { error: "Failed to resolve household" },
      { status: 500 }
    );
  }
}
