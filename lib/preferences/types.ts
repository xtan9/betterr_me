export const PREFERENCE_UNAVAILABLE_REASONS = [
  "invalidStoredValue",
  "sourceUnavailable",
  "dependencyUnavailable",
  "identityEmailUnavailable",
  "userTimeZoneUnresolved",
] as const;

export type PreferenceUnavailableReason =
  (typeof PREFERENCE_UNAVAILABLE_REASONS)[number];

export type PreferenceState<Value> =
  | { status: "ready"; value: Value }
  | { status: "unavailable"; reason: PreferenceUnavailableReason };

export type ThemePreference = "system" | "light" | "dark";
export type WeekStartPreference = "sunday" | "monday";
export type WeightUnitPreference = "kg" | "lbs";

export type PushQuietWindow =
  | { status: "disabled" }
  | {
      status: "enabled";
      startLocal: string;
      endLocal: string;
    };

export type UserTimeZone =
  | { status: "resolved"; value: string }
  | { status: "unresolved" };

export type PreferenceStorage = Record<string, unknown> | null | undefined;

export interface AppearancePreferences {
  theme: PreferenceState<ThemePreference>;
}

export interface LocalizationPreferences {
  weekStart: PreferenceState<WeekStartPreference>;
}

export interface FitnessPreferences {
  weightUnit: PreferenceState<WeightUnitPreference>;
}

export interface NotificationPreferences {
  reminderEmail: PreferenceState<{ enabled: boolean }>;
  pushQuietWindow: PreferenceState<PushQuietWindow>;
}
