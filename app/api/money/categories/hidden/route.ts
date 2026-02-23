import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { CategoriesDB } from "@/lib/db";
import { log } from "@/lib/logger";
import { z } from "zod";

const hiddenCategorySchema = z.object({
  category_id: z.string().uuid(),
});

/**
 * POST /api/money/categories/hidden
 * Hide a category for the user's household.
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
    const parsed = hiddenCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const categoriesDB = new CategoriesDB(supabase);
    await categoriesDB.hide(householdId, parsed.data.category_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("POST /api/money/categories/hidden error", error);
    return NextResponse.json(
      { error: "Failed to hide category" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/money/categories/hidden
 * Unhide a category for the user's household.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = hiddenCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const categoriesDB = new CategoriesDB(supabase);
    await categoriesDB.unhide(householdId, parsed.data.category_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/money/categories/hidden error", error);
    return NextResponse.json(
      { error: "Failed to unhide category" },
      { status: 500 }
    );
  }
}
