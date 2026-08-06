import { readFileSync } from "node:fs";
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
    expect(page).toContain("/api/calendar-events");

    expect(adapter).toContain("Intl.DateTimeFormat().resolvedOptions().timeZone");
    expect(adapter).toContain("responseSchema.safeParse");
    expect(adapter).toContain("status: \"idle\"");
    expect(adapter).toContain("status: \"loading\"");
    expect(adapter).toContain("status: \"complete\"");
    expect(adapter).toContain("status: \"degraded\"");
    expect(adapter).toContain("status: \"failed\"");
    expect(adapter).toContain("overlayItemsToDisplayItems");
    expect(adapter).not.toContain("useSWR");
  });
});
