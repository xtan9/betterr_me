import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilesDB } from "@/lib/db/profiles";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("ProfilesDB Current Profile projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse({
      full_name: "Taylor Example",
      avatar_url: null,
      timezone: "America/Los_Angeles",
      role: "user",
      preferences: { theme: "system" },
      preference_revision: 0,
    });
  });

  afterEach(() => restoreMockSupabaseThen());

  it("selects only the explicit Current Profile storage projection", async () => {
    const db = new ProfilesDB(mockSupabaseClient as unknown as SupabaseClient);

    await expect(db.getCurrentProfileProjection("user-123")).resolves.toMatchObject({
      full_name: "Taylor Example",
      preference_revision: 0,
    });

    mockSupabaseClient.expectQuery({
      table: "profiles",
      method: "select",
      args: [
        "full_name, avatar_url, timezone, role, preferences, preference_revision",
      ],
    });
    expect(
      mockSupabaseClient.queryLog.some(
        (entry) => entry.method === "select" && entry.args[0] === "*",
      ),
    ).toBe(false);
  });

  it("exposes narrow owner readers without selecting a profile row", async () => {
    const db = new ProfilesDB(mockSupabaseClient as unknown as SupabaseClient);
    mockSupabaseClient.setMockResponse({ weight_unit: "lbs" });
    await expect(db.getWeightUnitPreference("user-123")).resolves.toBe("lbs");
    expect(mockSupabaseClient.queryLog.findLast((entry) => entry.method === "select")?.args[0]).toBe(
      "weight_unit:preferences->>weight_unit",
    );

    mockSupabaseClient.setMockResponse({ week_start: "0" });
    await expect(db.getWeekStartPreference("user-123")).resolves.toBe(0);
    expect(mockSupabaseClient.queryLog.findLast((entry) => entry.method === "select")?.args[0]).toBe(
      "week_start:preferences->>week_start_day",
    );

    mockSupabaseClient.setMockResponse({
      preferences: { email_notifications_enabled: false },
      timezone: null,
    });
    await expect(
      db.getNotificationPreferenceProjection("user-123"),
    ).resolves.toEqual({
      preferences: { email_notifications_enabled: false },
      timezone: null,
    });
    expect(mockSupabaseClient.queryLog.findLast((entry) => entry.method === "select")?.args[0]).toBe(
      "preferences, timezone",
    );
  });
});
