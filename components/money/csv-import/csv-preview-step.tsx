"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface MappedRow {
  transaction_date: string;
  amount: number;
  description: string;
  merchant_name: string | null;
  category: string | null;
}

interface CsvPreviewStepProps {
  mappedRows: MappedRow[];
  accountName: string;
  onBack: () => void;
  onImport: () => void;
}

export function CsvPreviewStep({
  mappedRows,
  accountName,
  onBack,
  onImport,
}: CsvPreviewStepProps) {
  const t = useTranslations("money.csvImport");
  const previewRows = mappedRows.slice(0, 20);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t("importingTo", {
          count: mappedRows.length,
          account: accountName,
        })}
      </p>

      {previewRows.length < mappedRows.length && (
        <p className="text-muted-foreground text-xs">
          {t("previewNote", {
            count: previewRows.length,
            total: mappedRows.length,
          })}
        </p>
      )}

      <div className="max-h-64 overflow-auto rounded border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-right">Amount</th>
              <th className="px-2 py-1 text-left">Description</th>
              <th className="px-2 py-1 text-left">Merchant</th>
              <th className="px-2 py-1 text-left">Category</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1">{row.transaction_date}</td>
                <td className="px-2 py-1 text-right">
                  {isNaN(row.amount) ? "" : row.amount.toFixed(2)}
                </td>
                <td className="max-w-48 truncate px-2 py-1">
                  {row.description}
                </td>
                <td className="px-2 py-1">{row.merchant_name ?? ""}</td>
                <td className="px-2 py-1">{row.category ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DialogFooter className="flex justify-between sm:justify-between">
        <Button variant="outline" onClick={onBack}>
          {t("back")}
        </Button>
        <Button onClick={onImport}>{t("import")}</Button>
      </DialogFooter>
    </div>
  );
}
