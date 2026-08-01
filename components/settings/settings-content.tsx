"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
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
import { log } from "@/lib/logger";
import type { CurrentProfileResponse } from "@/lib/current-profile";
import type { WeightUnitPreference } from "@/lib/preferences/types";
import {
  useLocalizationPreference,
} from "@/lib/hooks/use-profile-preferences";
import { useFitness } from "@/lib/hooks/use-fitness";

interface SettingsContentProps {
  initialData?: CurrentProfileResponse;
  initialSubject?: string;
}

export function SettingsContent({ initialData, initialSubject }: SettingsContentProps) {
  const t = useTranslations("settings");
  const profileOptions = { initialData, initialSubject };
  const localization = useLocalizationPreference(profileOptions);
  const fitness = useFitness(profileOptions);

  const [weekStartDay, setWeekStartDay] = useState<number>(1);
  const [weightUnit, setWeightUnit] = useState<WeightUnitPreference>("kg");
  const [savingConcept, setSavingConcept] = useState<"weekStart" | "weightUnit" | null>(null);
  const [savedConcept, setSavedConcept] = useState<"weekStart" | "weightUnit" | null>(null);
  const acceptedWeekStart = localization.acceptedWeekStart;
  const acceptedWeightUnit = fitness.acceptedWeightUnit;
  const remoteWeekStart =
    localization.weekStart.status === "ready" || localization.weekStart.status === "pending"
      ? localization.weekStart.value
      : undefined;
  const remoteWeightUnit =
    fitness.weightUnitPreference.status === "ready" ||
    fitness.weightUnitPreference.status === "pending"
      ? fitness.weightUnitPreference.value
      : undefined;

  useEffect(() => {
    if (remoteWeekStart !== undefined) {
      setWeekStartDay(remoteWeekStart === "sunday" ? 0 : 1);
    }
    if (remoteWeightUnit !== undefined) {
      setWeightUnit(remoteWeightUnit);
    }
  }, [remoteWeekStart, remoteWeightUnit]);

  const saveWeekStart = async () => {
    setSavingConcept("weekStart");
    setSavedConcept(null);
    try {
      await localization.setWeekStart(weekStartDay === 0 ? "sunday" : "monday");
      setSavedConcept("weekStart");
    } catch (err) {
      log.error("[settings] Failed to save Week Start Preference", err);
      toast.error(t("toast.saveError"));
    } finally {
      setSavingConcept(null);
    }
  };

  const saveWeightUnit = async () => {
    setSavingConcept("weightUnit");
    setSavedConcept(null);
    try {
      await fitness.setWeightUnit(weightUnit);
      setSavedConcept("weightUnit");
    } catch (err) {
      log.error("[settings] Failed to save Weight Unit Preference", err);
      toast.error(t("toast.saveError"));
    } finally {
      setSavingConcept(null);
    }
  };

  const hasWeekStartChanges =
    acceptedWeekStart?.status !== "ready" ||
    (acceptedWeekStart.value === "sunday" ? 0 : 1) !== weekStartDay;
  const hasWeightUnitChanges =
    acceptedWeightUnit?.status !== "ready" || acceptedWeightUnit.value !== weightUnit;
  const isLoading = localization.isLoading || fitness.isLoading;

  if (localization.error || fitness.error) {
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
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
          <CardDescription>{t("profile.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm initialData={initialData} initialSubject={initialSubject} />
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
              disabled={savingConcept !== null}
            />
          )}
          <Button
            onClick={saveWeekStart}
            disabled={!hasWeekStartChanges || savingConcept !== null}
            className="mt-4 gap-2"
          >
            {savingConcept === "weekStart" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : savedConcept === "weekStart" ? (
              <CheckCircle className="h-4 w-4 text-status-success" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {savedConcept === "weekStart" ? t("saved") : t("save")}
          </Button>
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
              disabled={savingConcept !== null}
            />
          )}
          <Button
            onClick={saveWeightUnit}
            disabled={!hasWeightUnitChanges || savingConcept !== null}
            className="mt-4 gap-2"
          >
            {savingConcept === "weightUnit" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : savedConcept === "weightUnit" ? (
              <CheckCircle className="h-4 w-4 text-status-success" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {savedConcept === "weightUnit" ? t("saved") : t("save")}
          </Button>
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

      <NotificationSettings
        initialData={initialData}
        initialSubject={initialSubject}
      />

      <Card>
        <CardContent className="pt-card-padding flex flex-col gap-4">
          <ApiKeysSection />
        </CardContent>
      </Card>
    </div>
  );
}
