"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

type ExportType = "habits" | "logs";

export function DataExport() {
  const t = useTranslations("settings.export");
  const [exporting, setExporting] = React.useState<ExportType | null>(null);

  const handleExport = async (type: ExportType) => {
    setExporting(type);

    try {
      const response = await fetch(`/api/export?type=${type}`);

      if (!response.ok) {
        throw new Error("Export failed");
      }

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
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(t("success"));
    } catch (error) {
      console.error("Export error:", error);
      toast.error(t("error"));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button
        variant="outline"
        onClick={() => handleExport("habits")}
        disabled={exporting !== null}
        className="gap-2"
      >
        {exporting === "habits" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {t("habits")}
      </Button>
      <Button
        variant="outline"
        onClick={() => handleExport("logs")}
        disabled={exporting !== null}
        className="gap-2"
      >
        {exporting === "logs" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {t("logs")}
      </Button>
    </div>
  );
}
