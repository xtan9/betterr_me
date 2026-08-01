import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createReminderDefaultWrites } from "@/lib/reminders/default-writes";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";

describe("createReminderDefaultWrites persistence adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse({
      id: "default-1",
      user_id: "trusted-user",
      source_type: "task",
      relative_minutes: 15,
      channels: ["push"],
      created_at: "2026-08-01T12:00:00Z",
    });
  });

  afterEach(() => restoreMockSupabaseThen());

  it("keeps the trusted user identity at the persistence boundary", async () => {
    const writes = createReminderDefaultWrites(
      mockSupabaseClient as unknown as SupabaseClient,
    );

    await expect(
      writes.upsert({
        userId: "trusted-user",
        default: {
          sourceType: "task",
          relativeMinutes: 15,
          channels: ["push"],
        },
      }),
    ).resolves.toMatchObject({ type: "upserted" });
    expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
      {
        source_type: "task",
        relative_minutes: 15,
        channels: ["push"],
        user_id: "trusted-user",
      },
      { onConflict: "user_id,source_type" },
    );
  });
});
