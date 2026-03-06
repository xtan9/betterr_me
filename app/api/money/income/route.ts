import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { TransactionsDB } from "@/lib/db";
import { detectIncomePatterns } from "@/lib/money/income-detection";
import { incomeConfirmationSchema } from "@/lib/validations/money";
import { format, subDays } from "date-fns";
import { log } from "@/lib/logger";
import type { ConfirmedIncomePattern } from "@/lib/db/types";

/**
 * GET /api/money/income
 *
 * Returns confirmed income patterns and auto-detected patterns from
 * transaction history.
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

    const dateParam = request.nextUrl.searchParams.get("date");
    const today = dateParam || format(new Date(), "yyyy-MM-dd");
    const todayDate = new Date(today + "T12:00:00");
    const sixMonthsAgo = format(subDays(todayDate, 180), "yyyy-MM-dd");

    // Parallel: fetch confirmed patterns + transaction history for detection
    const transactionsDB = new TransactionsDB(supabase);

    const [confirmedResult, txResult] = await Promise.all([
      supabase
        .from("confirmed_income_patterns")
        .select("*")
        .eq("household_id", householdId),
      transactionsDB.getByHousehold(householdId, {
        dateFrom: sixMonthsAgo,
        dateTo: today,
        limit: 10000,
      }),
    ]);

    if (confirmedResult.error) throw confirmedResult.error;

    const confirmed: ConfirmedIncomePattern[] = confirmedResult.data || [];
    const detected = detectIncomePatterns(txResult.transactions);

    return NextResponse.json({ confirmed, detected });
  } catch (error) {
    log.error("GET /api/money/income error", error);
    return NextResponse.json(
      { error: "Failed to fetch income data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/money/income
 *
 * Confirm an income pattern. Upserts into confirmed_income_patterns
 * by (household_id, merchant_name).
 *
 * Body:
 * - merchant_name: string
 * - amount_cents: number (positive)
 * - frequency: WEEKLY | BIWEEKLY | SEMI_MONTHLY | MONTHLY
 * - next_expected_date: YYYY-MM-DD
 *
 * With action: "dismiss" in body, the pattern is removed (if it existed).
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

    const householdId = await resolveHousehold(supabase, user.id);
    const body = await request.json();

    // Handle dismiss action
    if (body.action === "dismiss" && body.merchant_name) {
      // Delete the pattern if it exists; absence of confirmation = not confirmed
      await supabase
        .from("confirmed_income_patterns")
        .delete()
        .eq("household_id", householdId)
        .eq("merchant_name", body.merchant_name);

      return NextResponse.json({ dismissed: true });
    }

    // Validate confirmation body
    const parsed = incomeConfirmationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Upsert confirmed income pattern (household_id + merchant_name unique)
    const { data: pattern, error: upsertError } = await supabase
      .from("confirmed_income_patterns")
      .upsert(
        {
          household_id: householdId,
          merchant_name: parsed.data.merchant_name,
          amount_cents: parsed.data.amount_cents,
          frequency: parsed.data.frequency,
          next_expected_date: parsed.data.next_expected_date,
          needs_reconfirmation: false,
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: "household_id,merchant_name" }
      )
      .select()
      .single();

    if (upsertError) throw upsertError;

    return NextResponse.json({ pattern });
  } catch (error) {
    log.error("POST /api/money/income error", error);
    return NextResponse.json(
      { error: "Failed to update income pattern" },
      { status: 500 }
    );
  }
}
