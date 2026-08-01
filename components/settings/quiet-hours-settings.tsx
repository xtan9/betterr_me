"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
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
import type { CurrentProfileResponse } from "@/lib/current-profile";
import { useNotificationPreferences } from "@/lib/hooks/use-profile-preferences";

export function QuietHoursSettings({
  initialData,
  initialSubject,
}: {
  initialData?: CurrentProfileResponse;
  initialSubject?: string;
}) {
  const t = useTranslations("settings.notifications");
  const notifications = useNotificationPreferences({ initialData, initialSubject });
  const quietState = notifications.pushQuietWindow;
  const acceptedQuiet = useMemo(
    () =>
      quietState.status === "ready" || quietState.status === "pending"
        ? quietState.value
        : { status: "disabled" as const },
    [quietState],
  );
  const savedStart = acceptedQuiet.status === "enabled" ? acceptedQuiet.startLocal : null;
  const savedEnd = acceptedQuiet.status === "enabled" ? acceptedQuiet.endLocal : null;

  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");
  const [saving, setSaving] = useState(false);

  const nextValue = enabled
    ? { status: "enabled" as const, startLocal: start, endLocal: end }
    : { status: "disabled" as const };
  const hasChanges =
    quietState.status !== "ready" ||
    JSON.stringify(quietState.value) !== JSON.stringify(nextValue);

  // Sync state from fetched profile
  useEffect(() => {
    if (quietState.status === "ready" || quietState.status === "pending") {
      const hasQuietHours = acceptedQuiet.status === "enabled";
      setEnabled(hasQuietHours);
      if (savedStart) setStart(savedStart);
      if (savedEnd) setEnd(savedEnd);
    }
  }, [quietState, savedStart, savedEnd, acceptedQuiet]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await notifications.setPushQuietWindow(nextValue);
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
            disabled={saving || quietState.status === "unavailable"}
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
                disabled={saving}
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
                disabled={saving}
              />
            </div>
          </div>
        )}

        <p className="text-caption text-muted-foreground">
          {t("quietHours.emailNote")}
        </p>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {t("quietHours.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
