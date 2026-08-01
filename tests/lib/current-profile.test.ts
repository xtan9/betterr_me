import { describe, expect, it } from "vitest";
import {
  composeCurrentProfile,
  decodeCurrentProfileResponse,
} from "@/lib/current-profile";

const projection = {
  full_name: "Taylor Example",
  avatar_url: "https://example.com/avatar.png",
  timezone: "America/Los_Angeles",
  role: "admin" as const,
  preference_revision: 7,
  preferences: {
    date_format: "MM/DD/YYYY",
    theme: "dark",
    week_start_day: 1,
    weight_unit: "lbs",
    email_notifications_enabled: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
    unknown_key: "kept-private",
  },
};

describe("Current Profile", () => {
  it("composes a domain-shaped private snapshot without storage fields", () => {
    const result = composeCurrentProfile({
      identityEmail: "taylor@example.com",
      projection,
    });

    expect(result).toEqual({
      identity: { email: "taylor@example.com" },
      profileDetails: {
        fullName: "Taylor Example",
        avatarUrl: "https://example.com/avatar.png",
      },
      userTimeZone: {
        status: "resolved",
        value: "America/Los_Angeles",
      },
      capabilities: { canAccessAdmin: true },
      preferences: {
        preferenceRevision: 7,
        appearance: { theme: { status: "ready", value: "dark" } },
        localization: { weekStart: { status: "ready", value: "monday" } },
        fitness: { weightUnit: { status: "ready", value: "lbs" } },
        notifications: {
          reminderEmail: { status: "ready", value: { enabled: false } },
          pushQuietWindow: { status: "ready", value: { status: "disabled" } },
        },
      },
      issues: [],
    });

    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("role");
    expect(result).not.toHaveProperty("email_notifications_enabled");
  });

  it("keeps malformed concepts unavailable while preserving valid concepts", () => {
    const result = composeCurrentProfile({
      identityEmail: null,
      projection: {
        ...projection,
        role: "user",
        preferences: {
          ...projection.preferences,
          theme: "neon",
          weight_unit: "stones",
        },
      },
    });

    expect(result.preferences.appearance.theme).toEqual({
      status: "unavailable",
      reason: "invalidStoredValue",
    });
    expect(result.preferences.fitness.weightUnit).toEqual({
      status: "unavailable",
      reason: "invalidStoredValue",
    });
    expect(result.preferences.localization.weekStart).toEqual({
      status: "ready",
      value: "monday",
    });
  });

  it("accepts only the canonical currentProfile envelope", () => {
    const currentProfile = composeCurrentProfile({
      identityEmail: "taylor@example.com",
      projection,
    });

    expect(decodeCurrentProfileResponse({ currentProfile })).toEqual({
      currentProfile,
    });
    expect(() =>
      decodeCurrentProfileResponse({ profile: currentProfile }),
    ).toThrow();
  });
});
