import { z } from "zod";
import type {
  PushQuietWindow,
  ThemePreference,
  WeekStartPreference,
  WeightUnitPreference,
} from "./types";
import { THEME_PREFERENCE_VALUES } from "./owners";

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const appearancePreferenceIntentSchema = z
  .object({ type: z.literal("setTheme"), theme: z.enum(THEME_PREFERENCE_VALUES) })
  .strict();

export const localizationPreferenceIntentSchema = z
  .object({ type: z.literal("setWeekStart"), weekStart: z.enum(["sunday", "monday"]) })
  .strict();

export const fitnessPreferenceIntentSchema = z
  .object({ type: z.literal("setWeightUnit"), weightUnit: z.enum(["kg", "lbs"]) })
  .strict();

const quietWindowValueSchema = z
  .union([
    z.object({ status: z.literal("disabled") }).strict(),
    z
      .object({
        status: z.literal("enabled"),
        startLocal: localTime,
        endLocal: localTime,
      })
      .strict()
      .refine((value) => value.startLocal !== value.endLocal, {
        message: "Push Quiet Window endpoints must be distinct",
      }),
  ]);

export const notificationPreferenceIntentSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("setReminderEmail"), enabled: z.boolean() })
    .strict(),
  z
    .object({ type: z.literal("setPushQuietWindow"), value: quietWindowValueSchema })
    .strict(),
]);

export const profileDetailsCommandSchema = z
  .object({
    fullName: z.string().trim().max(200).nullable().optional(),
    avatarUrl: z.string().trim().url().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one Profile Details field must be provided",
  });

export const userTimeZoneCommandSchema = z
  .object({ timeZone: z.string().trim().min(1).max(100).nullable() })
  .strict();

export type AppearancePreferenceIntent = z.infer<
  typeof appearancePreferenceIntentSchema
>;
export type LocalizationPreferenceIntent = z.infer<
  typeof localizationPreferenceIntentSchema
>;
export type FitnessPreferenceIntent = z.infer<typeof fitnessPreferenceIntentSchema>;
export type NotificationPreferenceIntent = z.infer<
  typeof notificationPreferenceIntentSchema
>;
export type ProfileDetailsCommand = z.infer<typeof profileDetailsCommandSchema>;
export type PushQuietWindowCommandValue = z.infer<typeof quietWindowValueSchema>;
export type UserTimeZoneCommand = z.infer<typeof userTimeZoneCommandSchema>;

export type PreferenceCommandOutcome<Value> = {
  value: Value;
  preferenceRevision: number;
  changed: boolean;
};

export type AppearancePreferenceOutcome = {
  theme: ThemePreference;
  preferenceRevision: number;
  changed: boolean;
};

export type LocalizationPreferenceOutcome = {
  weekStart: WeekStartPreference;
  preferenceRevision: number;
  changed: boolean;
};

export type FitnessPreferenceOutcome = {
  weightUnit: WeightUnitPreference;
  preferenceRevision: number;
  changed: boolean;
};

export type NotificationPreferenceOutcome =
  | {
      reminderEmail: { enabled: boolean };
      preferenceRevision: number;
      changed: boolean;
    }
  | {
      pushQuietWindow: PushQuietWindow;
      preferenceRevision: number;
      changed: boolean;
    };

export type ProfileDetailsOutcome = {
  fullName: string | null;
  avatarUrl: string | null;
  changed: boolean;
};

export type UserTimeZoneOutcome = {
  timeZone: string | null;
  changed: boolean;
};
