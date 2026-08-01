import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/reminders/route";
import { reminderTools } from "@/lib/ai/tools/reminders";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  mockAuthenticateRequest,
  mockConfigureTaskReminders,
  mockTaskReminderResponse,
  mockSupabase,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockConfigureTaskReminders: vi.fn(),
  mockTaskReminderResponse: vi.fn((reminder: unknown) => reminder),
  mockSupabase: {},
}));

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mockAuthenticateRequest,
  cookieRouteErrorMessage: () => "Unauthorized",
}));

vi.mock("@/lib/db", () => ({
  RemindersDB: class {},
}));

vi.mock("@/lib/reminders/fire-at", () => ({
  computeFireAt: vi.fn(),
}));

vi.mock("@/lib/tasks/writes", () => ({
  createTaskWrites: vi.fn(() => ({
    configureReminders: mockConfigureTaskReminders,
  })),
  toTaskReminderResponse: mockTaskReminderResponse,
}));

function authenticated() {
  return {
    ok: true as const,
    outcome: "authenticated" as const,
    principal: {
      type: "user" as const,
      userId: "user-123",
      credential: "cookie" as const,
      profile: {
        email: "test@example.com",
        fullName: "Test User",
        avatarUrl: null,
      },
    },
    permissions: ["read", "write"] as const,
    requiredPermission: "write" as const,
    client: mockSupabase,
  };
}

function createTool() {
  return reminderTools().find((tool) => tool.name === "createReminder")!;
}

const aiContext: ToolContext = {
  userId: "user-123",
  supabase: mockSupabase as ToolContext["supabase"],
  date: "2026-08-01",
  timezone: "America/Toronto",
};

const configuredReminder = {
  id: "reminder-123",
  userId: "user-123",
  taskId: "11111111-1111-1111-1111-111111111111",
  reminderType: "absolute" as const,
  relativeMinutes: null,
  absoluteTime: "2026-08-03T09:00:00Z",
  channels: ["push"] as const,
  status: "pending" as const,
  fireAt: "2026-08-03T09:00:00.000Z",
  sentAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("AI and HTTP Task Reminder Configuration parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(authenticated());
    mockConfigureTaskReminders.mockResolvedValue({
      type: "configured",
      reminders: [configuredReminder],
    });
  });

  it("maps the same Task intent through both adapters", async () => {
    const aiResult = await createTool().execute(
      {
        sourceType: "task",
        sourceId: "11111111-1111-1111-1111-111111111111",
        fireAt: "2026-08-03T09:00:00Z",
      },
      aiContext,
    );
    const httpResponse = await POST(
      new NextRequest("http://localhost:3000/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          source_type: "task",
          source_id: "11111111-1111-1111-1111-111111111111",
          reminder_type: "absolute",
          absolute_time: "2026-08-03T09:00:00Z",
          channels: ["push"],
          event_start_time: "2026-08-03T10:00:00Z",
        }),
      }),
    );

    expect(aiResult).toEqual(configuredReminder);
    expect(httpResponse.status).toBe(201);
    await expect(httpResponse.json()).resolves.toEqual({
      reminder: configuredReminder,
    });
    expect(mockConfigureTaskReminders).toHaveBeenCalledTimes(2);
    expect(mockConfigureTaskReminders.mock.calls[0][0]).toEqual(
      mockConfigureTaskReminders.mock.calls[1][0],
    );
    expect(mockConfigureTaskReminders.mock.calls[0][0]).toEqual({
      userId: "user-123",
      taskId: "11111111-1111-1111-1111-111111111111",
      reminders: [{
        reminderType: "absolute",
        absoluteTime: "2026-08-03T09:00:00Z",
        channels: ["push"],
      }],
    });
  });

  it("maps typed conflicts consistently", async () => {
    mockConfigureTaskReminders.mockResolvedValue({
      type: "conflict",
      resource: "reminder",
      reason: "Task reminder configuration conflicted",
    });

    await expect(
      createTool().execute(
        {
          sourceType: "task",
          sourceId: "11111111-1111-1111-1111-111111111111",
          fireAt: "2026-08-03T09:00:00Z",
        },
        aiContext,
      ),
    ).resolves.toEqual({ error: "Task reminder configuration conflicted" });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          source_type: "task",
          source_id: "11111111-1111-1111-1111-111111111111",
          reminder_type: "absolute",
          absolute_time: "2026-08-03T09:00:00Z",
          channels: ["push"],
          event_start_time: "2026-08-03T10:00:00Z",
        }),
      }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Task reminder configuration conflicted",
    });
  });

  it("keeps unexpected persistence failures exceptional for both adapters", async () => {
    const failure = new Error("task storage unavailable");
    mockConfigureTaskReminders.mockRejectedValue(failure);

    await expect(
      createTool().execute(
        {
          sourceType: "task",
          sourceId: "11111111-1111-1111-1111-111111111111",
          fireAt: "2026-08-03T09:00:00Z",
        },
        aiContext,
      ),
    ).rejects.toBe(failure);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          source_type: "task",
          source_id: "11111111-1111-1111-1111-111111111111",
          reminder_type: "absolute",
          absolute_time: "2026-08-03T09:00:00Z",
          channels: ["push"],
          event_start_time: "2026-08-03T10:00:00Z",
        }),
      }),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create reminder",
    });
  });
});
