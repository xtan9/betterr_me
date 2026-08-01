"use client";

import { useLocalizationPreference } from "@/lib/hooks/use-profile-preferences";
import { DEFAULT_WEEK_START_PREFERENCE } from "@/lib/preferences/owners";
import type { UseCurrentProfileOptions } from "@/lib/hooks/use-current-profile";

export function useLocalization(options?: UseCurrentProfileOptions) {
  const profileQuery = useLocalizationPreference(options);
  const { weekStart: weekStartPreference } = profileQuery;
  const weekStart =
    weekStartPreference.status === "ready" ||
    weekStartPreference.status === "pending"
      ? weekStartPreference.value
      : DEFAULT_WEEK_START_PREFERENCE;

  return {
    ...profileQuery,
    weekStart,
    weekStartPreference,
    acceptedWeekStart: profileQuery.acceptedWeekStart,
    isPending: profileQuery.isPending,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
    setWeekStart: profileQuery.setWeekStart,
  };
}
