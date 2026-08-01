import { describe, expect, it } from "vitest";
import {
  composeCurrentProfile,
  composeCurrentProfileResponse,
  decodeCurrentProfileResponse,
} from "@/lib/current-profile";

const projection = {
  id: "profile-123",
  email: "stale-profile@example.com",
  full_name: "Taylor Example",
  avatar_url: "https://example.com/avatar.png",
  timezone: "America/Los_Angeles",
  role: "admin" as const,
  preference_revision: 7,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
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
      capabilities: { canAccessAdmin: false },
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
      capabilities: { canAccessAdmin: false },
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
    const malformedProjection = {
      ...projection,
      role: "user",
      preferences: {
        ...projection.preferences,
        theme: "neon",
        weight_unit: "stones",
      },
    };
    const result = composeCurrentProfile({
      identityEmail: null,
      capabilities: { canAccessAdmin: false },
      projection: malformedProjection,
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

  it("publishes kilograms as the assigned Fitness default when storage omits Weight Unit", () => {
    const { weight_unit: _weightUnit, ...preferencesWithoutWeightUnit } =
      projection.preferences;
    const result = composeCurrentProfile({
      identityEmail: "taylor@example.com",
      capabilities: { canAccessAdmin: false },
      projection: {
        ...projection,
        preferences: preferencesWithoutWeightUnit,
      },
    });

    expect(result.preferences.fitness.weightUnit).toEqual({
      status: "ready",
      value: "kg",
    });
  });

  it("treats a missing Reminder Email value as disabled and ready", () => {
    const result = composeCurrentProfile({
      identityEmail: null,
      capabilities: { canAccessAdmin: false },
      projection: {
        ...projection,
        preferences: {
          ...projection.preferences,
          email_notifications_enabled: undefined,
        },
      },
    });

    expect(result.preferences.notifications.reminderEmail).toEqual({
      status: "ready",
      value: { enabled: false },
    });
    expect(result.issues).toEqual([]);
  });

  it("marks enabled Reminder Email unavailable when Identity Email is unverified", () => {
    const result = composeCurrentProfile({
      identityEmail: null,
      capabilities: { canAccessAdmin: false },
      projection: {
        ...projection,
        preferences: {
          ...projection.preferences,
          email_notifications_enabled: true,
        },
      },
    });

    expect(result.preferences.notifications.reminderEmail).toEqual({
      status: "unavailable",
      reason: "identityEmailUnavailable",
    });
    expect(result.issues).toContainEqual({
      scope: "notifications.reminderEmail",
      code: "identityEmailUnavailable",
    });
  });

  it("preserves a complete stored Push Quiet Window while reporting an unresolved zone", () => {
    const storedWindow = {
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    };
    const result = composeCurrentProfile({
      identityEmail: "taylor@example.com",
      capabilities: { canAccessAdmin: false },
      projection: {
        ...projection,
        timezone: null,
        preferences: { ...projection.preferences, ...storedWindow },
      },
    });

    expect(result.preferences.notifications.pushQuietWindow).toEqual({
      status: "unavailable",
      reason: "userTimeZoneUnresolved",
    });
    expect(result.issues).toContainEqual({
      scope: "notifications.pushQuietWindow",
      code: "userTimeZoneUnresolved",
    });
    expect(storedWindow).toEqual({
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    });
  });

  it("accepts only the canonical currentProfile envelope", () => {
    const currentProfile = composeCurrentProfile({
      identityEmail: "taylor@example.com",
      capabilities: { canAccessAdmin: true },
      projection,
    });

    expect(decodeCurrentProfileResponse({ currentProfile })).toEqual({
      currentProfile,
    });
    expect(() =>
      decodeCurrentProfileResponse({ profile: currentProfile }),
    ).toThrow();
  });

  it("uses the same canonical response composer for server hydration and API reads", () => {
    const response = composeCurrentProfileResponse({
      identityEmail: "taylor@example.com",
      capabilities: { canAccessAdmin: true },
      projection,
    });

    expect(decodeCurrentProfileResponse(response)).toEqual(response);
    expect(response).toEqual({
      currentProfile: composeCurrentProfile({
        identityEmail: "taylor@example.com",
        capabilities: { canAccessAdmin: true },
        projection,
      }),
    });
  });

  it("takes capabilities from authorization input rather than stored role", () => {
    const userProjection = { ...projection, role: "user" };
    const result = composeCurrentProfile({
      identityEmail: "taylor@example.com",
      capabilities: { canAccessAdmin: true },
      projection: userProjection,
    });

    expect(result.capabilities).toEqual({ canAccessAdmin: true });
  });
});
