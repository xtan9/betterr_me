"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { TARGET_FIELDS } from "@/lib/money/csv-import";
import type { ColumnMapping } from "./types";

interface CsvMappingStepProps {
  parsedHeaders: string[];
  parsedRows: Record<string, string>[];
  columnMapping: ColumnMapping;
  updateMapping: (targetField: string, val: string) => void;
  canProceedToPreview: boolean | string | null;
  onBack: () => void;
  onNext: () => void;
}

export function CsvMappingStep({
  parsedHeaders,
  parsedRows,
  columnMapping,
  updateMapping,
  canProceedToPreview,
  onBack,
  onNext,
}: CsvMappingStepProps) {
  const t = useTranslations("money.csvImport");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-field-gap">
        {TARGET_FIELDS.map((field) => {
          const isRequired =
            field === "transaction_date" ||
            field === "amount" ||
            field === "description";
          return (
            <div key={field} className="flex items-center gap-3">
              <Label className="min-w-32 text-sm">
                {field}
                {isRequired && (
                  <span className="ml-1 text-red-500">*</span>
                )}
              </Label>
              <Select
                value={columnMapping[field] ?? "__skip__"}
                onValueChange={(val) => updateMapping(field, val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("mapColumn")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__skip__">{t("skip")}</SelectItem>
                  {parsedHeaders.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {/* Mini preview of first 3 rows */}
      {parsedRows.length > 0 && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                {TARGET_FIELDS.filter((f) => columnMapping[f]).map((f) => (
                  <th key={f} className="px-2 py-1 text-left">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedRows.slice(0, 3).map((row, i) => (
                <tr key={i} className="border-t">
                  {TARGET_FIELDS.filter((f) => columnMapping[f]).map((f) => (
                    <td key={f} className="px-2 py-1">
                      {columnMapping[f] ? row[columnMapping[f]!] : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canProceedToPreview && (
        <p className="text-sm text-red-500">{t("requiredFields")}</p>
      )}

      <DialogFooter className="flex justify-between sm:justify-between">
        <Button variant="outline" onClick={onBack}>
          {t("back")}
        </Button>
        <Button onClick={onNext} disabled={!canProceedToPreview}>
          {t("next")}
        </Button>
      </DialogFooter>
    </div>
  );
}
