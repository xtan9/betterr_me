import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { BudgetsDB, CategoriesDB } from "@/lib/db";
import {
  spendingQuerySchema,
  trendQuerySchema,
} from "@/lib/validations/budget";
import { log } from "@/lib/logger";

/**
 * GET /api/money/analytics/spending
 *
 * Two modes:
 * 1. ?month=YYYY-MM — Returns spending by category for a specific month.
 * 2. ?type=trends&months=12 — Returns monthly spending totals for last N months.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const budgetsDB = new BudgetsDB(supabase);
    const searchParams = request.nextUrl.searchParams;

    const type = searchParams.get("type");

    // Mode 2: Spending trends (multi-month)
    if (type === "trends") {
      const parsed = trendQuerySchema.safeParse({
        months: searchParams.get("months"),
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const rawTrends = await budgetsDB.getSpendingTrends(
        householdId,
        parsed.data.months
      );

      // Aggregate into { month, total_cents, categories[] }
      const monthMap = new Map<
        string,
        {
          month: string;
          total_cents: number;
          categories: { category_id: string; total_cents: number }[];
        }
      >();

      for (const row of rawTrends) {
        const existing = monthMap.get(row.month);
        if (existing) {
          existing.total_cents += row.total_cents;
          existing.categories.push({
            category_id: row.category_id,
            total_cents: row.total_cents,
          });
        } else {
          monthMap.set(row.month, {
            month: row.month,
            total_cents: row.total_cents,
            categories: [
              {
                category_id: row.category_id,
                total_cents: row.total_cents,
              },
            ],
          });
        }
      }

      // Sort trends by month ascending
      const trends = Array.from(monthMap.values()).sort((a, b) =>
        a.month.localeCompare(b.month)
      );

      return NextResponse.json({ trends });
    }

    // Mode 1: Spending by category for a specific month (default)
    const month = searchParams.get("month");
    const parsed = spendingQuerySchema.safeParse({ month });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const dateFrom = `${parsed.data.month}-01`;
    const monthDate = new Date(dateFrom + "T00:00:00");
    const nextMonth = new Date(monthDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const dateTo = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

    const rawSpending = await budgetsDB.getSpendingByCategory(
      householdId,
      dateFrom,
      dateTo
    );

    // Enrich with category display info
    const categoriesDB = new CategoriesDB(supabase);
    const categories = await categoriesDB.getVisible(householdId);
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const spending = rawSpending.map((s) => {
      const cat = categoryMap.get(s.category_id);
      return {
        category_id: s.category_id,
        category_name: cat?.name ?? "Unknown",
        category_icon: cat?.icon ?? null,
        category_color: cat?.color ?? null,
        total_cents: s.total_cents,
      };
    });

    return NextResponse.json({ spending });
  } catch (error) {
    log.error("GET /api/money/analytics/spending error", error);
    return NextResponse.json(
      { error: "Failed to fetch spending analytics" },
      { status: 500 }
    );
  }
}
