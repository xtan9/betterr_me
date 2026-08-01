import {
  type AppearancePreferences,
  type FitnessPreferences,
  type LocalizationPreferences,
  type NotificationPreferences,
  type PreferenceState,
  type PreferenceStorage,
  type PushQuietWindow,
  type ThemePreference,
  type UserTimeZone,
  type WeightUnitPreference,
  type WeekStartPreference,
} from "./types";

export type {
  AppearancePreferences,
  FitnessPreferences,
  LocalizationPreferences,
  NotificationPreferences,
  PreferenceState,
  PreferenceStorage,
  PushQuietWindow,
  ThemePreference,
  UserTimeZone,
  WeekStartPreference,
  WeightUnitPreference,
} from "./types";

export const THEME_PREFERENCE_VALUES = ["system", "light", "dark"] as const;
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    THEME_PREFERENCE_VALUES.includes(value as ThemePreference)
  );
}

export const WEIGHT_UNIT_PREFERENCE_VALUES = ["kg", "lbs"] as const;
export const DEFAULT_WEIGHT_UNIT_PREFERENCE: WeightUnitPreference = "kg";

export function isWeightUnitPreference(
  value: unknown,
): value is WeightUnitPreference {
  return (
    typeof value === "string" &&
    WEIGHT_UNIT_PREFERENCE_VALUES.includes(value as WeightUnitPreference)
  );
}

export type WeekStartDay = 0 | 1;
export const DEFAULT_REMINDER_EMAIL_PREFERENCE = { enabled: false } as const;

const unavailable = <Value>(
  reason: import("./types").PreferenceUnavailableReason,
): PreferenceState<Value> => ({
  status: "unavailable",
  reason,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const decodeEnum = <Value extends string>(
  value: unknown,
  supported: readonly Value[],
): PreferenceState<Value> =>
  typeof value === "string" && supported.includes(value as Value)
    ? { status: "ready", value: value as Value }
    : unavailable("invalidStoredValue");

export const DEFAULT_WEEK_START_PREFERENCE: WeekStartPreference = "monday";

export function weekStartPreferenceToDay(
  preference: WeekStartPreference,
): WeekStartDay {
  return preference === "sunday" ? 0 : 1;
}

export function weekStartDayToPreference(
  day: WeekStartDay,
): WeekStartPreference {
  return day === 0 ? "sunday" : "monday";
}

export function decodeAppearancePreferences(
  preferences: PreferenceStorage,
): AppearancePreferences {
  const stored = isRecord(preferences) ? preferences : null;
  const storedTheme = stored?.theme;
  return {
    theme:
      storedTheme === undefined
        ? { status: "ready", value: DEFAULT_THEME_PREFERENCE }
        : decodeEnum(storedTheme, THEME_PREFERENCE_VALUES),
  };
}

export function decodeLocalizationPreferences(
  preferences: PreferenceStorage,
): LocalizationPreferences {
  if (
    preferences !== null &&
    preferences !== undefined &&
    !isRecord(preferences)
  ) {
    return {
      weekStart: unavailable("invalidStoredValue"),
    };
  }
  const stored = isRecord(preferences) ? preferences : null;
  const storedWeekStart = stored?.week_start_day;
  const weekStart =
    storedWeekStart === undefined || storedWeekStart === null
      ? ({ status: "ready", value: DEFAULT_WEEK_START_PREFERENCE } as const)
      : storedWeekStart === 0
      ? ({ status: "ready", value: "sunday" } as const)
      : storedWeekStart === 1
        ? ({ status: "ready", value: "monday" } as const)
        : unavailable<WeekStartPreference>("invalidStoredValue");

  return { weekStart };
}

export function decodeFitnessPreferences(
  preferences: PreferenceStorage,
): FitnessPreferences {
  const stored = isRecord(preferences) ? preferences : null;
  const storedWeightUnit = stored?.weight_unit;
  return {
    weightUnit:
      storedWeightUnit === undefined
        ? { status: "ready", value: DEFAULT_WEIGHT_UNIT_PREFERENCE }
        : decodeEnum(storedWeightUnit, WEIGHT_UNIT_PREFERENCE_VALUES),
  };
}

const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidLocalTime(value: unknown): value is string {
  return typeof value === "string" && LOCAL_TIME_PATTERN.test(value);
}

function decodeReminderEmail(
  stored: Record<string, unknown> | null,
  identityEmail: string | null,
): NotificationPreferences["reminderEmail"] {
  const enabled = stored?.email_notifications_enabled;
  if (enabled === undefined) {
    return { status: "ready", value: { enabled: false } };
  }
  if (typeof enabled !== "boolean") {
    return unavailable("invalidStoredValue");
  }
  if (!enabled) return { status: "ready", value: { enabled: false } };
  if (!identityEmail) return unavailable("identityEmailUnavailable");
  return { status: "ready", value: { enabled: true } };
}

function decodePushQuietWindow(
  stored: Record<string, unknown> | null,
  timeZone: UserTimeZone,
): PreferenceState<PushQuietWindow> {
  const start = stored?.quiet_hours_start;
  const end = stored?.quiet_hours_end;

  if (start === null && end === null) {
    return { status: "ready", value: { status: "disabled" } };
  }

  if (!isValidLocalTime(start) || !isValidLocalTime(end) || start === end) {
    return unavailable("invalidStoredValue");
  }

  if (timeZone.status !== "resolved") {
    return unavailable("userTimeZoneUnresolved");
  }

  return {
    status: "ready",
    value: { status: "enabled", startLocal: start, endLocal: end },
  };
}

export function decodeNotificationPreferences(
  preferences: PreferenceStorage,
  identityEmail: string | null,
  timeZone: string | null,
): NotificationPreferences {
  const stored = isRecord(preferences) ? preferences : null;
  return {
    reminderEmail: decodeReminderEmail(stored, identityEmail),
    pushQuietWindow: decodePushQuietWindow(
      stored,
      decodeUserTimeZone(timeZone),
    ),
  };
}

export function decodeUserTimeZone(value: unknown): UserTimeZone {
  if (typeof value !== "string" || value.length === 0) {
    return { status: "unresolved" };
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return { status: "resolved", value };
  } catch {
    return { status: "unresolved" };
  }
}
