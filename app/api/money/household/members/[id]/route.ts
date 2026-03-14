import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HouseholdsDB, resolveHousehold } from "@/lib/db/households";
import { log } from "@/lib/logger";

/**
 * DELETE /api/money/household/members/[id]
 * Remove a member from the household (owner only).
 * Creates a new solo household for the departing member.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: targetUserId } = await params;
    const householdId = await resolveHousehold(supabase, user.id);
    const householdsDB = new HouseholdsDB(supabase);

    // Verify current user is owner
    const role = await householdsDB.getMemberRole(householdId, user.id);
    if (role !== "owner") {
      return NextResponse.json(
        { error: "Only the household owner can remove members" },
        { status: 403 }
      );
    }

    // Owner cannot remove themselves
    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: "Owner cannot remove themselves. Transfer ownership or delete the household." },
        { status: 400 }
      );
    }

    // Verify target is a member of this household
    const targetRole = await householdsDB.getMemberRole(
      householdId,
      targetUserId
    );
    if (!targetRole) {
      return NextResponse.json(
        { error: "User is not a member of this household" },
        { status: 404 }
      );
    }

    // Use adminClient for cross-household operations
    const adminClient = createAdminClient();
    await householdsDB.removeMember(householdId, targetUserId, adminClient);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("DELETE /api/money/household/members/[id] error", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
