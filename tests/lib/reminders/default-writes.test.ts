import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ReminderDefaultWrites,
  type ReminderDefaultWritesPersistence,
} from "@/lib/reminders/default-writes";

describe("ReminderDefaultWrites", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps a trusted source default into the persistence port", async () => {
    const defaultRecord = {
      id: "default-1",
      user_id: "trusted-user",
      source_type: "task",
      relative_minutes: 15,
      channels: ["email"],
      created_at: "2026-08-01T12:00:00Z",
    } as const;
    const upsertDefault = vi.fn().mockResolvedValue(defaultRecord);
    const writes = new ReminderDefaultWrites({ upsertDefault });

    await expect(
      writes.upsert({
        userId: "trusted-user",
        default: {
          sourceType: "task",
          relativeMinutes: 15,
          channels: ["email"],
        },
      }),
    ).resolves.toEqual({ type: "upserted", default: defaultRecord });
    expect(upsertDefault).toHaveBeenCalledWith("trusted-user", {
      sourceType: "task",
      relativeMinutes: 15,
      channels: ["email"],
    });
  });

  it("does not hide a persistence failure", async () => {
    const error = new Error("defaults unavailable");
    const persistence: ReminderDefaultWritesPersistence = {
      upsertDefault: vi.fn().mockRejectedValue(error),
    };
    const writes = new ReminderDefaultWrites(persistence);

    await expect(
      writes.upsert({
        userId: "trusted-user",
        default: {
          sourceType: "habit",
          relativeMinutes: 30,
          channels: ["push"],
        },
      }),
    ).rejects.toBe(error);
  });
});
