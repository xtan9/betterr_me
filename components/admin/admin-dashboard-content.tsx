"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Database } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface AdminDashboardContentProps {
  mediaCount: number;
  totalExercises: number;
  lastSyncDate: string | null;
}

interface SyncResult {
  matched: number;
  unmatched: number;
}

export function AdminDashboardContent({
  mediaCount,
  totalExercises,
  lastSyncDate,
}: AdminDashboardContentProps) {
  const t = useTranslations("admin");
  const [syncing, setSyncing] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/sync-exercise-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });

      if (!res.ok) {
        throw new Error(t("sync.error"));
      }

      const data = await res.json();
      setResult({
        matched: data.matched ?? 0,
        unmatched: data.unmatched ?? 0,
      });
    } catch {
      setError(t("sync.error"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="size-5" />
            <CardTitle>{t("sync.title")}</CardTitle>
          </div>
          <CardDescription>{t("sync.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("sync.currentStats", {
              count: mediaCount,
              total: totalExercises,
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {lastSyncDate
              ? t("sync.lastSync", {
                  date: new Date(lastSyncDate).toLocaleDateString(),
                })
              : t("sync.neverSynced")}
          </p>

          <div className="flex items-center gap-2">
            <Switch
              id="dry-run"
              checked={dryRun}
              onCheckedChange={setDryRun}
            />
            <Label htmlFor="dry-run">{t("sync.dryRun")}</Label>
          </div>

          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? t("sync.syncing") : t("sync.syncButton")}
          </Button>

          {result && (
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <p className="font-medium">{t("sync.success")}</p>
              <p>{t("sync.resultMatched", { count: result.matched })}</p>
              <p>{t("sync.resultUnmatched", { count: result.unmatched })}</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
