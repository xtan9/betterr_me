import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { CategoriesDB } from "@/lib/db";
import { categoryCreateSchema } from "@/lib/validations/money";
import { log } from "@/lib/logger";

/**
 * GET /api/money/categories
 * List visible categories (system + custom, minus hidden) for the user's household.
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
    const categoriesDB = new CategoriesDB(supabase);
    const categories = await categoriesDB.getVisible(householdId);

    return NextResponse.json({ categories });
  } catch (error) {
    log.error("GET /api/money/categories error", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/money/categories
 * Create a custom category for the user's household.
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
    const parsed = categoryCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const categoriesDB = new CategoriesDB(supabase);
    const category = await categoriesDB.create({
      name: parsed.data.name,
      icon: parsed.data.icon ?? null,
      color: parsed.data.color ?? null,
      display_name: parsed.data.display_name ?? null,
      household_id: householdId,
      is_system: false,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    log.error("POST /api/money/categories error", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
