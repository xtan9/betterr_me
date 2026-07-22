import { describe, expect, it, vi } from "vitest";
import { checkChatRateLimit } from "@/lib/ai/rate-limit";

describe("checkChatRateLimit", () => {
  it("returns normalized remaining quotas", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ allowed: true, minute_remaining: 7, day_remaining: 82 }],
        error: null,
      }),
    };

    await expect(checkChatRateLimit(supabase as never, "user-1")).resolves.toEqual({
      allowed: true,
      minuteRemaining: 7,
      dayRemaining: 82,
    });
  });

  it("returns exceeded when either database quota is exhausted", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ allowed: false, minute_remaining: 0, day_remaining: 50 }],
        error: null,
      }),
    };

    await expect(checkChatRateLimit(supabase as never, "user-1")).resolves.toEqual({
      allowed: false,
      reason: "exceeded",
    });
  });

  it("fails closed on RPC errors", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("missing function") }),
    };

    await expect(checkChatRateLimit(supabase as never, "user-1")).resolves.toEqual({
      allowed: false,
      reason: "unavailable",
    });
  });
});
