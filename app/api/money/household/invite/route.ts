import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HouseholdsDB, resolveHousehold } from "@/lib/db/households";
import { inviteSchema } from "@/lib/validations/household";
import { log } from "@/lib/logger";

/**
 * POST /api/money/household/invite
 * Send a household invitation (owner only).
 * Creates an invitation record with a shareable token.
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

    const body = await request.json();
    const parsed = inviteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const householdsDB = new HouseholdsDB(supabase);

    // Verify user is owner
    const role = await householdsDB.getMemberRole(householdId, user.id);
    if (role !== "owner") {
      return NextResponse.json(
        { error: "Only the household owner can send invitations" },
        { status: 403 }
      );
    }

    // Check household size limit (max 5)
    const memberCount = await householdsDB.getMemberCount(householdId);
    if (memberCount >= 5) {
      return NextResponse.json(
        { error: "Household has reached the maximum of 5 members" },
        { status: 400 }
      );
    }

    // Check if invited email is already a member
    const members = await householdsDB.getMembers(householdId);
    const alreadyMember = members.some(
      (m) => m.email.toLowerCase() === parsed.data.email.toLowerCase()
    );
    if (alreadyMember) {
      return NextResponse.json(
        { error: "This person is already a member of your household" },
        { status: 409 }
      );
    }

    // Create invitation using adminClient (needs to bypass RLS for insert)
    const adminClient = createAdminClient();
    const adminHouseholdsDB = new HouseholdsDB(adminClient);
    const invitation = await adminHouseholdsDB.createInvite(
      householdId,
      user.id,
      parsed.data.email
    );

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    // Handle duplicate invitation
    if (error instanceof Error && error.message.includes("already been sent")) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    log.error("POST /api/money/household/invite error", error);
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 }
    );
  }
}
