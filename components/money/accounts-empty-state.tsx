"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PenLine, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlaidLinkButton } from "@/components/money/plaid-link-button";
import { ManualTransactionDialog } from "@/components/money/manual-transaction-dialog";
import type { KeyedMutator } from "swr";
import type { AccountsResponse } from "@/lib/hooks/use-accounts";

interface AccountsEmptyStateProps {
  mutate?: KeyedMutator<AccountsResponse>;
}

export function AccountsEmptyState({ mutate }: AccountsEmptyStateProps) {
  const t = useTranslations("money");
  const [manualDialogOpen, setManualDialogOpen] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-money-border bg-money-surface px-6 py-16 text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-money-sage-light">
        <Wallet className="size-8 text-money-sage" />
      </div>

      <h2 className="text-xl font-semibold text-money-sage-foreground">
        {t("emptyState.heading")}
      </h2>

      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {t("emptyState.description")}
      </p>

      <div className="mt-8 flex items-center gap-3">
        <PlaidLinkButton mutate={mutate} />
        <Button
          variant="outline"
          onClick={() => setManualDialogOpen(true)}
        >
          <PenLine className="size-4" />
          {t("accounts.manualEntry")}
        </Button>
      </div>

      <ManualTransactionDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        accounts={[]}
        onSuccess={() => mutate?.()}
      />
    </div>
  );
}
