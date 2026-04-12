"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import Papa from "papaparse";
import { useSWRConfig } from "swr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/hooks/use-accounts";
import {
  autoMapColumns,
  MAX_IMPORT_ROWS,
} from "@/lib/money/csv-import";
import type { ColumnMapping, ImportResult } from "./types";
import { CsvUploadStep } from "./csv-upload-step";
import { CsvMappingStep } from "./csv-mapping-step";
import { CsvPreviewStep } from "./csv-preview-step";
import { CsvResultStep } from "./csv-result-step";

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

  const updateMapping = (targetField: string, val: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [targetField]: val === "__skip__" ? null : val,
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

        {step === 1 && (
          <CsvUploadStep
            file={file}
            parseError={parseError}
            handleFileInputChange={handleFileInputChange}
            handleDrop={handleDrop}
            handleDragOver={handleDragOver}
            flipSign={flipSign}
            setFlipSign={setFlipSign}
            selectedAccountId={selectedAccountId}
            setSelectedAccountId={setSelectedAccountId}
            allAccounts={allAccounts}
          />
        )}

        {step === 2 && (
          <CsvMappingStep
            parsedHeaders={parsedHeaders}
            parsedRows={parsedRows}
            columnMapping={columnMapping}
            updateMapping={updateMapping}
            canProceedToPreview={canProceedToPreview}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <CsvPreviewStep
            mappedRows={getMappedRows()}
            accountName={accountName}
            onBack={() => setStep(2)}
            onImport={handleImport}
          />
        )}

        {step === 4 && (
          <CsvResultStep
            isImporting={isImporting}
            importResult={importResult}
            onClose={() => handleOpenChange(false)}
            onBack={() => setStep(3)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
