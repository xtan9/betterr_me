"use client";

import { useTranslations } from "next-intl";
import { Loader2, Check, AlertCircle } from "lucide-react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface JournalSaveStatusProps {
  status: SaveStatus;
}

export function JournalSaveStatus({ status }: JournalSaveStatusProps) {
  const t = useTranslations("journal");

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground h-5">
      {status === "saving" && (
        <>
          <Loader2 className="size-4 animate-spin" />
          <span>{t("saving")}</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="size-4 text-primary" />
          <span>{t("saved")}</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="size-4 text-destructive" />
          <span>{t("saveError")}</span>
        </>
      )}
    </div>
  );
}
