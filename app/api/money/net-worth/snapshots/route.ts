import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { NetWorthSnapshotsDB } from "@/lib/db";
import { log } from "@/lib/logger";
import { subDays, format } from "date-fns";

// ---------------------------------------------------------------------------
// Period mapping
// ---------------------------------------------------------------------------

const PERIOD_DAYS: Record<string, number | null> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  ALL: null,
};

// ---------------------------------------------------------------------------
// GET /api/money/net-worth/snapshots
// ---------------------------------------------------------------------------

/**
 * GET /api/money/net-worth/snapshots?period=3M
 * Get historical net worth snapshots with timeframe filtering.
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

    const period = request.nextUrl.searchParams.get("period") || "3M";

    if (!(period in PERIOD_DAYS)) {
      return NextResponse.json(
        { error: "Invalid period. Use 1M, 3M, 6M, 1Y, or ALL" },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const snapshotsDB = new NetWorthSnapshotsDB(supabase);

    const today = new Date();
    const toDate = format(today, "yyyy-MM-dd");

    const days = PERIOD_DAYS[period];
    const fromDate = days
      ? format(subDays(today, days), "yyyy-MM-dd")
      : "1900-01-01"; // ALL: effectively no lower bound

    const snapshots = await snapshotsDB.getHistory(
      householdId,
      fromDate,
      toDate
    );

    // Format snapshot dates for chart display
    const formattedSnapshots = snapshots.map((s) => ({
      ...s,
      label: format(new Date(s.snapshot_date), "MMM yyyy"),
    }));

    return NextResponse.json({ snapshots: formattedSnapshots });
  } catch (error) {
    log.error("GET /api/money/net-worth/snapshots error", error);
    return NextResponse.json(
      { error: "Failed to fetch snapshots" },
      { status: 500 }
    );
  }
}
