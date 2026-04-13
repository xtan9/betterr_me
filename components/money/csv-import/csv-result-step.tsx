"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportResult } from "./types";

interface CsvResultStepProps {
  isImporting: boolean;
  importResult: ImportResult | null;
  onClose: () => void;
  onBack: () => void;
}

export function CsvResultStep({
  isImporting,
  importResult,
  onClose,
  onBack,
}: CsvResultStepProps) {
  const t = useTranslations("money.csvImport");

  return (
    <div className="flex flex-col items-center space-y-4 py-8">
      {isImporting ? (
        <>
          <Loader2 className="text-money-accent size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">
            {t("importing")}
          </p>
        </>
      ) : importResult ? (
        <>
          <p className="text-lg font-medium">
            {t("importSuccess", { count: importResult.imported })}
          </p>
          {importResult.duplicates_skipped > 0 && (
            <p className="text-muted-foreground text-sm">
              {t("duplicatesSkipped", {
                count: importResult.duplicates_skipped,
              })}
            </p>
          )}
          <Button onClick={onClose}>{t("back")}</Button>
        </>
      ) : (
        <>
          <p className="text-sm text-red-500">{t("importError")}</p>
          <Button variant="outline" onClick={onBack}>
            {t("back")}
          </Button>
        </>
      )}
    </div>
  );
}
