import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";
import { MoneyAccountsDB, ManualAssetsDB, NetWorthSnapshotsDB } from "@/lib/db";
import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET /api/money/net-worth
// ---------------------------------------------------------------------------

/**
 * GET /api/money/net-worth
 * Compute current net worth with asset/liability breakdown by account type.
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
    const accountsDB = new MoneyAccountsDB(supabase);
    const manualAssetsDB = new ManualAssetsDB(supabase);
    const snapshotsDB = new NetWorthSnapshotsDB(supabase);

    // 1. Get all accounts and manual assets
    const [accounts, manualAssets, latestSnapshot] = await Promise.all([
      accountsDB.getByHousehold(householdId),
      manualAssetsDB.getByHousehold(householdId),
      snapshotsDB.getLatest(householdId),
    ]);

    // 2. Compute account-based assets and liabilities
    let accountAssets = 0;
    let accountLiabilities = 0;
    const accountsByType: Record<string, number> = {
      checking: 0,
      savings: 0,
      credit: 0,
      loan: 0,
      other: 0,
    };

    for (const account of accounts) {
      if (account.is_hidden) continue;

      const balance = account.balance_cents;
      const type = account.account_type;

      // Map account type to our categories
      const typeKey =
        type === "checking" || type === "savings" || type === "credit" || type === "loan"
          ? type
          : "other";

      accountsByType[typeKey] += balance;

      if (balance >= 0) {
        accountAssets += balance;
      } else {
        accountLiabilities += Math.abs(balance);
      }
    }

    // 3. Sum manual asset values
    const manualAssetsCents = manualAssets.reduce(
      (sum, asset) => sum + asset.value_cents,
      0
    );

    // 4. Compute totals
    const totalAssets = accountAssets + manualAssetsCents;
    const totalLiabilities = accountLiabilities;
    const netWorth = totalAssets - totalLiabilities;

    // 5. Compute change vs latest snapshot
    let change: {
      amount_cents: number;
      percent: number;
      vs_date: string;
    } | null = null;

    if (latestSnapshot) {
      const amountChange = netWorth - latestSnapshot.total_cents;
      const percentChange =
        latestSnapshot.total_cents !== 0
          ? (amountChange / Math.abs(latestSnapshot.total_cents)) * 100
          : 0;

      change = {
        amount_cents: amountChange,
        percent: Math.round(percentChange * 100) / 100, // 2 decimal places
        vs_date: latestSnapshot.snapshot_date,
      };
    }

    return NextResponse.json({
      net_worth_cents: netWorth,
      assets_cents: totalAssets,
      liabilities_cents: totalLiabilities,
      manual_assets_cents: manualAssetsCents,
      change,
      accounts_by_type: accountsByType,
    });
  } catch (error) {
    log.error("GET /api/money/net-worth error", error);
    return NextResponse.json(
      { error: "Failed to compute net worth" },
      { status: 500 }
    );
  }
}
