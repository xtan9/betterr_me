/** Applies accepted preference revisions without overwriting newer Current Profile facts. */

import type {
  PushQuietWindow,
  CurrentProfile,
  CurrentProfileResponse,
} from "@/lib/current-profile";

import { isThemePreference, isWeightUnitPreference } from "@/lib/preferences/owners";

export const PREFERENCE_CONCEPTS = [
  "appearance",
  "localization",
  "fitness",
  "notifications",
] as const;

export type PreferenceConcept = (typeof PREFERENCE_CONCEPTS)[number];

type PreferenceRevisionOutcome = Record<string, unknown> & {
  preferenceRevision: number;
  changed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPreferenceRevisionOutcome(
  value: unknown,
): value is PreferenceRevisionOutcome {
  return (
    isRecord(value) &&
    typeof value.preferenceRevision === "number" &&
    Number.isInteger(value.preferenceRevision) &&
    value.preferenceRevision >= 0 &&
    typeof value.changed === "boolean"
  );
}

function readyPreference<Value>(value: Value) {
  return { status: "ready" as const, value };
}

function isPushQuietWindow(value: unknown): value is PushQuietWindow {
  return (
    isRecord(value) &&
    (value.status === "disabled" ||
      (value.status === "enabled" &&
        typeof value.startLocal === "string" &&
        typeof value.endLocal === "string"))
  );
}

function replacePreferenceIssue(
  profile: CurrentProfile,
  scope: CurrentProfile["issues"][number]["scope"],
): CurrentProfile["issues"] {
  return profile.issues.filter((issue) => issue.scope !== scope);
}

export function applyNarrowPreferenceOutcome(
  current: CurrentProfileResponse,
  concept: PreferenceConcept,
  outcome: unknown,
): CurrentProfileResponse | undefined {
  if (!isPreferenceRevisionOutcome(outcome) || !outcome.changed) return undefined;

  const profile = current.currentProfile;
  let nextProfile: CurrentProfile;

  if (
    concept === "appearance" &&
    isRecord(outcome) &&
    isThemePreference(outcome.theme)
  ) {
    nextProfile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        preferenceRevision: Math.max(
          profile.preferences.preferenceRevision,
          outcome.preferenceRevision,
        ),
        appearance: { theme: readyPreference(outcome.theme) },
      },
      issues: replacePreferenceIssue(profile, "appearance.theme"),
    };
  } else if (
    concept === "localization" &&
    isRecord(outcome) &&
    (outcome.weekStart === "sunday" || outcome.weekStart === "monday")
  ) {
    nextProfile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        preferenceRevision: Math.max(
          profile.preferences.preferenceRevision,
          outcome.preferenceRevision,
        ),
        localization: { weekStart: readyPreference(outcome.weekStart) },
      },
      issues: replacePreferenceIssue(profile, "localization.weekStart"),
    };
  } else if (
    concept === "fitness" &&
    isRecord(outcome) &&
    isWeightUnitPreference(outcome.weightUnit)
  ) {
    nextProfile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        preferenceRevision: Math.max(
          profile.preferences.preferenceRevision,
          outcome.preferenceRevision,
        ),
        fitness: { weightUnit: readyPreference(outcome.weightUnit) },
      },
      issues: replacePreferenceIssue(profile, "fitness.weightUnit"),
    };
  } else if (
    concept === "notifications" &&
    isRecord(outcome) &&
    isRecord(outcome.reminderEmail) &&
    typeof outcome.reminderEmail.enabled === "boolean"
  ) {
    nextProfile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        preferenceRevision: Math.max(
          profile.preferences.preferenceRevision,
          outcome.preferenceRevision,
        ),
        notifications: {
          ...profile.preferences.notifications,
          reminderEmail: {
            status: "ready",
            value: { enabled: outcome.reminderEmail.enabled },
          },
        },
      },
      issues: replacePreferenceIssue(profile, "notifications.reminderEmail"),
    };
  } else if (
    concept === "notifications" &&
    isRecord(outcome) &&
    isPushQuietWindow(outcome.pushQuietWindow)
  ) {
    nextProfile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        preferenceRevision: Math.max(
          profile.preferences.preferenceRevision,
          outcome.preferenceRevision,
        ),
        notifications: {
          ...profile.preferences.notifications,
          pushQuietWindow: readyPreference(outcome.pushQuietWindow),
        },
      },
      issues: replacePreferenceIssue(profile, "notifications.pushQuietWindow"),
    };
  } else {
    return undefined;
  }

  return { ...current, currentProfile: nextProfile };
}

/** Keep a newer accepted preference revision when a slower request resolves late. */
export function acceptCurrentProfileSnapshot(
  current: CurrentProfileResponse | undefined,
  next: CurrentProfileResponse,
): CurrentProfileResponse {
  if (
    current &&
    next.currentProfile.preferences.preferenceRevision <
      current.currentProfile.preferences.preferenceRevision
  ) {
    return current;
  }
  return next;
}
