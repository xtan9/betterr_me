"use client";

import { useCallback } from "react";
import {
  useCurrentProfileCommands,
  type UseCurrentProfileCommandsResult,
  type UseCurrentProfileOptions,
} from "@/lib/hooks/use-current-profile";
import type {
  AppearancePreferenceIntent,
  AppearancePreferenceOutcome,
  FitnessPreferenceOutcome,
  FitnessPreferenceIntent,
  LocalizationPreferenceIntent,
  NotificationPreferenceIntent,
  NotificationPreferenceOutcome,
  ProfileDetailsCommand,
  ProfileDetailsOutcome,
  PushQuietWindowCommandValue,
  UserTimeZoneCommand,
} from "@/lib/preferences/commands";
import type {
  PreferenceState,
  PushQuietWindow,
  ThemePreference,
  UserTimeZone,
  WeekStartPreference,
  WeightUnitPreference,
} from "@/lib/preferences/types";

export type DomainPreferenceState<Value> =
  | { status: "loading" }
  | { status: "pending"; value: Value }
  | PreferenceState<Value>;

function pendingIntent<T>(
  commands: UseCurrentProfileCommandsResult,
  concept: string,
): T | undefined {
  return commands.pendingIntents[concept] as T | undefined;
}

function present<Value>(
  accepted: PreferenceState<Value> | undefined,
  pending: Value | undefined,
): DomainPreferenceState<Value> {
  if (pending !== undefined) return { status: "pending", value: pending };
  return accepted ?? { status: "loading" };
}

export function useAppearancePreference(options?: UseCurrentProfileOptions) {
  const commands = useCurrentProfileCommands(options);
  const { runCommand } = commands;
  const accepted = commands.currentProfile?.preferences.appearance.theme;
  const pending = pendingIntent<AppearancePreferenceIntent>(commands, "appearance");
  const theme = present(accepted, pending?.theme);
  const selectTheme = useCallback(
    (value: ThemePreference) =>
      runCommand<AppearancePreferenceOutcome>("appearance", "/api/preferences/appearance", {
        type: "setTheme",
        theme: value,
      }),
    [runCommand],
  );

  return {
    ...commands,
    theme,
    acceptedTheme: accepted,
    selectTheme,
    isPending: commands.isPending("appearance"),
  };
}

export function useLocalizationPreference(options?: UseCurrentProfileOptions) {
  const commands = useCurrentProfileCommands(options);
  const { runCommand } = commands;
  const accepted = commands.currentProfile?.preferences.localization.weekStart;
  const pending = pendingIntent<LocalizationPreferenceIntent>(commands, "localization");
  const weekStart = present(accepted, pending?.weekStart);
  const setWeekStart = useCallback(
    (value: WeekStartPreference) =>
      runCommand<unknown>("localization", "/api/preferences/localization", {
        type: "setWeekStart",
        weekStart: value,
      }),
    [runCommand],
  );

  return {
    ...commands,
    weekStart,
    acceptedWeekStart: accepted,
    setWeekStart,
    isPending: commands.isPending("localization"),
  };
}

export function useFitnessPreference(options?: UseCurrentProfileOptions) {
  const commands = useCurrentProfileCommands(options);
  const { runCommand } = commands;
  const accepted = commands.currentProfile?.preferences.fitness.weightUnit;
  const pending = pendingIntent<FitnessPreferenceIntent>(commands, "fitness");
  const weightUnit = present(accepted, pending?.weightUnit);
  const setWeightUnit = useCallback(
    (value: WeightUnitPreference): Promise<FitnessPreferenceOutcome> =>
      runCommand<FitnessPreferenceOutcome>("fitness", "/api/preferences/fitness", {
        type: "setWeightUnit",
        weightUnit: value,
      }),
    [runCommand],
  );

  return {
    ...commands,
    weightUnit,
    acceptedWeightUnit: accepted,
    setWeightUnit,
    isPending: commands.isPending("fitness"),
  };
}

export function useNotificationPreferences(options?: UseCurrentProfileOptions) {
  const commands = useCurrentProfileCommands(options);
  const { runCommand } = commands;
  const accepted = commands.currentProfile?.preferences.notifications;
  const pending = pendingIntent<NotificationPreferenceIntent>(commands, "notifications");
  const reminderPending =
    pending?.type === "setReminderEmail" ? pending.enabled : undefined;
  const quietPending =
    pending?.type === "setPushQuietWindow" ? pending.value : undefined;
  const reminderEmail = present(accepted?.reminderEmail, reminderPending === undefined
    ? undefined
    : { enabled: reminderPending });
  const pushQuietWindow = present(accepted?.pushQuietWindow, quietPending);

  const setReminderEmail = useCallback(
    (enabled: boolean) =>
      runCommand<NotificationPreferenceOutcome>(
        "notifications",
        "/api/preferences/notifications",
        {
          type: "setReminderEmail",
          enabled,
        },
      ),
    [runCommand],
  );
  const setPushQuietWindow = useCallback(
    (value: PushQuietWindowCommandValue) =>
      runCommand<NotificationPreferenceOutcome>(
        "notifications",
        "/api/preferences/notifications",
        {
          type: "setPushQuietWindow",
          value,
        },
      ),
    [runCommand],
  );

  return {
    ...commands,
    reminderEmail,
    pushQuietWindow,
    setReminderEmail,
    setPushQuietWindow,
    isPending: commands.isPending("notifications"),
  };
}

export function useProfileDetails(options?: UseCurrentProfileOptions) {
  const commands = useCurrentProfileCommands(options);
  const { runCommand } = commands;
  const details = commands.currentProfile?.profileDetails;
  const updateProfileDetails = useCallback(
    (value: ProfileDetailsCommand): Promise<ProfileDetailsOutcome> =>
      runCommand<ProfileDetailsOutcome>(
        "profileDetails",
        "/api/profile-details",
        value,
        "PATCH",
      ),
    [runCommand],
  );

  return { ...commands, details, updateProfileDetails };
}

export function useUserTimeZone(options?: UseCurrentProfileOptions) {
  const commands = useCurrentProfileCommands(options);
  const { runCommand } = commands;
  const timeZone: UserTimeZone = commands.currentProfile?.userTimeZone ?? {
    status: "unresolved",
  };
  const setUserTimeZone = useCallback(
    (value: UserTimeZoneCommand["timeZone"]) =>
      runCommand<unknown>(
        "userTimeZone",
        "/api/user-time-zone",
        { timeZone: value },
        "PUT",
      ),
    [runCommand],
  );

  return { ...commands, timeZone, setUserTimeZone };
}

export type {
  PreferenceState,
  PushQuietWindow,
  ThemePreference,
  WeekStartPreference,
  WeightUnitPreference,
};
