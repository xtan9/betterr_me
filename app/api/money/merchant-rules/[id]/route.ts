import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { MerchantRulesDB } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * DELETE /api/money/merchant-rules/[id]
 * Delete a merchant category rule.
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

    const { id } = await params;

    await resolveHousehold(supabase, user.id);
    const merchantRulesDB = new MerchantRulesDB(supabase);
    await merchantRulesDB.delete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/money/merchant-rules/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete merchant rule" },
      { status: 500 }
    );
  }
}
