import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlaidClient } from "@/lib/plaid/client";
import { Products, CountryCode } from "plaid";
import { log } from "@/lib/logger";

/**
 * POST /api/money/plaid/create-link-token
 * Generate a Plaid Link token for the authenticated user.
 * The client uses this token to initialize Plaid Link in the browser.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const plaid = createPlaidClient();

    const response = await plaid.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "BetterR.Me",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/money/plaid/webhook`,
      ...(process.env.PLAID_REDIRECT_URI
        ? { redirect_uri: process.env.PLAID_REDIRECT_URI }
        : {}),
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    log.error("POST /api/money/plaid/create-link-token error", error);
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 500 }
    );
  }
}
