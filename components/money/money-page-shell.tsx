"use client";

import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";

export function MoneyPageShell() {
  const t = useTranslations("money");

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

      <div className="mt-8 rounded-lg border border-money-border bg-money-sage-light px-4 py-3">
        <p className="text-sm font-medium text-money-sage-foreground">
          {t("emptyState.comingSoon")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("emptyState.comingSoonDescription")}
        </p>
      </div>
    </div>
  );
}
