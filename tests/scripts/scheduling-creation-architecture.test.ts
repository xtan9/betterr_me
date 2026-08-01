import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

function section(contents: string, start: string, end: string): string {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not find architecture section ${start}`);
  }
  return contents.slice(startIndex, endIndex);
}

describe("Scheduling creation architecture boundaries", () => {
  it("routes HTTP creation through SchedulingWrites without a persistence bypass", () => {
    const route = source("app/api/calendar-events/route.ts");
    const post = section(route, "export async function POST", "\n  } catch");

    expect(post).toContain("createSchedulingWrites(supabase).create");
    expect(post).not.toMatch(/new CalendarEventsDB|\.createEvent\(|SchedulingLifecycle/);
  });

  it("routes AI creation through the same SchedulingWrites boundary", () => {
    const tools = source("lib/ai/tools/calendar.ts");
    const create = section(tools, 'name: "createEvent"', 'name: "updateEvent"');

    expect(create).toContain("createSchedulingWrites(ctx.supabase).create");
    expect(create).not.toMatch(/new CalendarEventsDB|\.createEvent\(/);
  });

  it("keeps AI confirmation and query presentation contracts outside the write seam", () => {
    const tools = source("lib/ai/tools/calendar.ts");
    expect(tools).toContain("new CalendarEventsDB(ctx.supabase)");
    expect(tools).toContain("Always confirm with the user first");
  });

  it("removes all calendar event writes from the generic persistence inventory", () => {
    const calendarDb = source("lib/db/calendar-events.ts");

    expect(calendarDb).not.toMatch(/async createEvent\s*\(/);
    expect(calendarDb).not.toMatch(/async updateEvent\s*\(/);
    expect(calendarDb).not.toMatch(/async deleteEvent\s*\(/);
    expect(calendarDb).not.toContain("CalendarEventInsert");
    expect(calendarDb).not.toContain("CalendarEventUpdate");
    expect(calendarDb).toContain("async getUserEvents");
    expect(calendarDb).toContain("async getEvent");
  });

  it("keeps the creation request and outcome storage-independent", () => {
    const writes = source("lib/scheduling/writes.ts");
    const requestStart = writes.indexOf("export interface ScheduleEventInput");
    const recordStart = writes.indexOf("export interface ScheduleEventRecord");
    const request = writes.slice(requestStart, recordStart);

    expect(request).not.toContain("Supabase");
    expect(request).not.toContain("CalendarEventInsert");
    expect(request).not.toContain("user_id");
    expect(request).not.toContain("start_date");
    expect(request).toContain("userId");
    expect(request).toContain("startDate");
    expect(writes).not.toContain("@/lib/db");
  });

  it("keeps expected related-entity, recurrence, and reminder outcomes typed", () => {
    const writes = source("lib/scheduling/writes.ts");
    expect(writes).toContain('{ type: "not-found"; related?: "category" | "recurringEvent" }');
    expect(writes).toContain('{ type: "conflict"; resource?: "event" | "reminder"');
    expect(writes).toContain('{ type: "invalid"; field: string; message: string }');
    expect(source("supabase/migrations/20260802000008_centralize_scheduling_creation.sql")).toContain(
      "Duplicate reminder configuration",
    );
  });
});
