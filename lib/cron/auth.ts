import { createHmac, timingSafeEqual } from "crypto";

export type CronAuthorizationResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; error: "Unauthorized" | "Server misconfigured" };

export function authorizeCronRequest(
  authorization: string | null,
): CronAuthorizationResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }
  const expected = `Bearer ${secret}`;
  const actual = authorization ?? "";
  const key = "cron-auth-compare";
  const actualDigest = createHmac("sha256", key).update(actual).digest();
  const expectedDigest = createHmac("sha256", key).update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest)
    ? { ok: true }
    : { ok: false, status: 401, error: "Unauthorized" };
}
