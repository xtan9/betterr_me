"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Moon } from "lucide-react";
import { toast } from "sonner";

export function QuietHoursSettings() {
  const t = useTranslations("settings.notifications");
  const { data: profileData, mutate } = useSWR("/api/profile", fetcher);

  const prefs = profileData?.profile?.preferences;
  const savedStart = prefs?.quiet_hours_start ?? null;
  const savedEnd = prefs?.quiet_hours_end ?? null;

  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");
  const [saving, setSaving] = useState(false);

  // Sync state from fetched profile
  useEffect(() => {
    if (prefs) {
      const hasQuietHours = !!savedStart && !!savedEnd;
      setEnabled(hasQuietHours);
      if (savedStart) setStart(savedStart);
      if (savedEnd) setEnd(savedEnd);
    }
  }, [prefs, savedStart, savedEnd]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const existingPrefs = prefs || {};
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: {
            ...existingPrefs,
            quiet_hours_start: enabled ? start : null,
            quiet_hours_end: enabled ? end : null,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save quiet hours");
      }

      mutate();
      toast.success(t("quietHours.saved"));
    } catch (error) {
      console.error("Failed to save quiet hours:", error);
      toast.error(t("quietHours.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Moon className="h-5 w-5" />
          {t("quietHours.title")}
        </CardTitle>
        <CardDescription>{t("quietHours.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="quiet-hours-toggle" className="text-body font-medium">
            {enabled
              ? t("quietHours.enabled")
              : t("quietHours.disabled")}
          </Label>
          <Switch
            id="quiet-hours-toggle"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="quiet-hours-start">
                {t("quietHours.startTime")}
              </Label>
              <Input
                id="quiet-hours-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quiet-hours-end">
                {t("quietHours.endTime")}
              </Label>
              <Input
                id="quiet-hours-end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t("quietHours.emailNote")}
        </p>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {t("quietHours.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
