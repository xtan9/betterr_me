import { describe, expect, it } from "vitest";
import {
  decodeAppearancePreferences,
  decodeFitnessPreferences,
  decodeLocalizationPreferences,
  decodeNotificationPreferences,
  decodeUserTimeZone,
  weekStartDayToPreference,
  weekStartPreferenceToDay,
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

  it("assigns System as the Appearance default when no Theme Preference is stored", () => {
    expect(decodeAppearancePreferences(null)).toEqual({
      theme: { status: "ready", value: "system" },
    });
    expect(decodeAppearancePreferences({})).toEqual({
      theme: { status: "ready", value: "system" },
    });
  });

  it("keeps an invalid stored Theme Preference unavailable", () => {
    expect(decodeAppearancePreferences({ theme: "sepia" })).toEqual({
      theme: { status: "unavailable", reason: "invalidStoredValue" },
    });
  });

  it("uses Monday as the Localization default when Week Start is missing", () => {
    expect(decodeLocalizationPreferences(null)).toEqual({
      weekStart: { status: "ready", value: "monday" },
    });
    expect(decodeLocalizationPreferences({})).toEqual({
      weekStart: { status: "ready", value: "monday" },
    });
  });

  it("converts only accepted Week Start values to their boundary days", () => {
    expect(weekStartPreferenceToDay("sunday")).toBe(0);
    expect(weekStartPreferenceToDay("monday")).toBe(1);
    expect(weekStartDayToPreference(0)).toBe("sunday");
    expect(weekStartDayToPreference(1)).toBe("monday");
  });

  it("keeps unsupported stored Week Start values unavailable", () => {
    expect(decodeLocalizationPreferences({ week_start_day: 2 })).toEqual({
      weekStart: { status: "unavailable", reason: "invalidStoredValue" },
    });
    expect(decodeLocalizationPreferences("sunday" as never)).toEqual({
      weekStart: { status: "unavailable", reason: "invalidStoredValue" },
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

  it("assigns kilograms as the Fitness default when no Weight Unit is stored", () => {
    expect(decodeFitnessPreferences(null)).toEqual({
      weightUnit: { status: "ready", value: "kg" },
    });
    expect(decodeFitnessPreferences({})).toEqual({
      weightUnit: { status: "ready", value: "kg" },
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

  it("defaults Reminder Email to disabled when no stored value exists", () => {
    expect(
      decodeNotificationPreferences({}, null, null).reminderEmail,
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

  it("keeps the disabled Push Quiet Window ready without a User Time Zone", () => {
    expect(
      decodeNotificationPreferences(
        { quiet_hours_start: null, quiet_hours_end: null },
        null,
        null,
      ).pushQuietWindow,
    ).toEqual({ status: "ready", value: { status: "disabled" } });
  });

  it("does not accept malformed or zero-length stored windows", () => {
    expect(
      decodeNotificationPreferences(
        { quiet_hours_start: "22:00", quiet_hours_end: "22:00" },
        null,
        "America/Los_Angeles",
      ).pushQuietWindow,
    ).toEqual({ status: "unavailable", reason: "invalidStoredValue" });

    expect(
      decodeNotificationPreferences(
        { quiet_hours_start: "22:00", quiet_hours_end: null },
        null,
        "America/Los_Angeles",
      ).pushQuietWindow,
    ).toEqual({ status: "unavailable", reason: "invalidStoredValue" });
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
