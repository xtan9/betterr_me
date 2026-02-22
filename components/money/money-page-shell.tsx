"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { formatMoney } from "@/lib/money/arithmetic";
import { AccountsEmptyState } from "@/components/money/accounts-empty-state";

export function MoneyPageShell() {
  const t = useTranslations("money");
  const { connections, netWorthCents, isLoading } = useAccounts();

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-money-border bg-money-surface px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {t("accounts.loading")}
        </p>
      </div>
    );
  }

  // Empty state for new users
  if (connections.length === 0) {
    return <AccountsEmptyState />;
  }

  // Quick summary linking to /money/accounts
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-money-border bg-money-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {t("accounts.netWorth")}
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {formatMoney(netWorthCents)}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/money/accounts">
              {t("accounts.title")}
              <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          {connections.length}{" "}
          {connections.length === 1
            ? "connected account"
            : "connected accounts"}
        </div>
      </div>
    </div>
  );
}
