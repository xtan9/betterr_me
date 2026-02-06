"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

type ExportType = "habits" | "logs";
type DateRange = "all" | "30" | "90" | "365" | "custom";

function getDateRangeDates(range: DateRange): {
  startDate?: string;
  endDate?: string;
} {
  if (range === "all") return {};

  const endDate = new Date().toISOString().split("T")[0];

  // Custom dates are provided directly via customStart/customEnd state
  if (range === "custom") return {};

  const days = parseInt(range, 10);
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startDate = start.toISOString().split("T")[0];

  return { startDate, endDate };
}

export function DataExport() {
  const t = useTranslations("settings.export");
  const [exporting, setExporting] = React.useState<ExportType | null>(null);
  const [exportProgress, setExportProgress] = React.useState<string | null>(null);
  const [dateRange, setDateRange] = React.useState<DateRange>("all");
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd, setCustomEnd] = React.useState("");

  const handleExport = async (type: ExportType) => {
    setExporting(type);
    setExportProgress(t("preparing"));

    try {
      const params = new URLSearchParams({ type });

      if (type === "logs") {
        if (dateRange === "custom") {
          if (customStart) params.set("startDate", customStart);
          if (customEnd) params.set("endDate", customEnd);
        } else {
          const { startDate, endDate } = getDateRangeDates(dateRange);
          if (startDate) params.set("startDate", startDate);
          if (endDate) params.set("endDate", endDate);
        }
      }

      const response = await fetch(`/api/export?${params}`);

      if (!response.ok) {
        throw new Error("Export failed");
      }

      setExportProgress(t("downloading"));

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `betterrme-${type}-${new Date().toISOString().split("T")[0]}.csv`;

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      toast.success(t("success"));
    } catch (error) {
      console.error("Export error:", error);
      toast.error(t("error"));
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Button
          variant="outline"
          onClick={() => handleExport("habits")}
          disabled={exporting !== null}
          className="gap-2 self-start"
        >
          {exporting === "habits" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t("habits")}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="date-range"
              className="text-sm font-medium text-muted-foreground"
            >
              {t("dateRange")}
            </label>
          <Select
            value={dateRange}
            onValueChange={(v) => setDateRange(v as DateRange)}
          >
            <SelectTrigger id="date-range" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("rangeAll")}</SelectItem>
              <SelectItem value="30">{t("range30")}</SelectItem>
              <SelectItem value="90">{t("range90")}</SelectItem>
              <SelectItem value="365">{t("range365")}</SelectItem>
              <SelectItem value="custom">{t("rangeCustom")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dateRange === "custom" && (
          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="custom-start"
                className="text-sm font-medium text-muted-foreground"
              >
                {t("startDate")}
              </label>
              <input
                id="custom-start"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="custom-end"
                className="text-sm font-medium text-muted-foreground"
              >
                {t("endDate")}
              </label>
              <input
                id="custom-end"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
        )}
        </div>

        <Button
          variant="outline"
          onClick={() => handleExport("logs")}
          disabled={exporting !== null}
          className="gap-2 self-start"
        >
          {exporting === "logs" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t("logs")}
        </Button>
      </div>

      {exportProgress && (
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{exportProgress}</span>
          </div>
          <Progress className="h-1.5" />
        </div>
      )}
    </div>
  );
}
