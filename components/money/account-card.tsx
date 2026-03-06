"use client";

import { useTranslations } from "next-intl";
import type { MoneyAccount } from "@/lib/db/types";
import type { SyncStatus } from "@/lib/plaid/types";
import { formatMoney } from "@/lib/money/arithmetic";
import { SyncStatusBadge } from "@/components/money/sync-status-badge";

interface AccountCardProps {
  account: MoneyAccount;
  syncStatus: SyncStatus;
}

export function AccountCard({ account, syncStatus }: AccountCardProps) {
  const t = useTranslations("money");

  return (
    <div className="flex items-center justify-between rounded-lg border border-money-border bg-money-surface px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{account.name}</span>
          {account.mask && (
            <span className="text-xs text-muted-foreground">
              {t("account.mask", { mask: account.mask })}
            </span>
          )}
        </div>
        {account.official_name &&
          account.official_name !== account.name && (
            <span className="text-xs text-muted-foreground">
              {account.official_name}
            </span>
          )}
        {account.subtype && (
          <span className="text-xs capitalize text-muted-foreground">
            {account.subtype}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tabular-nums">
          {formatMoney(account.balance_cents)}
        </span>
        <SyncStatusBadge status={syncStatus} />
      </div>
    </div>
  );
}
