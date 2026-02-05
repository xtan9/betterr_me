"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TimezoneSelector } from "./timezone-selector";
import { Loader2, Save } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  preferences: {
    timezone: string;
    date_format: string;
    week_start_day: number;
    theme: "system" | "light" | "dark";
  };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function SettingsContent() {
  const t = useTranslations("settings");
  const { data, error, isLoading, mutate } = useSWR<{ profile: Profile }>(
    "/api/profile",
    fetcher
  );

  const [timezone, setTimezone] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize form with profile data
  useEffect(() => {
    if (data?.profile?.preferences) {
      setTimezone(data.profile.preferences.timezone || "");
    }
  }, [data]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      await mutate();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = data?.profile?.preferences?.timezone !== timezone;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">{t("error")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="gap-2"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveSuccess ? t("saved") : t("save")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("timezone.title")}</CardTitle>
          <CardDescription>{t("timezone.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <TimezoneSelector
              value={timezone}
              onChange={setTimezone}
              disabled={isSaving}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
