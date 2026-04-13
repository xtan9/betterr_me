"use client";

import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Account {
  id: string;
  name: string;
  mask?: string | null;
}

interface CsvUploadStepProps {
  file: File | null;
  parseError: string | null;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  flipSign: boolean;
  setFlipSign: (value: boolean) => void;
  selectedAccountId: string;
  setSelectedAccountId: (value: string) => void;
  allAccounts: Account[];
}

export function CsvUploadStep({
  file,
  parseError,
  handleFileInputChange,
  handleDrop,
  handleDragOver,
  flipSign,
  setFlipSign,
  selectedAccountId,
  setSelectedAccountId,
  allAccounts,
}: CsvUploadStepProps) {
  const t = useTranslations("money.csvImport");

  return (
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
  );
}
