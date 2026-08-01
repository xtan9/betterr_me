"use client";

import { useTheme } from "next-themes";
import { useAppearancePreference } from "@/lib/hooks/use-profile-preferences";

export function useProfileTheme() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const profileQuery = useAppearancePreference();

  const selectTheme = (value: string) => {
    if (value !== "light" && value !== "dark" && value !== "system") return;

    const previousTheme = theme ?? "system";
    setTheme(value);

    void profileQuery.selectTheme(value).catch((error) => {
      console.error("Failed to save theme preference:", error);
      setTheme(previousTheme);
    });
  };

  return {
    ...profileQuery,
    theme:
      profileQuery.theme.status === "ready" ||
      profileQuery.theme.status === "pending"
        ? profileQuery.theme.value
        : theme ?? "system",
    resolvedTheme,
    selectTheme,
  };
}
