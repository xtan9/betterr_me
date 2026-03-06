"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountCard } from "@/components/money/account-card";
import { formatMoney } from "@/lib/money/arithmetic";
import type { ConnectionWithAccounts } from "@/lib/hooks/use-accounts";

interface AccountGroupProps {
  connection: ConnectionWithAccounts;
  onSync: (connectionId: string) => Promise<void>;
  onDisconnect: (connectionId: string) => void;
  /** Render function for extra content per account (e.g., visibility selector). */
  renderAccountExtra?: (accountId: string) => React.ReactNode;
}

export function AccountGroup({
  connection,
  onSync,
  onDisconnect,
  renderAccountExtra,
}: AccountGroupProps) {
  const t = useTranslations("money");
  const [isSyncing, setIsSyncing] = useState(false);

  const subtotalCents = connection.accounts.reduce(
    (sum, account) => sum + account.balance_cents,
    0
  );

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onSync(connection.id);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Institution header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">
            {connection.institution_name ?? t("accounts.unknownInstitution")}
          </h3>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("accounts.institutionSubtotal")}: {formatMoney(subtotalCents)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            aria-label={t("accounts.resync")}
          >
            {isSyncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            <span className="sr-only sm:not-sr-only sm:ml-1">
              {t("accounts.resync")}
            </span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDisconnect(connection.id)}
            aria-label={t("accounts.disconnect")}
          >
            <Unlink className="size-4" />
            <span className="sr-only sm:not-sr-only sm:ml-1">
              {t("accounts.disconnect")}
            </span>
          </Button>
        </div>
      </div>

      {/* Connection error message */}
      {connection.sync_status === "error" && connection.error_message && (
        <p className="text-sm text-destructive">{connection.error_message}</p>
      )}

      {/* Account cards */}
      <div className="space-y-2">
        {connection.accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            syncStatus={connection.sync_status}
            extra={renderAccountExtra?.(account.id)}
          />
        ))}
      </div>
    </div>
  );
}
