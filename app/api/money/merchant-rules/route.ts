import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { MerchantRulesDB } from "@/lib/db";
import { merchantRuleCreateSchema } from "@/lib/validations/money";
import { log } from "@/lib/logger";

/**
 * GET /api/money/merchant-rules
 * List all merchant category rules for the user's household.
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
    const merchantRulesDB = new MerchantRulesDB(supabase);
    const rules = await merchantRulesDB.getByHousehold(householdId);

    return NextResponse.json({ rules });
  } catch (error) {
    log.error("GET /api/money/merchant-rules error", error);
    return NextResponse.json(
      { error: "Failed to fetch merchant rules" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/money/merchant-rules
 * Create a new merchant-to-category mapping rule.
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
    const parsed = merchantRuleCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const merchantRulesDB = new MerchantRulesDB(supabase);
    const rule = await merchantRulesDB.create({
      household_id: householdId,
      merchant_name: parsed.data.merchant_name,
      merchant_name_lower: parsed.data.merchant_name.toLowerCase(),
      category_id: parsed.data.category_id,
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    log.error("POST /api/money/merchant-rules error", error);
    return NextResponse.json(
      { error: "Failed to create merchant rule" },
      { status: 500 }
    );
  }
}
