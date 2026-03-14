"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Landmark,
  PiggyBank,
  CreditCard,
  Building,
  TrendingUp,
  Package,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ManualAssetForm } from "@/components/money/manual-asset-form";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useNetWorth } from "@/lib/hooks/use-net-worth";
import { formatMoney } from "@/lib/money/arithmetic";
import type { ManualAsset, ViewMode } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Type icon mapping
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, React.ElementType> = {
  depository: Landmark,
  checking: Landmark,
  savings: PiggyBank,
  credit: CreditCard,
  loan: Building,
  investment: TrendingUp,
  other: Package,
};

const TYPE_LABEL_KEYS: Record<string, string> = {
  depository: "depository",
  checking: "checking",
  savings: "savings",
  credit: "credit",
  loan: "loan",
  investment: "investment",
  other: "other",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountsByType {
  type: string;
  accounts: Array<{
    id: string;
    name: string;
    mask: string | null;
    balance_cents: number;
  }>;
  subtotal: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NetWorthAccountsProps {
  view?: ViewMode;
}

export function NetWorthAccounts({ view = "mine" }: NetWorthAccountsProps) {
  const t = useTranslations("money.netWorth");
  const { connections, isLoading: accountsLoading } = useAccounts(view);
  const { netWorth, isLoading: netWorthLoading, mutate } = useNetWorth(view);

  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ManualAsset | null>(null);

  const isLoading = accountsLoading || netWorthLoading;

  // Group connected accounts by account_type
  const accountsByType = useMemo(() => {
    const groups: Record<string, AccountsByType> = {};

    for (const conn of connections) {
      for (const acc of conn.accounts) {
        const type = acc.account_type || "other";
        if (!groups[type]) {
          groups[type] = { type, accounts: [], subtotal: 0 };
        }
        groups[type].accounts.push({
          id: acc.id,
          name: acc.name,
          mask: acc.mask,
          balance_cents: acc.balance_cents,
        });
        groups[type].subtotal += acc.balance_cents;
      }
    }

    return Object.values(groups);
  }, [connections]);

  const handleAddAsset = () => {
    setEditingAsset(null);
    setAssetFormOpen(true);
  };

  const handleAssetSuccess = () => {
    setAssetFormOpen(false);
    setEditingAsset(null);
    mutate();
  };

  if (isLoading) {
    return (
      <Card className="border-money-border bg-money-surface">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-money-border bg-money-surface">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {t("accountBreakdown")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Account type sections */}
          {accountsByType.map((group) => {
            const Icon = TYPE_ICONS[group.type] || Package;
            const labelKey = TYPE_LABEL_KEYS[group.type] || "other";

            return (
              <div key={group.type}>
                {/* Type header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t(labelKey)}
                    </span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {formatMoney(group.subtotal)}
                  </span>
                </div>

                {/* Individual accounts */}
                <div className="ml-6 space-y-1.5">
                  {group.accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground truncate mr-2">
                        {acc.name}
                        {acc.mask && (
                          <span className="ml-1 text-xs">
                            ****{acc.mask}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {formatMoney(acc.balance_cents)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Empty connected accounts state */}
          {accountsByType.length === 0 && !netWorth?.manual_assets_cents && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("noData")}
            </p>
          )}

          {/* Manual assets section */}
          <div className="border-t border-money-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{t("manualAssets")}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleAddAsset}
              >
                <Plus className="size-3 mr-1" />
                {t("addAsset")}
              </Button>
            </div>

            {netWorth?.manual_assets_cents === 0 && (
              <p className="text-xs text-muted-foreground ml-6">
                {t("assetClarification")}
              </p>
            )}

            {/* Manual assets are shown via the net worth breakdown data */}
            {/* The API includes manual asset totals -- individual items need their own fetch */}
            {netWorth && netWorth.manual_assets_cents > 0 && (
              <div className="ml-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("manualAssets")}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(netWorth.manual_assets_cents)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Manual asset form dialog */}
      <ManualAssetForm
        asset={editingAsset}
        open={assetFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAssetFormOpen(false);
            setEditingAsset(null);
          }
        }}
        onSuccess={handleAssetSuccess}
      />
    </>
  );
}
