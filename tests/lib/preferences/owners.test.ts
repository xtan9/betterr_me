import { describe, expect, it } from "vitest";
import {
  decodeAppearancePreferences,
  decodeFitnessPreferences,
  decodeLocalizationPreferences,
  decodeNotificationPreferences,
  decodeUserTimeZone,
} from "@/lib/preferences/owners";

describe("Preference Owners", () => {
  it("resolves the supported Appearance and Localization values", () => {
    expect(decodeAppearancePreferences({ theme: "dark" })).toEqual({
      theme: { status: "ready", value: "dark" },
    });
    expect(decodeLocalizationPreferences({ week_start_day: 0 })).toEqual({
      weekStart: { status: "ready", value: "sunday" },
    });
  });

  it("makes an invalid Weight Unit unavailable without affecting other owners", () => {
    expect(decodeFitnessPreferences({ weight_unit: "stones" })).toEqual({
      weightUnit: { status: "unavailable", reason: "invalidStoredValue" },
    });
    expect(decodeAppearancePreferences({ theme: "light" })).toEqual({
      theme: { status: "ready", value: "light" },
    });
  });

  it("keeps disabled Reminder Email valid without an Identity Email", () => {
    expect(
      decodeNotificationPreferences(
        { email_notifications_enabled: false },
        null,
        null,
      ).reminderEmail,
    ).toEqual({ status: "ready", value: { enabled: false } });
  });

  it("does not claim enabled Reminder Email is accepted without an Identity Email", () => {
    expect(
      decodeNotificationPreferences(
        { email_notifications_enabled: true },
        null,
        null,
      ).reminderEmail,
    ).toEqual({
      status: "unavailable",
      reason: "identityEmailUnavailable",
    });
  });

  it("requires paired, distinct Push Quiet Window endpoints and a resolved zone", () => {
    expect(
      decodeNotificationPreferences(
        { quiet_hours_start: "22:00", quiet_hours_end: "07:00" },
        "person@example.com",
        "America/Los_Angeles",
      ).pushQuietWindow,
    ).toEqual({
      status: "ready",
      value: { status: "enabled", startLocal: "22:00", endLocal: "07:00" },
    });

    expect(
      decodeNotificationPreferences(
        { quiet_hours_start: "22:00", quiet_hours_end: null },
        "person@example.com",
        "America/Los_Angeles",
      ).pushQuietWindow,
    ).toEqual({ status: "unavailable", reason: "invalidStoredValue" });

    expect(
      decodeNotificationPreferences(
        { quiet_hours_start: "22:00", quiet_hours_end: "07:00" },
        "person@example.com",
        null,
      ).pushQuietWindow,
    ).toEqual({ status: "unavailable", reason: "userTimeZoneUnresolved" });
  });

  it("resolves only valid IANA User Time Zones", () => {
    expect(decodeUserTimeZone("America/New_York")).toEqual({
      status: "resolved",
      value: "America/New_York",
    });
    expect(decodeUserTimeZone("not/a-time-zone")).toEqual({
      status: "unresolved",
    });
  });
});
