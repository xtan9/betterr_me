"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import Papa from "papaparse";
import { useSWRConfig } from "swr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/lib/hooks/use-accounts";
import {
  autoMapColumns,
  TARGET_FIELDS,
  MAX_IMPORT_ROWS,
} from "@/lib/money/csv-import";

type ColumnMapping = Record<string, string | null>;

interface ImportResult {
  imported: number;
  duplicates_skipped: number;
}

export function CsvImportDialog() {
  const t = useTranslations("money.csvImport");
  const { mutate } = useSWRConfig();
  const { connections } = useAccounts();

  // All accounts from all connections
  const allAccounts = connections.flatMap((c) => c.accounts);

  // Wizard state
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [flipSign, setFlipSign] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("cash");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setStep(1);
    setFile(null);
    setParsedHeaders([]);
    setParsedRows([]);
    setColumnMapping({});
    setFlipSign(false);
    setSelectedAccountId("cash");
    setImportResult(null);
    setIsImporting(false);
    setParseError(null);
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetState();
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: "greedy",
      beforeFirstChunk: (chunk: string) => chunk.replace(/^\uFEFF/, ""),
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const rows = results.data as Record<string, string>[];

        if (rows.length === 0) {
          setParseError(t("noRows"));
          return;
        }

        if (rows.length > MAX_IMPORT_ROWS) {
          setParseError(
            t("tooManyRows", { count: rows.length, max: MAX_IMPORT_ROWS })
          );
          return;
        }

        setParsedHeaders(headers);
        setParsedRows(rows.slice(0, MAX_IMPORT_ROWS));
        setColumnMapping(autoMapColumns(headers));
        setStep(2);
      },
      error: () => {
        setParseError(t("parseError"));
      },
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const updateMapping = (targetField: string, csvHeader: string | null) => {
    setColumnMapping((prev) => ({
      ...prev,
      [targetField]: csvHeader === "__skip__" ? null : csvHeader,
    }));
  };

  const canProceedToPreview =
    columnMapping.transaction_date &&
    columnMapping.amount &&
    columnMapping.description;

  const getMappedRows = () => {
    return parsedRows
      .map((row) => {
        const dateValue = columnMapping.transaction_date
          ? row[columnMapping.transaction_date]
          : "";
        const rawAmount = columnMapping.amount
          ? parseFloat(row[columnMapping.amount])
          : NaN;
        const amount = flipSign ? -rawAmount : rawAmount;
        const description = columnMapping.description
          ? row[columnMapping.description]
          : "";
        const merchantName = columnMapping.merchant_name
          ? row[columnMapping.merchant_name]
          : null;
        const category = columnMapping.category
          ? row[columnMapping.category]
          : null;

        return {
          transaction_date: dateValue,
          amount,
          description,
          merchant_name: merchantName || null,
          category: category || null,
        };
      })
      .filter(
        (row) =>
          row.transaction_date &&
          !isNaN(row.amount) &&
          row.description
      );
  };

  const handleImport = async () => {
    setIsImporting(true);
    setStep(4);

    try {
      const mappedRows = getMappedRows();

      if (mappedRows.length === 0) {
        toast.error(t("noRows"));
        setIsImporting(false);
        return;
      }

      const res = await fetch("/api/money/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          rows: mappedRows,
          skip_duplicates: true,
        }),
      });

      if (!res.ok) {
        throw new Error("Import failed");
      }

      const result: ImportResult = await res.json();
      setImportResult(result);
      toast.success(t("importSuccess", { count: result.imported }));

      // Revalidate transaction-related SWR keys
      mutate(
        (key: unknown) =>
          typeof key === "string" && key.startsWith("/api/money/transactions"),
        undefined,
        { revalidate: true }
      );
    } catch (error) {
      console.error("CSV import error:", error);
      toast.error(t("importError"));
    } finally {
      setIsImporting(false);
    }
  };

  const accountName =
    selectedAccountId === "cash"
      ? "Cash"
      : allAccounts.find((a) => a.id === selectedAccountId)?.name ?? "";

  const previewRows = getMappedRows().slice(0, 20);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-1.5 size-4" />
          {t("title")}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-money-surface border-money-border sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 1
              ? t("step1Title")
              : step === 2
                ? t("step2Title")
                : step === 3
                  ? t("step3Title")
                  : t("step4Title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload & Account Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-money-border p-8 transition-colors hover:border-money-accent"
            >
              <Upload className="text-muted-foreground mb-2 size-8" />
              <Label
                htmlFor="csv-file-input"
                className="cursor-pointer font-medium"
              >
                {t("selectFile")}
              </Label>
              <p className="text-muted-foreground text-sm">{t("dragDrop")}</p>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={handleFileInputChange}
              />
              {file && (
                <p className="mt-2 text-sm font-medium">{file.name}</p>
              )}
            </div>

            {parseError && (
              <p className="text-sm text-red-500">{parseError}</p>
            )}

            <div className="space-y-2">
              <Label>{t("selectAccount")}</Label>
              <Select
                value={selectedAccountId}
                onValueChange={setSelectedAccountId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("selectAccount")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  {allAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                      {account.mask ? ` (${account.mask})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="flip-sign"
                checked={flipSign}
                onCheckedChange={(checked) => setFlipSign(checked === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="flip-sign">{t("flipSign")}</Label>
                <p className="text-muted-foreground text-xs">
                  {t("flipSignHelp")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-3">
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
                      {TARGET_FIELDS.filter((f) => columnMapping[f]).map(
                        (f) => (
                          <th key={f} className="px-2 py-1 text-left">
                            {f}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-t">
                        {TARGET_FIELDS.filter((f) => columnMapping[f]).map(
                          (f) => (
                            <td key={f} className="px-2 py-1">
                              {columnMapping[f] ? row[columnMapping[f]!] : ""}
                            </td>
                          )
                        )}
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
              <Button variant="outline" onClick={() => setStep(1)}>
                {t("back")}
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!canProceedToPreview}
              >
                {t("next")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {t("importingTo", {
                count: getMappedRows().length,
                account: accountName,
              })}
            </p>

            {previewRows.length < getMappedRows().length && (
              <p className="text-muted-foreground text-xs">
                {t("previewNote", {
                  count: previewRows.length,
                  total: getMappedRows().length,
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
              <Button variant="outline" onClick={() => setStep(2)}>
                {t("back")}
              </Button>
              <Button onClick={handleImport}>{t("import")}</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Importing / Result */}
        {step === 4 && (
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
                <Button onClick={() => handleOpenChange(false)}>
                  {t("back")}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-red-500">{t("importError")}</p>
                <Button variant="outline" onClick={() => setStep(3)}>
                  {t("back")}
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
