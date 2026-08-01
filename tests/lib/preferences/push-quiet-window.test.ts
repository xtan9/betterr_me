import { describe, expect, it } from "vitest";
import { isPushQuietWindowActive } from "@/lib/preferences/push-quiet-window";

const resolvedNewYork = {
  status: "resolved" as const,
  value: "America/New_York",
};

const enabledWindow = (startLocal: string, endLocal: string) => ({
  status: "ready" as const,
  value: { status: "enabled" as const, startLocal, endLocal },
});

describe("Notifications Push Quiet Window evaluation", () => {
  it("does not suppress push when the accepted window is disabled", () => {
    expect(
      isPushQuietWindowActive(
        { status: "ready", value: { status: "disabled" } },
        { status: "unresolved" },
        new Date("2026-08-01T13:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("does not suppress push for an unavailable stored window", () => {
    expect(
      isPushQuietWindowActive(
        { status: "unavailable", reason: "userTimeZoneUnresolved" },
        { status: "unresolved" },
        new Date("2026-08-01T13:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("uses a start-inclusive, end-exclusive same-day interval", () => {
    const window = enabledWindow("09:00", "17:00");

    expect(
      isPushQuietWindowActive(
        window,
        resolvedNewYork,
        new Date("2026-08-01T13:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isPushQuietWindowActive(
        window,
        resolvedNewYork,
        new Date("2026-08-01T21:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("supports a window crossing midnight without suppressing midday push", () => {
    const window = enabledWindow("22:00", "07:00");

    expect(
      isPushQuietWindowActive(
        window,
        resolvedNewYork,
        new Date("2026-08-02T02:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isPushQuietWindowActive(
        window,
        resolvedNewYork,
        new Date("2026-08-02T03:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isPushQuietWindowActive(
        window,
        resolvedNewYork,
        new Date("2026-08-01T16:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isPushQuietWindowActive(
        window,
        resolvedNewYork,
        new Date("2026-08-01T11:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("fails open when a resolved zone cannot produce a local wall-clock time", () => {
    expect(
      isPushQuietWindowActive(
        enabledWindow("22:00", "07:00"),
        { status: "resolved", value: "Invalid/Timezone" },
        new Date("2026-08-01T13:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
