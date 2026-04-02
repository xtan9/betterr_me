import { describe, it, expect } from "vitest";
import { getNotificationUrl } from "@/lib/push/notification-urls";

describe("getNotificationUrl", () => {
  it("returns /calendar?date=YYYY-MM-DD for calendar_event with date context", () => {
    expect(getNotificationUrl("calendar_event", { date: "2026-04-02" })).toBe(
      "/calendar?date=2026-04-02"
    );
  });

  it("returns /calendar for calendar_event without date context", () => {
    expect(getNotificationUrl("calendar_event")).toBe("/calendar");
  });

  it("returns /tasks for task", () => {
    expect(getNotificationUrl("task")).toBe("/tasks");
  });

  it("returns /habits for habit", () => {
    expect(getNotificationUrl("habit")).toBe("/habits");
  });

  it("returns /money/bills for bill", () => {
    expect(getNotificationUrl("bill")).toBe("/money/bills");
  });
});
