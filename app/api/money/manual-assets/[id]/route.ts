import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import {
  ManualAssetsDB,
  MoneyAccountsDB,
  NetWorthSnapshotsDB,
} from "@/lib/db";
import { manualAssetUpdateSchema } from "@/lib/validations/goals";
import { toCents } from "@/lib/money/arithmetic";
import { getLocalDateString } from "@/lib/utils";
import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// PATCH /api/money/manual-assets/[id]
// ---------------------------------------------------------------------------

/**
 * PATCH /api/money/manual-assets/[id]
 * Update a manual asset.
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
    const parsed = manualAssetUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const householdId = await resolveHousehold(supabase, user.id);

    // Verify ownership
    const { error: lookupError } = await supabase
      .from("manual_assets")
      .select("id")
      .eq("id", id)
      .eq("household_id", householdId)
      .single();

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Asset not found" },
          { status: 404 }
        );
      }
      throw lookupError;
    }

    const assetsDB = new ManualAssetsDB(supabase);

    // Build update payload, converting amounts if present
    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.value !== undefined)
      updates.value_cents = toCents(parsed.data.value);
    if (parsed.data.asset_type !== undefined)
      updates.asset_type = parsed.data.asset_type;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

    const asset = await assetsDB.update(id, updates);

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
        "Net worth snapshot failed after manual asset update (non-blocking)",
        { error: snapshotError }
      );
    }

    return NextResponse.json({ asset });
  } catch (error) {
    log.error("PATCH /api/money/manual-assets/[id] error", error);
    return NextResponse.json(
      { error: "Failed to update manual asset" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/money/manual-assets/[id]
// ---------------------------------------------------------------------------

/**
 * DELETE /api/money/manual-assets/[id]
 * Delete a manual asset.
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
    const householdId = await resolveHousehold(supabase, user.id);

    // Verify ownership
    const { error: lookupError } = await supabase
      .from("manual_assets")
      .select("id")
      .eq("id", id)
      .eq("household_id", householdId)
      .single();

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Asset not found" },
          { status: 404 }
        );
      }
      throw lookupError;
    }

    const assetsDB = new ManualAssetsDB(supabase);
    await assetsDB.delete(id);

    // Non-blocking net worth snapshot after manual asset deletion
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
        "Net worth snapshot failed after manual asset delete (non-blocking)",
        { error: snapshotError }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("DELETE /api/money/manual-assets/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete manual asset" },
      { status: 500 }
    );
  }
}
