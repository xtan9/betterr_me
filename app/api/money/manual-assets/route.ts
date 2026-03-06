import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { ManualAssetsDB, MoneyAccountsDB, NetWorthSnapshotsDB } from "@/lib/db";
import { manualAssetCreateSchema } from "@/lib/validations/goals";
import { toCents } from "@/lib/money/arithmetic";
import { getLocalDateString } from "@/lib/utils";
import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET /api/money/manual-assets
// ---------------------------------------------------------------------------

/**
 * GET /api/money/manual-assets
 * List all manual assets for the household.
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
    const assetsDB = new ManualAssetsDB(supabase);

    const assets = await assetsDB.getByHousehold(householdId);

    return NextResponse.json({ assets });
  } catch (error) {
    log.error("GET /api/money/manual-assets error", error);
    return NextResponse.json(
      { error: "Failed to fetch manual assets" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/money/manual-assets
// ---------------------------------------------------------------------------

/**
 * POST /api/money/manual-assets
 * Create a new manual asset.
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
    const parsed = manualAssetCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);
    const assetsDB = new ManualAssetsDB(supabase);

    const asset = await assetsDB.create({
      household_id: householdId,
      name: parsed.data.name,
      value_cents: toCents(parsed.data.value),
      asset_type: parsed.data.asset_type,
      notes: parsed.data.notes ?? null,
    });

    // Non-blocking net worth snapshot after manual asset mutation
    try {
      const accountsDB = new MoneyAccountsDB(supabase);
      const snapshotsDB = new NetWorthSnapshotsDB(supabase);
      const [allAccounts, allAssets] = await Promise.all([
        accountsDB.getByHousehold(householdId),
        assetsDB.getByHousehold(householdId),
      ]);
      let assetsCents = 0;
      let liabilitiesCents = 0;
      for (const account of allAccounts) {
        if (account.balance_cents >= 0) assetsCents += account.balance_cents;
        else liabilitiesCents += Math.abs(account.balance_cents);
      }
      for (const a of allAssets) {
        assetsCents += a.value_cents;
      }
      await snapshotsDB.upsert(
        householdId,
        getLocalDateString(),
        assetsCents - liabilitiesCents,
        assetsCents,
        liabilitiesCents
      );
    } catch (snapshotError) {
      log.warn(
        "Net worth snapshot failed after manual asset create (non-blocking)",
        { error: snapshotError }
      );
    }

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    log.error("POST /api/money/manual-assets error", error);
    return NextResponse.json(
      { error: "Failed to create manual asset" },
      { status: 500 }
    );
  }
}
