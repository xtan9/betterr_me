import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HouseholdsDB } from "@/lib/db/households";
import { log } from "@/lib/logger";
import { z } from "zod";

const acceptSchema = z.object({
  token: z.string().uuid(),
});

/**
 * POST /api/money/household/accept
 * Accept a household invitation using a token.
 * Handles merge flow for existing solo household users.
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
    const parsed = acceptSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check if user is already in a multi-member household
    const householdsDB = new HouseholdsDB(supabase);
    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .single();

    if (membershipError && membershipError.code !== "PGRST116") {
      throw membershipError;
    }

    if (membership) {
      const memberCount = await householdsDB.getMemberCount(
        membership.household_id
      );
      if (memberCount > 1) {
        return NextResponse.json(
          {
            error:
              "You are already in a multi-member household. Leave first to accept a new invitation.",
          },
          { status: 400 }
        );
      }
    }

    // Use adminClient for cross-household merge operations
    const adminClient = createAdminClient();
    const adminHouseholdsDB = new HouseholdsDB(adminClient);

    await adminHouseholdsDB.acceptInvite(
      parsed.data.token,
      user.id,
      adminClient
    );

    // Get the new household_id after acceptance
    const { data: newMembership, error: newMembershipError } = await adminClient
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .single();

    if (newMembershipError) throw newMembershipError;

    return NextResponse.json({
      household_id: newMembership?.household_id,
    });
  } catch (error) {
    // Handle known error cases
    if (error instanceof Error) {
      if (error.message.includes("Invalid or expired")) {
        return NextResponse.json(
          { error: "Invalid or expired invitation" },
          { status: 400 }
        );
      }
      if (error.message.includes("maximum of 5")) {
        return NextResponse.json(
          { error: "Household has reached the maximum of 5 members" },
          { status: 400 }
        );
      }
    }

    log.error("POST /api/money/household/accept error", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
