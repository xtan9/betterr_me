import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/habits/route";
import { habitTools } from "@/lib/ai/tools/habits";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  mockCreate,
  mockLegacyCreateHabit,
  httpSupabase,
  aiSupabase,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockLegacyCreateHabit: vi.fn(),
  httpSupabase: {
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  },
  aiSupabase: {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => httpSupabase),
}));

vi.mock("@/lib/db/ensure-profile", () => ({
  ensureProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    createHabit = mockLegacyCreateHabit;
  },
  HabitLogsDB: class {},
}));

vi.mock("@/lib/habits/writes", () => ({
  createHabitWrites: vi.fn(() => ({ create: mockCreate })),
  toHabitResponse: vi.fn((habit) => ({
    id: habit.id,
    user_id: habit.userId,
    name: habit.name,
    description: habit.description,
    category_id: habit.categoryId,
    frequency: habit.frequency,
    status: habit.status,
    current_streak: habit.currentStreak,
    best_streak: habit.bestStreak,
    paused_at: habit.pausedAt,
    graduated_at: habit.graduatedAt,
    graduated_streak: habit.graduatedStreak,
    nudge_dismissed_at: habit.nudgeDismissedAt,
    created_at: habit.createdAt,
    updated_at: habit.updatedAt,
  })),
}));

const createdHabit = {
  id: "habit-1",
  userId: "user-123",
  name: "Read",
  description: null,
  categoryId: null,
  frequency: { type: "daily" },
  status: "active",
  currentStreak: 0,
  bestStreak: 0,
  pausedAt: null,
  graduatedAt: null,
  graduatedStreak: null,
  nudgeDismissedAt: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const presentedHabit = {
  id: "habit-1",
  user_id: "user-123",
  name: "Read",
  description: null,
  category_id: null,
  frequency: { type: "daily" },
  status: "active",
  current_streak: 0,
  best_streak: 0,
  paused_at: null,
  graduated_at: null,
  graduated_streak: null,
  nudge_dismissed_at: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
};

const aiContext: ToolContext = {
  userId: "user-123",
  supabase: aiSupabase as ToolContext["supabase"],
  date: "2026-08-01",
  timezone: "America/Toronto",
};

function createHabitTool() {
  return habitTools().find((tool) => tool.name === "createHabit")!;
}

describe("AI and HTTP habit creation parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ type: "created", habit: createdHabit });
  });

  it("maps equivalent creation intents through the shared behavior", async () => {
    const aiOutcome = await createHabitTool().execute(
      { name: "Read", frequency: { type: "daily" } },
      aiContext,
    );
    const httpResponse = await POST(
      new NextRequest("http://localhost:3000/api/habits", {
        method: "POST",
        body: JSON.stringify({ name: "Read", frequency: { type: "daily" } }),
      }),
    );

    expect(aiOutcome).toEqual(presentedHabit);
    expect(httpResponse.status).toBe(201);
    expect(await httpResponse.json()).toEqual({ habit: presentedHabit });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls).toEqual([
      [
        {
          userId: "user-123",
          name: "Read",
          description: null,
          categoryId: null,
          frequency: { type: "daily" },
        },
      ],
      [
        {
          userId: "user-123",
          name: "Read",
          description: null,
          categoryId: null,
          frequency: { type: "daily" },
        },
      ],
    ]);
    expect(mockLegacyCreateHabit).not.toHaveBeenCalled();
  });

  it("maps the shared limit outcome to each channel's existing error shape", async () => {
    mockCreate.mockResolvedValue({
      type: "limit-reached",
      activeCount: 20,
      limit: 20,
    });

    const aiOutcome = await createHabitTool().execute(
      { name: "Read", frequency: { type: "daily" } },
      aiContext,
    );
    const httpResponse = await POST(
      new NextRequest("http://localhost:3000/api/habits", {
        method: "POST",
        body: JSON.stringify({ name: "Read", frequency: { type: "daily" } }),
      }),
    );

    expect(aiOutcome).toEqual({
      error: "You have 20/20 habits. Remove one before adding another.",
    });
    expect(httpResponse.status).toBe(400);
    expect(await httpResponse.json()).toEqual({
      error: "You have 20/20 habits. Remove one before adding another.",
    });
  });

  it("preserves the AI input contract while domain behavior validates values", async () => {
    expect(
      createHabitTool().parameters.safeParse({
        name: "",
        frequency: { type: "daily" },
      }).success,
    ).toBe(true);
    expect(
      createHabitTool().parameters.safeParse({
        name: "Read",
        frequency: { type: "times_per_week", count: 5 },
      }).success,
    ).toBe(true);
    expect(
      createHabitTool().parameters.safeParse({
        name: "Read",
        frequency: { type: "custom" },
      }).success,
    ).toBe(true);

    mockCreate.mockResolvedValue({
      type: "invalid",
      field: "frequency",
      message: "Frequency is invalid",
    });
    await expect(
      createHabitTool().execute(
        { name: "Read", frequency: { type: "times_per_week", count: 5 } },
        aiContext,
      ),
    ).resolves.toEqual({ error: "Frequency is invalid", field: "frequency" });
  });

  it("leaves unexpected shared failures exceptional for AI and HTTP", async () => {
    const persistenceError = new Error("habit storage unavailable");
    mockCreate.mockRejectedValue(persistenceError);

    await expect(
      createHabitTool().execute(
        { name: "Read", frequency: { type: "daily" } },
        aiContext,
      ),
    ).rejects.toBe(persistenceError);

    const httpResponse = await POST(
      new NextRequest("http://localhost:3000/api/habits", {
        method: "POST",
        body: JSON.stringify({ name: "Read", frequency: { type: "daily" } }),
      }),
    );
    expect(httpResponse.status).toBe(500);
    expect(await httpResponse.json()).toEqual({
      error: "Failed to create habit",
    });
  });
});
