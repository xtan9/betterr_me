import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/recurring-tasks/route";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  mockCreate,
  mockCreateSeriesCreation,
  mockEnsureProfile,
  httpSupabase,
  aiSupabase,
} = vi.hoisted(() => {
  const httpSupabase = {
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  };
  const aiSupabase = {};
  const mockCreate = vi.fn();
  const mockCreateSeriesCreation = vi.fn(() => ({ create: mockCreate }));
  return {
    mockCreate,
    mockCreateSeriesCreation,
    mockEnsureProfile: vi.fn(),
    httpSupabase,
    aiSupabase,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => httpSupabase),
}));

vi.mock("@/lib/db/ensure-profile", () => ({
  ensureProfile: mockEnsureProfile,
}));

vi.mock("@/lib/db", () => ({
  TasksDB: class {},
  RecurringTasksDB: class {},
}));

vi.mock("@/lib/recurring-tasks/creation", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/recurring-tasks/creation")
  >("@/lib/recurring-tasks/creation");
  return { ...actual, createSeriesCreation: mockCreateSeriesCreation };
});

const presentedRecurringTask = {
  id: "series-1",
  user_id: "user-123",
  title: "Daily review",
  description: "Review the plan",
  priority: 2,
  category_id: "00000000-0000-0000-0000-000000000001",
  due_time: "09:00:00",
  recurrence_rule: { frequency: "daily", interval: 1 },
  start_date: "2026-08-01",
  end_type: "after_count",
  end_date: null,
  end_count: 3,
  instances_generated: 3,
  next_generate_date: "2026-08-08",
  status: "active",
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

const aiContext: ToolContext = {
  userId: "user-123",
  supabase: aiSupabase as ToolContext["supabase"],
  date: "2026-08-01",
  timezone: "America/Toronto",
};

function createRecurringTaskTool() {
  return taskTools().find((tool) => tool.name === "createRecurringTask")!;
}

describe("AI and HTTP Series creation parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureProfile.mockResolvedValue(undefined);
    mockCreate.mockResolvedValue({
      mode: "legacy",
      recurringTask: presentedRecurringTask,
    });
  });

  it("maps equivalent product and AI intents to one shared creation request", async () => {
    const aiResult = await createRecurringTaskTool().execute(
      {
        title: "Daily review",
        description: "  Review the plan  ",
        priority: 2,
        categoryId: "00000000-0000-0000-0000-000000000001",
        dueTime: "09:00",
        startDate: "2026-08-01",
        recurrenceRule: { frequency: "daily", interval: 1 },
        endType: "after_count",
        endCount: 3,
      },
      aiContext,
    );
    const httpResponse = await POST(
      new NextRequest("http://localhost:3000/api/recurring-tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Daily review",
          description: "Review the plan",
          priority: 2,
          category_id: "00000000-0000-0000-0000-000000000001",
          due_time: "09:00:00",
          recurrence_rule: { frequency: "daily", interval: 1 },
          start_date: "2026-08-01",
          end_type: "after_count",
          end_count: 3,
          date: "2026-08-01",
        }),
      }),
    );

    expect(aiResult).toEqual(presentedRecurringTask);
    expect(httpResponse.status).toBe(201);
    expect(await httpResponse.json()).toEqual({
      recurring_task: presentedRecurringTask,
    });
    expect(mockCreateSeriesCreation).toHaveBeenNthCalledWith(1, aiSupabase);
    expect(mockCreateSeriesCreation).toHaveBeenNthCalledWith(2, httpSupabase);
    expect(mockCreate.mock.calls).toEqual([
      [
        {
          userId: "user-123",
          title: "Daily review",
          description: "Review the plan",
          priority: 2,
          categoryId: "00000000-0000-0000-0000-000000000001",
          dueTime: "09:00:00",
          recurrenceRule: { frequency: "daily", interval: 1 },
          legacyStartDate: "2026-08-01",
          endType: "after_count",
          endDate: null,
          endCount: 3,
          coverageThrough: "2026-08-08",
        },
      ],
      [
        {
          userId: "user-123",
          title: "Daily review",
          description: "Review the plan",
          priority: 2,
          categoryId: "00000000-0000-0000-0000-000000000001",
          dueTime: "09:00:00",
          recurrenceRule: { frequency: "daily", interval: 1 },
          legacyStartDate: "2026-08-01",
          endType: "after_count",
          endDate: null,
          endCount: 3,
          coverageThrough: "2026-08-08",
        },
      ],
    ]);
  });

  it.each([
    [
      "conflict",
      {
        status: "conflict",
        type: "conflict",
        reason: "request changed",
      },
      { ai: { error: "Recurring task creation conflict" }, status: 409 },
    ],
    [
      "coverage-unavailable",
      {
        status: "coverage-unavailable",
        type: "coverage-unavailable",
        requestedRange: { from: "2026-08-01", to: "2026-08-08" },
        coverageHorizon: "2026-08-01",
        reason: "coverage unavailable",
      },
      {
        ai: { error: "Recurring task coverage is temporarily unavailable" },
        status: 503,
      },
    ],
    [
      "not-found",
      { status: "not-found", type: "not-found" },
      { ai: { error: "Recurring task not found" }, status: 404 },
    ],
    [
      "invalid-transition",
      {
        status: "invalid-transition",
        type: "invalid-transition",
        reason: "Series cannot be activated",
      },
      { ai: { error: "Series cannot be activated" }, status: 400 },
    ],
  ] as const)(
    "keeps the %s lifecycle outcome typed at each channel boundary",
    async (_name, outcome, expected) => {
      mockCreate.mockResolvedValue({ mode: "lifecycle", outcome });

      const aiResult = await createRecurringTaskTool().execute(
        {
          title: "Daily review",
          startDate: "2026-08-01",
          recurrenceRule: { frequency: "daily", interval: 1 },
        },
        aiContext,
      );
      const httpResponse = await POST(
        new NextRequest("http://localhost:3000/api/recurring-tasks", {
          method: "POST",
          body: JSON.stringify({
            title: "Daily review",
            recurrence_rule: { frequency: "daily", interval: 1 },
            start_date: "2026-08-01",
            date: "2026-08-01",
          }),
        }),
      );

      expect(aiResult).toEqual(expected.ai);
      expect(httpResponse.status).toBe(expected.status);
      expect(await httpResponse.json()).toEqual(expected.ai);
    },
  );
});
