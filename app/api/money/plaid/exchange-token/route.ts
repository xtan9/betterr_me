import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHousehold } from "@/lib/db/households";
import { exchangeAndStore } from "@/lib/plaid/token-exchange";
import { exchangeTokenSchema } from "@/lib/validations/plaid";
import { log } from "@/lib/logger";

/**
 * POST /api/money/plaid/exchange-token
 * Exchange a Plaid Link public_token for an access_token.
 * Stores the access_token in Vault and creates bank_connection + account records.
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
    const parsed = exchangeTokenSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const adminClient = createAdminClient();

    const result = await exchangeAndStore(
      parsed.data.public_token,
      householdId,
      user.id,
      adminClient
    );

    return NextResponse.json({
      success: true,
      bank_connection: { id: result.bankConnectionId },
      accounts: result.accounts,
    });
  } catch (error) {
    log.error("POST /api/money/plaid/exchange-token error", error);
    return NextResponse.json(
      { error: "Failed to exchange token" },
      { status: 500 }
    );
  }
}
