"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, ChevronDown, PenLine, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { formatMoney } from "@/lib/money/arithmetic";
import { PlaidLinkButton } from "@/components/money/plaid-link-button";
import { AccountGroup } from "@/components/money/account-group";
import { AccountsEmptyState } from "@/components/money/accounts-empty-state";
import { DisconnectDialog } from "@/components/money/disconnect-dialog";
import { ManualTransactionDialog } from "@/components/money/manual-transaction-dialog";

export function AccountsList() {
  const t = useTranslations("money");
  const { connections, netWorthCents, error, isLoading, mutate } =
    useAccounts();

  const [errorBannerVisible, setErrorBannerVisible] = useState(true);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<{
    connectionId: string;
    institutionName: string;
  } | null>(null);

  const allAccounts = useMemo(
    () => connections.flatMap((c) => c.accounts),
    [connections]
  );

  // Reset error banner visibility when connections change
  const hasErrors = connections.some((c) => c.sync_status === "error");
  useEffect(() => {
    if (hasErrors) {
      setErrorBannerVisible(true);
    }
  }, [hasErrors]);

  const handleSync = useCallback(
    async (connectionId: string) => {
      try {
        const res = await fetch(
          `/api/money/accounts/${connectionId}/sync`,
          { method: "POST" }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || "Sync failed");
        }

        toast.success(t("accounts.syncSuccess"));
        mutate();
      } catch (error) {
        console.error("Sync error:", error);
        toast.error(t("accounts.syncError"));
      }
    },
    [mutate, t]
  );

  const handleDisconnect = useCallback(
    (connectionId: string) => {
      const connection = connections.find((c) => c.id === connectionId);
      setDisconnectTarget({
        connectionId,
        institutionName:
          connection?.institution_name ?? "",
      });
    },
    [connections]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-money-border bg-money-surface px-6 py-16 text-center">
        <AlertCircle className="mb-4 size-8 text-destructive" />
        <h3 className="text-base font-semibold">{t("accounts.errorTitle")}</h3>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => mutate()}
        >
          {t("accounts.retry")}
        </Button>
      </div>
    );
  }

  // Empty state
  if (connections.length === 0) {
    return <AccountsEmptyState mutate={mutate} />;
  }

  return (
    <div className="space-y-6">
      {/* Dismissable error banner */}
      {hasErrors && errorBannerVisible && (
        <Alert variant="destructive" className="relative">
          <AlertCircle className="size-4" />
          <AlertTitle>{t("accounts.errorBanner")}</AlertTitle>
          <AlertDescription className="sr-only">
            {t("accounts.errorBanner")}
          </AlertDescription>
          <button
            onClick={() => setErrorBannerVisible(false)}
            className="absolute right-3 top-3 rounded-sm p-0.5 text-destructive opacity-70 ring-offset-background transition-opacity hover:opacity-100"
            aria-label={t("accounts.errorBannerDismiss")}
          >
            <X className="size-4" />
          </button>
        </Alert>
      )}

      {/* Header with net worth and connect button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("accounts.netWorth")}
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {formatMoney(netWorthCents)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PlaidLinkButton mutate={mutate} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {t("accounts.otherOptions")}
                <ChevronDown className="ml-1 size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setManualDialogOpen(true)}>
                <PenLine className="size-4" />
                {t("accounts.manualEntry")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Account groups */}
      <div className="space-y-6">
        {connections.map((connection) => (
          <AccountGroup
            key={connection.id}
            connection={connection}
            onSync={handleSync}
            onDisconnect={handleDisconnect}
          />
        ))}
      </div>

      {/* Disconnect dialog */}
      {disconnectTarget && (
        <DisconnectDialog
          connectionId={disconnectTarget.connectionId}
          institutionName={disconnectTarget.institutionName}
          open={!!disconnectTarget}
          onOpenChange={(open) => {
            if (!open) setDisconnectTarget(null);
          }}
          mutate={mutate}
        />
      )}

      {/* Manual transaction dialog */}
      <ManualTransactionDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        accounts={allAccounts}
        onSuccess={() => mutate()}
      />
    </div>
  );
}
