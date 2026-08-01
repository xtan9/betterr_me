import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalizationDB } from "@/lib/db/localization";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("LocalizationDB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => restoreMockSupabaseThen());

  it("reads only the accepted Week Start value", async () => {
    mockSupabaseClient.setMockResponse({ week_start: "0" });
    const db = new LocalizationDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(db.getWeekStartPreference("user-123")).resolves.toBe("sunday");
    expect(
      mockSupabaseClient.queryLog.findLast((entry) => entry.method === "select")
        ?.args[0],
    ).toBe("week_start:preferences->>week_start_day");
  });

  it("does not accept an unsupported stored Week Start value", async () => {
    mockSupabaseClient.setMockResponse({ week_start: "6" });
    const db = new LocalizationDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(db.getWeekStartPreference("user-123")).resolves.toBeNull();
  });

  it("treats a missing profile as an unavailable owner value", async () => {
    mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });
    const db = new LocalizationDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(db.getWeekStartPreference("user-123")).resolves.toBeNull();
  });

  it("propagates an unexpected narrow-reader failure", async () => {
    const error = { code: "PGRST500", message: "database unavailable" };
    mockSupabaseClient.setMockResponse(null, error);
    const db = new LocalizationDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(db.getWeekStartPreference("user-123")).rejects.toBe(error);
  });

  it("returns the accepted owner command result", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        weekStart: "monday",
        preferenceRevision: 9,
        changed: true,
      },
      error: null,
    });
    const db = new LocalizationDB({ rpc } as unknown as SupabaseClient);

    await expect(db.setWeekStartPreference("monday")).resolves.toEqual({
      weekStart: "monday",
      preferenceRevision: 9,
      changed: true,
    });
    expect(rpc).toHaveBeenCalledWith("set_localization_preference", {
      week_start: "monday",
    });
  });
});
