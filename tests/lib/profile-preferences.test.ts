import { describe, expect, it } from "vitest";
import { emailNotificationsEnabled } from "@/lib/profile-preferences";
import type { Profile } from "@/lib/db/types";

function profile(
  legacyValue: boolean,
  acceptedValue?: boolean,
): Profile {
  return {
    email_notifications_enabled: legacyValue,
    preferences: {
      date_format: "MM/DD/YYYY",
      week_start_day: 1,
      theme: "system",
      weight_unit: "kg",
      email_notifications_enabled: acceptedValue,
    },
  } as Profile;
}

describe("emailNotificationsEnabled", () => {
  it("uses the accepted preference instead of a stale legacy value", () => {
    expect(emailNotificationsEnabled(profile(true, false))).toBe(false);
    expect(emailNotificationsEnabled(profile(false, true))).toBe(true);
  });

  it("falls back to the legacy value while profiles are being migrated", () => {
    expect(emailNotificationsEnabled(profile(true))).toBe(true);
    expect(emailNotificationsEnabled(profile(false))).toBe(false);
  });
});
