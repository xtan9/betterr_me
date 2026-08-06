import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

describe("Calendar Overlay Feed client boundary", () => {
  it("keeps overlay acquisition and projection inside the supported adapter", () => {
    const page = source("components/calendar/calendar-page-content.tsx");
    const adapter = source("lib/hooks/use-calendar-overlay-feed.ts");

    expect(page).toContain("useCalendarOverlayFeed");
    expect(page).not.toContain("/api/calendar/overlay-feed");
    expect(page).not.toContain("overlayItemsToDisplayItems");
    expect(page).not.toContain("use-calendar-actions");
    expect(page).not.toMatch(/toggle_(?:task|habit)_completion|navigate_workout/);
    expect(page).not.toContain("setHabitCompletion");
    expect(page).toContain("/api/calendar-events");

    expect(adapter).toContain("Intl.DateTimeFormat().resolvedOptions().timeZone");
    expect(adapter).toContain("responseSchema.safeParse");
    expect(adapter).toContain("status: \"idle\"");
    expect(adapter).toContain("status: \"loading\"");
    expect(adapter).toContain("status: \"complete\"");
    expect(adapter).toContain("status: \"degraded\"");
    expect(adapter).toContain("status: \"failed\"");
    expect(adapter).toContain("overlayItemsToDisplayItems");
    expect(adapter).toContain("executeAction");
    expect(adapter).toContain("invalidateOverlayFeedFamily");
    expect(adapter).not.toContain("useSWR");
  });

  it("removes retired action orchestrators without aliases or test-only exports", () => {
    expect(existsSync("hooks/use-calendar-actions.ts")).toBe(false);

    const replacementHooks = readdirSync("hooks")
      .filter((path) => /\.[jt]sx?$/.test(path))
      .filter((path) => {
        const hook = source(`hooks/${path}`);
        return /CalendarOverlay(?:DisplayItem|Action)|toggle_(?:task|habit)_completion|navigate_workout/.test(hook);
      });
    expect(replacementHooks).toEqual([]);

    const adapter = source("lib/hooks/use-calendar-overlay-feed.ts");
    const exports = [...adapter.matchAll(
      /^export (?:interface|type|function|const|class) ([A-Za-z0-9_]+)/gm,
    )].map(([, name]) => name);
    expect(exports).toEqual([
      "CalendarOverlayFeedRange",
      "CalendarOverlayFeedSelection",
      "CalendarOverlayFeedState",
      "CalendarOverlayActionOutcome",
      "CalendarOverlayActionItem",
      "useCalendarOverlayFeed",
    ]);
  });
});
