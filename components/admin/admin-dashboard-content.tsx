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
  total: number;
  created: number;
  updated: number;
  gifsDownloaded: number;
  gifsFailed: number;
}

export function AdminDashboardContent({
  mediaCount,
  totalExercises,
  lastSyncDate,
}: AdminDashboardContentProps) {
  const t = useTranslations("admin");
  const [syncing, setSyncing] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [skipGifs, setSkipGifs] = useState(false);
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
        body: JSON.stringify({ dryRun, skipGifs }),
      });

      if (!res.ok) {
        throw new Error(t("sync.error"));
      }

      const data = await res.json();
      setResult({
        total: data.total ?? 0,
        created: data.created ?? 0,
        updated: data.updated ?? 0,
        gifsDownloaded: data.gifsDownloaded ?? 0,
        gifsFailed: data.gifsFailed ?? 0,
      });
    } catch {
      setError(t("sync.error"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <h1 className="text-page-title tracking-tight mb-6">{t("title")}</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="size-5" />
            <CardTitle>{t("sync.title")}</CardTitle>
          </div>
          <CardDescription>{t("sync.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-body text-muted-foreground space-y-1">
            <p>{t("sync.exerciseCount", { count: totalExercises })}</p>
            <p>{t("sync.gifCount", { count: mediaCount })}</p>
            <p>
              {lastSyncDate
                ? t("sync.lastSync", {
                    date: new Date(lastSyncDate).toLocaleDateString(),
                  })
                : t("sync.neverSynced")}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch
                id="dry-run"
                checked={dryRun}
                onCheckedChange={setDryRun}
              />
              <Label htmlFor="dry-run">{t("sync.dryRun")}</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="skip-gifs"
                checked={skipGifs}
                onCheckedChange={setSkipGifs}
              />
              <Label htmlFor="skip-gifs">{t("sync.skipGifs")}</Label>
            </div>
          </div>

          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? t("sync.syncing") : t("sync.syncButton")}
          </Button>

          {syncing && !skipGifs && !dryRun && (
            <p className="text-body text-muted-foreground">
              {t("sync.syncingLong")}
            </p>
          )}

          {result && (
            <div className="rounded-card bg-muted p-3 text-body space-y-1">
              <p className="font-medium">{t("sync.success")}</p>
              <p>{t("sync.resultTotal", { count: result.total })}</p>
              <p>{t("sync.resultCreated", { count: result.created })}</p>
              <p>{t("sync.resultUpdated", { count: result.updated })}</p>
              {result.gifsDownloaded > 0 && (
                <p>{t("sync.resultGifsDownloaded", { count: result.gifsDownloaded })}</p>
              )}
              {result.gifsFailed > 0 && (
                <p className="text-destructive">
                  {t("sync.resultGifsFailed", { count: result.gifsFailed })}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-body text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
