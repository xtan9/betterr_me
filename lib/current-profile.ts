import { z } from "zod";
import {
  decodeAppearancePreferences,
  decodeFitnessPreferences,
  decodeLocalizationPreferences,
  decodeNotificationPreferences,
  decodeUserTimeZone,
  type PreferenceState,
  type PreferenceStorage,
  type PushQuietWindow,
  type UserTimeZone,
} from "@/lib/preferences/owners";
import {
  PREFERENCE_UNAVAILABLE_REASONS,
  type PreferenceUnavailableReason,
} from "@/lib/preferences/types";

export interface CurrentProfileProjection {
  full_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  preferences: PreferenceStorage;
  preference_revision: number;
}

export interface CurrentProfileCapabilities {
  canAccessAdmin: boolean;
}

export type CurrentProfileIssueScope =
  | "appearance.theme"
  | "localization.weekStart"
  | "fitness.weightUnit"
  | "notifications.reminderEmail"
  | "notifications.pushQuietWindow";

export interface CurrentProfileIssue {
  scope: CurrentProfileIssueScope;
  code: PreferenceUnavailableReason;
}

export interface CurrentProfile {
  identity: { email: string | null };
  profileDetails: { fullName: string | null; avatarUrl: string | null };
  userTimeZone: UserTimeZone;
  capabilities: CurrentProfileCapabilities;
  preferences: {
    preferenceRevision: number;
    appearance: ReturnType<typeof decodeAppearancePreferences>;
    localization: ReturnType<typeof decodeLocalizationPreferences>;
    fitness: ReturnType<typeof decodeFitnessPreferences>;
    notifications: ReturnType<typeof decodeNotificationPreferences>;
  };
  issues: CurrentProfileIssue[];
}

export interface CurrentProfileResponse {
  currentProfile: CurrentProfile;
}

export interface CurrentProfileCompositionInput {
  identityEmail: string | null;
  capabilities: CurrentProfileCapabilities;
  projection: CurrentProfileProjection;
}

const unavailableReasonSchema = z.enum(PREFERENCE_UNAVAILABLE_REASONS);

const issueScopeSchema = z.enum([
  "appearance.theme",
  "localization.weekStart",
  "fitness.weightUnit",
  "notifications.reminderEmail",
  "notifications.pushQuietWindow",
]);

const preferenceStateSchema = <Value extends z.ZodTypeAny>(value: Value) =>
  z.union([
    z.object({ status: z.literal("ready"), value }).strict(),
    z
      .object({
        status: z.literal("unavailable"),
        reason: unavailableReasonSchema,
      })
      .strict(),
  ]);

const pushQuietWindowSchema = z.union([
  z.object({ status: z.literal("disabled") }).strict(),
  z
    .object({
      status: z.literal("enabled"),
      startLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      endLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .strict(),
]);

const userTimeZoneSchema = z.union([
  z.object({ status: z.literal("resolved"), value: z.string().min(1) }).strict(),
  z.object({ status: z.literal("unresolved") }).strict(),
]);

export const currentProfileSchema = z
  .object({
    identity: z.object({ email: z.string().email().nullable() }).strict(),
    profileDetails: z
      .object({ fullName: z.string().nullable(), avatarUrl: z.string().nullable() })
      .strict(),
    userTimeZone: userTimeZoneSchema,
    capabilities: z.object({ canAccessAdmin: z.boolean() }).strict(),
    preferences: z
      .object({
        preferenceRevision: z.number().int().nonnegative(),
        appearance: z.object({
          theme: preferenceStateSchema(z.enum(["system", "light", "dark"])),
        }).strict(),
        localization: z.object({
          weekStart: preferenceStateSchema(z.enum(["sunday", "monday"])),
        }).strict(),
        fitness: z.object({
          weightUnit: preferenceStateSchema(z.enum(["kg", "lbs"])),
        }).strict(),
        notifications: z.object({
          reminderEmail: preferenceStateSchema(
            z.object({ enabled: z.boolean() }).strict(),
          ),
          pushQuietWindow: preferenceStateSchema(pushQuietWindowSchema),
        }).strict(),
      })
      .strict(),
    issues: z.array(
      z
        .object({
          scope: issueScopeSchema,
          code: unavailableReasonSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const currentProfileResponseSchema = z
  .object({ currentProfile: currentProfileSchema })
  .strict();

function collectIssues(
  preferences: CurrentProfile["preferences"],
): CurrentProfile["issues"] {
  const issues: CurrentProfile["issues"] = [];
  const add = (scope: CurrentProfileIssueScope, state: PreferenceState<unknown>) => {
    if (state.status === "unavailable") {
      issues.push({ scope, code: state.reason });
    }
  };

  add("appearance.theme", preferences.appearance.theme);
  add("localization.weekStart", preferences.localization.weekStart);
  add("fitness.weightUnit", preferences.fitness.weightUnit);
  add("notifications.reminderEmail", preferences.notifications.reminderEmail);
  add("notifications.pushQuietWindow", preferences.notifications.pushQuietWindow);
  return issues;
}

export function composeCurrentProfile(
  input: CurrentProfileCompositionInput,
): CurrentProfile {
  const userTimeZone = decodeUserTimeZone(input.projection.timezone);
  const appearance = decodeAppearancePreferences(input.projection.preferences);
  const localization = decodeLocalizationPreferences(input.projection.preferences);
  const fitness = decodeFitnessPreferences(input.projection.preferences);
  const notifications = decodeNotificationPreferences(
    input.projection.preferences,
    input.identityEmail,
    userTimeZone.status === "resolved" ? userTimeZone.value : null,
  );
  const preferences = {
    preferenceRevision: input.projection.preference_revision,
    appearance,
    localization,
    fitness,
    notifications,
  };

  return {
    identity: { email: input.identityEmail },
    profileDetails: {
      fullName: input.projection.full_name,
      avatarUrl: input.projection.avatar_url,
    },
    userTimeZone,
    capabilities: input.capabilities,
    preferences,
    issues: collectIssues(preferences),
  };
}

export function composeCurrentProfileResponse(
  input: CurrentProfileCompositionInput,
): CurrentProfileResponse {
  return { currentProfile: composeCurrentProfile(input) };
}

export function decodeCurrentProfileResponse(
  value: unknown,
): CurrentProfileResponse {
  return currentProfileResponseSchema.parse(value);
}

export type { PushQuietWindow };
