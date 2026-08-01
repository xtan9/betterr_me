"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useAppearancePreference } from "@/lib/hooks/use-profile-preferences";
import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
} from "@/lib/preferences/owners";

export function useAppearance() {
  const {
    theme: appliedTheme,
    setTheme,
    resolvedTheme,
  } = useTheme();
  const profileQuery = useAppearancePreference();
  const { theme: themePreference } = profileQuery;
  const presentationTheme =
    themePreference.status === "ready" || themePreference.status === "pending"
      ? themePreference.value
      : DEFAULT_THEME_PREFERENCE;

  useEffect(() => {
    if (appliedTheme !== presentationTheme) {
      setTheme(presentationTheme);
    }
  }, [appliedTheme, presentationTheme, setTheme]);

  const selectTheme = (value: string) => {
    if (!isThemePreference(value)) return;

    const previousTheme =
      themePreference.status === "ready" || themePreference.status === "pending"
        ? themePreference.value
        : DEFAULT_THEME_PREFERENCE;
    setTheme(value);

    return profileQuery.selectTheme(value).catch((error) => {
      console.error("Failed to save theme preference:", error);
      setTheme(previousTheme);
    });
  };

  return {
    theme: presentationTheme,
    themePreference,
    acceptedTheme: profileQuery.acceptedTheme,
    isPending: profileQuery.isPending,
    resolvedTheme,
    selectTheme,
  };
}
