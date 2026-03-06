import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { MoneyAccountsDB } from "@/lib/db";
import { visibilityChangeSchema } from "@/lib/validations/household";
import { log } from "@/lib/logger";

/**
 * PATCH /api/money/accounts/[id]/visibility
 * Change account visibility (mine/ours/hidden).
 * Either household member can change any account's visibility.
 * When going mine -> ours: sets shared_since, bulk-hides historical transactions.
 * When going ours -> mine: clears shared_since.
 */
export async function PATCH(
  request: NextRequest,
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

    const { id: accountId } = await params;

    const body = await request.json();
    const parsed = visibilityChangeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const accountsDB = new MoneyAccountsDB(supabase);

    // Verify account belongs to this household
    const account = await accountsDB.getById(accountId);
    if (!account || account.household_id !== householdId) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const updated = await accountsDB.updateVisibility(
      accountId,
      parsed.data.visibility,
      householdId
    );

    return NextResponse.json({ account: updated });
  } catch (error) {
    log.error("PATCH /api/money/accounts/[id]/visibility error", error);
    return NextResponse.json(
      { error: "Failed to update account visibility" },
      { status: 500 }
    );
  }
}
