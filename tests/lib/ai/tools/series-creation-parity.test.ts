import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/recurring-tasks/route";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  mockCreateSeries,
  mockCreateCapabilities,
  mockToRecurringTaskResponse,
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
  const mockCreateSeries = vi.fn();
  const mockCreateCapabilities = vi.fn();
  const mockToRecurringTaskResponse = vi.fn();
  return {
    mockCreateSeries,
    mockCreateCapabilities,
    mockToRecurringTaskResponse,
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

vi.mock("@/lib/recurring-tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recurring-tasks")>(
    "@/lib/recurring-tasks",
  );
  return {
    ...actual,
    createAuthenticatedRecurringTaskCapabilities: mockCreateCapabilities,
  };
});

vi.mock("@/lib/recurring-tasks/compatibility", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/recurring-tasks/compatibility")
  >("@/lib/recurring-tasks/compatibility");
  return { ...actual, toRecurringTaskResponse: mockToRecurringTaskResponse };
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
  status: "active",
  version: "rt-series-v1.test-version",
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

function lifecycleSeries() {
  return {
    id: "series-1",
    userId: "user-123",
    status: "active" as const,
    timeZone: "America/Toronto",
    recurrenceAnchor: "2026-08-01",
    activationDate: "2026-08-01",
    occurrenceLimit: 3,
    lastScheduledDate: null,
    coverageHorizon: "2026-08-07",
    currentRevisionId: "revision-1",
    revisionToken: 1,
    revisions: [{
      id: "revision-1",
      seriesId: "series-1",
      effectiveFrom: "2026-08-01",
      effectiveTo: null,
      state: "active" as const,
      recurrenceRule: { frequency: "daily" as const, interval: 1 },
      recurrenceAnchor: "2026-08-01",
      activationDate: "2026-08-01",
      defaults: {
        title: "Daily review",
        description: "Review the plan",
        priority: 2 as const,
        categoryId: "00000000-0000-0000-0000-000000000001",
        dueTime: "09:00:00",
      },
      createdAt: "2026-08-01T12:00:00.000Z",
    }],
    occurrences: [1, 2, 3].map((index) => ({
      id: `occurrence-${index}`,
      seriesId: "series-1",
      revisionId: "revision-1",
      scheduledDate: `2026-08-0${index}`,
      dueDate: null,
      details: {
        title: "Daily review",
        description: "Review the plan",
        priority: 2 as const,
        categoryId: "00000000-0000-0000-0000-000000000001",
        dueTime: "09:00:00",
      },
      state: "open" as const,
      overrides: {},
      taskId: null,
      completedAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
    })),
    intentionalAbsences: [],
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
  };
}

function capabilitySeries() {
  const { userId: _userId, revisionToken: _revisionToken, ...projection } =
    lifecycleSeries();
  return { ...projection, version: "rt-series-v1.test-version" };
}

describe("AI and HTTP Series creation parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureProfile.mockResolvedValue(undefined);
    mockCreateCapabilities.mockReturnValue({
      seriesCommands: { createSeries: mockCreateSeries },
      seriesQueries: { listSeries: vi.fn(), getSeries: vi.fn() },
      coverage: { ensure: vi.fn() },
    });
    mockToRecurringTaskResponse.mockReturnValue(presentedRecurringTask);
    mockCreateSeries.mockResolvedValue({
      type: "created",
      status: "complete",
      operation: "recurring-task.series.create",
      operationId: "series-create-1",
      series: capabilitySeries(),
    });
  });

  it("maps equivalent product and AI intents to one shared creation request", async () => {
    const aiResult = await createRecurringTaskTool().execute(
      {
        operationId: "series-create-1",
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
        headers: { "Idempotency-Key": "series-create-1" },
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
    expect(mockCreateCapabilities).toHaveBeenNthCalledWith(1, {
      supabase: aiSupabase,
      principal: {
        type: "user",
        userId: "user-123",
        credential: "mcp",
      },
    });
    expect(mockCreateCapabilities).toHaveBeenNthCalledWith(2, {
      supabase: httpSupabase,
      principal: expect.objectContaining({
        type: "user",
        userId: "user-123",
        credential: "cookie",
      }),
    });
    expect(mockCreateSeries.mock.calls).toEqual([
      [
        {
          operationId: "series-create-1",
          recurrenceRule: { frequency: "daily", interval: 1 },
          recurrenceAnchor: "2026-08-01",
          activationDate: "2026-08-01",
          defaults: {
            title: "Daily review",
            description: "Review the plan",
            priority: 2,
            categoryId: "00000000-0000-0000-0000-000000000001",
            dueTime: "09:00:00",
          },
          occurrenceLimit: 3,
          lastScheduledDate: null,
          coverage: { from: "2026-08-01", to: "2026-08-08" },
        },
      ],
      [
        {
          operationId: "series-create-1",
          recurrenceRule: { frequency: "daily", interval: 1 },
          recurrenceAnchor: "2026-08-01",
          activationDate: "2026-08-01",
          defaults: {
            title: "Daily review",
            description: "Review the plan",
            priority: 2,
            categoryId: "00000000-0000-0000-0000-000000000001",
            dueTime: "09:00:00",
          },
          occurrenceLimit: 3,
          lastScheduledDate: null,
          coverage: { from: "2026-08-01", to: "2026-08-08" },
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
      mockCreateSeries.mockResolvedValue({
        ...outcome,
        operation: "recurring-task.series.create",
        operationId: "series-create-1",
      });

      const aiResult = await createRecurringTaskTool().execute(
        {
          operationId: "series-create-1",
          title: "Daily review",
          startDate: "2026-08-01",
          recurrenceRule: { frequency: "daily", interval: 1 },
        },
        aiContext,
      );
      const httpResponse = await POST(
        new NextRequest("http://localhost:3000/api/recurring-tasks", {
          method: "POST",
          headers: { "Idempotency-Key": "series-create-1" },
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
