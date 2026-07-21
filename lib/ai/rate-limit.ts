import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/logger";

export type ChatRateLimitResult =
  | { allowed: true; minuteRemaining: number; dayRemaining: number }
  | { allowed: false; reason: "exceeded" | "unavailable" };

interface RateLimitRow {
  allowed: boolean;
  minute_remaining: number;
  day_remaining: number;
}

export async function checkChatRateLimit(
  supabase: SupabaseClient,
  userId: string,
): Promise<ChatRateLimitResult> {
  try {
    const { data, error } = await supabase.rpc("check_ai_chat_rate_limit", {
      p_user_id: userId,
    });
    if (error) {
      log.error("[chat-rate-limit] RPC failed; denying request", error, { userId });
      return { allowed: false, reason: "unavailable" };
    }

    const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
    if (
      !row ||
      typeof row.allowed !== "boolean" ||
      !Number.isFinite(row.minute_remaining) ||
      !Number.isFinite(row.day_remaining)
    ) {
      log.error("[chat-rate-limit] RPC returned invalid data; denying request", undefined, {
        userId,
      });
      return { allowed: false, reason: "unavailable" };
    }

    return row.allowed
      ? {
          allowed: true,
          minuteRemaining: Math.max(0, row.minute_remaining),
          dayRemaining: Math.max(0, row.day_remaining),
        }
      : { allowed: false, reason: "exceeded" };
  } catch (error) {
    log.error("[chat-rate-limit] Unexpected failure; denying request", error, { userId });
    return { allowed: false, reason: "unavailable" };
  }
}
