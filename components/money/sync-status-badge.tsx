"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type { SyncStatus } from "@/lib/plaid/types";
import { cn } from "@/lib/utils";

interface SyncStatusBadgeProps {
  status: SyncStatus;
}

const statusStyles: Record<SyncStatus, string> = {
  syncing: "bg-money-sage-light text-money-sage-foreground",
  synced: "bg-money-sage-light text-money-sage-foreground",
  stale: "bg-money-amber-light text-money-amber-foreground",
  error: "bg-destructive/10 text-destructive",
};

export function SyncStatusBadge({ status }: SyncStatusBadgeProps) {
  const t = useTranslations("money");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status]
      )}
    >
      {status === "syncing" && (
        <Loader2 className="size-3 animate-spin" />
      )}
      {t(`syncStatus.${status}`)}
    </span>
  );
}
