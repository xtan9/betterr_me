"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layouts/page-header";
import { ProfileForm } from "./profile-form";
import { WeekStartSelector } from "./week-start-selector";
import { WeightUnitSelector } from "./weight-unit-selector";
import { DataExport } from "./data-export";
import { NotificationSettings } from "./notification-settings";
import { ApiKeysSection } from "./api-keys-section";
import { CheckCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
import {
  profilePreferenceIntents,
  type PreferenceIntent,
} from "@/lib/profile-preference-cache";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  preferences: {
    date_format: string;
    week_start_day: number;
    theme: "system" | "light" | "dark";
    weight_unit?: "kg" | "lbs";
  };
}

interface SettingsContentProps {
  initialProfile?: { profile: Profile };
}

export function SettingsContent({ initialProfile }: SettingsContentProps) {
  const t = useTranslations("settings");
  const { data, error, isLoading, mutate } = useSWR<{ profile: Profile }>(
    "/api/profile",
    fetcher,
    { fallbackData: initialProfile }
  );

  const [weekStartDay, setWeekStartDay] = useState<number>(0);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize form with profile data
  useEffect(() => {
    if (data?.profile?.preferences) {
      setWeekStartDay(data.profile.preferences.week_start_day ?? 0);
      setWeightUnit(data.profile.preferences.weight_unit ?? "kg");
    }
  }, [data]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    let trackedIntent: PreferenceIntent | undefined;

    try {
      const intent: {
        week_start_day?: number;
        weight_unit?: "kg" | "lbs";
      } = {};
      if (data?.profile.preferences.week_start_day !== weekStartDay) {
        intent.week_start_day = weekStartDay;
      }
      if ((data?.profile.preferences.weight_unit ?? "kg") !== weightUnit) {
        intent.weight_unit = weightUnit;
      }
      trackedIntent = profilePreferenceIntents.begin(intent);
      const response = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      const acceptedOutcome = (await response.json()) as { profile: Profile };
      const cacheOutcome = profilePreferenceIntents.accept(
        trackedIntent,
        acceptedOutcome,
      );
      await mutate(
        () => cacheOutcome,
        { revalidate: false },
      );
      void mutate().catch((error) => {
        console.error("Failed to revalidate accepted settings:", error);
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      if (trackedIntent) profilePreferenceIntents.reject(trackedIntent);
      console.error("Failed to save settings:", err);
      toast.error(t("toast.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    data?.profile?.preferences?.week_start_day !== weekStartDay ||
    (data?.profile?.preferences?.weight_unit ?? "kg") !== weightUnit;

  if (error) {
    return (
      <div className="flex flex-col gap-section-gap">
        <PageHeader title={t("title")} />
        <Card>
          <CardContent className="pt-card-padding">
            <p className="text-destructive">{t("error")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-section-gap">
      <PageHeader
        title={t("title")}
        actions={
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle className="h-4 w-4 text-status-success" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveSuccess ? t("saved") : t("save")}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
          <CardDescription>{t("profile.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("weekStart.title")}</CardTitle>
          <CardDescription>{t("weekStart.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-48" />
          ) : (
            <WeekStartSelector
              value={weekStartDay}
              onChange={setWeekStartDay}
              disabled={isSaving}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("weightUnit.title")}</CardTitle>
          <CardDescription>{t("weightUnit.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10 w-48" />
          ) : (
            <WeightUnitSelector
              value={weightUnit}
              onChange={setWeightUnit}
              disabled={isSaving}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("export.title")}</CardTitle>
          <CardDescription>{t("export.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataExport />
        </CardContent>
      </Card>

      <NotificationSettings />

      <Card>
        <CardContent className="pt-card-padding flex flex-col gap-4">
          <ApiKeysSection />
        </CardContent>
      </Card>
    </div>
  );
}
