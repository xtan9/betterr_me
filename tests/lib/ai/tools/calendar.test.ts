import { describe, it, expect, vi, beforeEach } from "vitest";
import { calendarTools } from "@/lib/ai/tools/calendar";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetUserEvents = vi.fn();
const mockCreateEvent = vi.fn();
const mockUpdateEvent = vi.fn();
const mockDeleteEvent = vi.fn();

vi.mock("@/lib/db", () => ({
  CalendarEventsDB: class {
    getUserEvents = mockGetUserEvents;
    createEvent = mockCreateEvent;
    updateEvent = mockUpdateEvent;
    deleteEvent = mockDeleteEvent;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return calendarTools().find((t) => t.name === name)!;
}

describe("calendarTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 4 tool definitions", () => {
    const tools = calendarTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "getUpcomingEvents",
      "createEvent",
      "updateEvent",
      "deleteEvent",
    ]);
  });

  it("updateEvent transforms camelCase params to snake_case", async () => {
    const ctx = makeCtx();
    mockUpdateEvent.mockResolvedValue({ id: "e1", title: "Updated" });
    await findTool("updateEvent").execute(
      { eventId: "e1", title: "Updated", startDate: "2026-04-15" },
      ctx,
    );
    expect(mockUpdateEvent).toHaveBeenCalledWith("e1", "user-123", {
      title: "Updated",
      start_date: "2026-04-15",
    });
  });

  it("deleteEvent returns success", async () => {
    const ctx = makeCtx();
    mockDeleteEvent.mockResolvedValue(undefined);
    const result = await findTool("deleteEvent").execute(
      { eventId: "e1" },
      ctx,
    );
    expect(mockDeleteEvent).toHaveBeenCalledWith("e1", "user-123");
    expect(result).toEqual({ success: true });
  });
});
