import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentProfileDB } from "@/lib/db/current-profile";
import { FitnessDB } from "@/lib/db/fitness";
import { LocalizationDB } from "@/lib/db/localization";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Profile owner readers and Current Profile projection", () => {
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
    const db = new CurrentProfileDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(db.getCurrentProfileProjection("user-123")).resolves.toEqual({
      full_name: "Taylor Example",
      avatar_url: null,
      timezone: "America/Los_Angeles",
      preferences: { theme: "system" },
      preference_revision: 0,
    });

    mockSupabaseClient.expectQuery({
      table: "profiles",
      method: "select",
      args: [
        "full_name, avatar_url, timezone, preferences, preference_revision",
      ],
    });
    expect(
      mockSupabaseClient.queryLog.some(
        (entry) => entry.method === "select" && entry.args[0] === "*",
      ),
    ).toBe(false);
  });

  it("exposes a narrow Fitness owner reader without selecting a profile row", async () => {
    const db = new FitnessDB(mockSupabaseClient as unknown as SupabaseClient);
    mockSupabaseClient.setMockResponse({ weight_unit: "lbs" });
    await expect(
      db.getWeightUnitPreference("user-123"),
    ).resolves.toBe("lbs");
    expect(mockSupabaseClient.queryLog.findLast((entry) => entry.method === "select")?.args[0]).toBe(
      "weight_unit:preferences->>weight_unit",
    );

    mockSupabaseClient.setMockResponse({ weight_unit: "stones" });
    await expect(
      db.getWeightUnitPreference("user-123"),
    ).resolves.toBeNull();

    mockSupabaseClient.setMockResponse({ week_start: "0" });
    const localizationDB = new LocalizationDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );
    await expect(
      localizationDB.getWeekStartPreference("user-123"),
    ).resolves.toBe("sunday");
    expect(mockSupabaseClient.queryLog.findLast((entry) => entry.method === "select")?.args[0]).toBe(
      "week_start:preferences->>week_start_day",
    );

  });

  it("treats a missing Fitness owner row as unavailable and propagates other read errors", async () => {
    const db = new FitnessDB(mockSupabaseClient as unknown as SupabaseClient);

    mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });
    await expect(
      db.getWeightUnitPreference("user-123"),
    ).resolves.toBeNull();

    const databaseError = new Error("database unavailable");
    mockSupabaseClient.setMockResponse(null, databaseError);
    await expect(
      db.getWeightUnitPreference("user-123"),
    ).rejects.toThrow("database unavailable");
  });
});
