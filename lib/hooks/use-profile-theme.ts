"use client";

import { useTheme } from "next-themes";
import useSWR from "swr";
import type { Profile } from "@/lib/db/types";
import { fetcher } from "@/lib/fetcher";
import { submitProfilePreferenceIntent } from "@/lib/submit-profile-preference-intent";

const PROFILE_THEMES = new Set(["light", "dark", "system"]);

export function useProfileTheme() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const profileQuery = useSWR<{ profile: Profile }>("/api/profile", fetcher, {
    shouldRetryOnError: false,
  });

  const selectTheme = (value: string) => {
    if (!PROFILE_THEMES.has(value)) return;

    const previousTheme = theme ?? "system";
    setTheme(value);
    if (!profileQuery.data?.profile) return;

    void submitProfilePreferenceIntent(
      { theme: value as "light" | "dark" | "system" },
      profileQuery.mutate,
    ).catch((error) => {
      console.error("Failed to save theme preference:", error);
      setTheme(previousTheme);
    });
  };

  return {
    ...profileQuery,
    theme,
    resolvedTheme,
    selectTheme,
  };
}
