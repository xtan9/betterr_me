import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/habits/[id]/route";
import { habitTools } from "@/lib/ai/tools/habits";
import type { ToolContext } from "@/lib/ai/tools/types";

const {
  mockUpdate,
  mockLegacyUpdateHabit,
  httpSupabase,
  aiSupabase,
} = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockLegacyUpdateHabit: vi.fn(),
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

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    updateHabit = mockLegacyUpdateHabit;
  },
  HabitLogsDB: class {},
}));

vi.mock("@/lib/habits/writes", () => ({
  createHabitWrites: vi.fn(() => ({ update: mockUpdate })),
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

const updatedHabit = {
  id: "habit-1",
  userId: "user-123",
  name: "Evening Run",
  description: "After work",
  categoryId: "550e8400-e29b-41d4-a716-446655440000",
  frequency: { type: "weekdays" },
  status: "active",
  currentStreak: 3,
  bestStreak: 12,
  pausedAt: null,
  graduatedAt: null,
  graduatedStreak: null,
  nudgeDismissedAt: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:05:00.000Z",
};

const presentedHabit = {
  id: "habit-1",
  user_id: "user-123",
  name: "Evening Run",
  description: "After work",
  category_id: "550e8400-e29b-41d4-a716-446655440000",
  frequency: { type: "weekdays" },
  status: "active",
  current_streak: 3,
  best_streak: 12,
  paused_at: null,
  graduated_at: null,
  graduated_streak: null,
  nudge_dismissed_at: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-01T12:05:00.000Z",
};

const aiContext: ToolContext = {
  userId: "user-123",
  supabase: aiSupabase as ToolContext["supabase"],
  date: "2026-08-01",
  timezone: "America/Toronto",
};

const params = Promise.resolve({ id: "habit-1" });

function updateHabitTool() {
  return habitTools().find((tool) => tool.name === "updateHabit")!;
}

describe("AI and HTTP habit update parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ type: "updated", habit: updatedHabit });
  });

  it("maps equivalent detail intents through the shared behavior", async () => {
    const intent = {
      habitId: "habit-1",
      name: "Evening Run",
      description: "After work",
      frequency: { type: "weekdays" },
      categoryId: "550e8400-e29b-41d4-a716-446655440000",
    } as const;

    const aiOutcome = await updateHabitTool().execute(intent, aiContext);
    const httpResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/habits/habit-1", {
        method: "PATCH",
        body: JSON.stringify({
          name: intent.name,
          description: intent.description,
          frequency: intent.frequency,
          category_id: intent.categoryId,
        }),
      }),
      { params },
    );

    expect(aiOutcome).toEqual(presentedHabit);
    expect(httpResponse.status).toBe(200);
    expect(await httpResponse.json()).toEqual({ habit: presentedHabit });
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenNthCalledWith(1, {
      userId: "user-123",
      habitId: "habit-1",
      name: intent.name,
      description: intent.description,
      frequency: intent.frequency,
      categoryId: intent.categoryId,
    });
    expect(mockUpdate).toHaveBeenNthCalledWith(2, {
      userId: "user-123",
      habitId: "habit-1",
      name: intent.name,
      description: intent.description,
      categoryId: intent.categoryId,
      frequency: intent.frequency,
    });
    expect(mockLegacyUpdateHabit).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", { type: "not-found" }, { ai: { error: "Habit not found" }, status: 404, http: { error: "Habit not found" } }],
    ["conflict", { type: "conflict" }, { ai: { error: "Habit update conflict" }, status: 409, http: { error: "Habit update conflict" } }],
    [
      "invalid",
      { type: "invalid", field: "frequency", message: "Frequency is invalid" },
      {
        ai: { error: "Frequency is invalid", field: "frequency" },
        status: 400,
        http: { error: "Frequency is invalid", field: "frequency" },
      },
    ],
  ])("maps the shared %s outcome to each channel's contract", async (_name, outcome, expected) => {
    mockUpdate.mockResolvedValue(outcome);
    const input = { name: "Evening Run" };

    await expect(updateHabitTool().execute({ habitId: "habit-1", ...input }, aiContext)).resolves.toEqual(expected.ai);
    const httpResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/habits/habit-1", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
      { params },
    );

    expect(httpResponse.status).toBe(expected.status);
    expect(await httpResponse.json()).toEqual(expected.http);
  });

  it("leaves unexpected shared failures exceptional for AI and HTTP", async () => {
    const persistenceError = new Error("habit storage unavailable");
    mockUpdate.mockRejectedValue(persistenceError);

    await expect(
      updateHabitTool().execute(
        { habitId: "habit-1", name: "Evening Run" },
        aiContext,
      ),
    ).rejects.toBe(persistenceError);

    const httpResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/habits/habit-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Evening Run" }),
      }),
      { params },
    );
    expect(httpResponse.status).toBe(500);
    expect(await httpResponse.json()).toEqual({
      error: "Failed to update habit",
    });
  });
});
