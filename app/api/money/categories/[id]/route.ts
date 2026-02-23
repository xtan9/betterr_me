import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { CategoriesDB } from "@/lib/db";
import { categoryUpdateSchema } from "@/lib/validations/money";
import { log } from "@/lib/logger";

/**
 * PATCH /api/money/categories/[id]
 * Update a custom (non-system) category.
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

    const { id } = await params;

    const body = await request.json();
    const parsed = categoryUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const categoriesDB = new CategoriesDB(supabase);

    // Verify category exists and is not a system category
    const allCategories = await categoriesDB.getAll(householdId);
    const existing = allCategories.find((c) => c.id === id);

    if (!existing) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    if (existing.is_system) {
      return NextResponse.json(
        { error: "Cannot update system categories" },
        { status: 400 }
      );
    }

    const category = await categoriesDB.update(id, parsed.data);

    return NextResponse.json({ category });
  } catch (error) {
    log.error("PATCH /api/money/categories/[id] error", error);
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/money/categories/[id]
 * Delete a custom (non-system) category.
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
    const categoriesDB = new CategoriesDB(supabase);

    // CategoriesDB.delete already verifies is_system = false and throws if system
    try {
      await categoriesDB.delete(id);
    } catch (deleteError) {
      if (
        deleteError instanceof Error &&
        deleteError.message === "Cannot delete system categories"
      ) {
        return NextResponse.json(
          { error: "Cannot delete system categories" },
          { status: 400 }
        );
      }
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/money/categories/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
}
