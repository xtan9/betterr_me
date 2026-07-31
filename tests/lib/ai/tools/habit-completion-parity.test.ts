import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/habits/[id]/toggle/route";
import { habitTools } from "@/lib/ai/tools/habits";
import type { ToolContext } from "@/lib/ai/tools/types";

const { mockComplete, mockUncomplete, httpSupabase, aiSupabase } = vi.hoisted(
  () => ({
    mockComplete: vi.fn(),
    mockUncomplete: vi.fn(),
    httpSupabase: {
      auth: {
        getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })),
      },
    },
    aiSupabase: {},
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => httpSupabase),
}));

vi.mock("@/lib/habits/completion", () => ({
  createHabitCompletion: vi.fn(() => ({
    complete: mockComplete,
    uncomplete: mockUncomplete,
  })),
}));

const intent = {
  habitId: "habit-1",
  userId: "user-123",
  date: "2026-04-10",
};

const completedOutcome = {
  log: {
    id: "log-1",
    habit_id: "habit-1",
    user_id: "user-123",
    logged_date: "2026-04-10",
    completed: true,
  },
  completed: true,
  currentStreak: 7,
  bestStreak: 12,
  milestones: [{ status: "recorded", threshold: 7 }],
};

const aiContext: ToolContext = {
  userId: intent.userId,
  supabase: aiSupabase as ToolContext["supabase"],
  date: intent.date,
  timezone: "America/Toronto",
};

function logHabitTool() {
  return habitTools().find((tool) => tool.name === "logHabit")!;
}

async function completeWithAi(completed: boolean) {
  return logHabitTool().execute(
    { habitId: intent.habitId, date: intent.date, completed },
    aiContext,
  );
}

async function completeWithHttp(completed: boolean) {
  const response = await POST(
    new NextRequest(
      `http://localhost:3000/api/habits/${intent.habitId}/toggle`,
      {
        method: "POST",
        body: JSON.stringify({ date: intent.date, completed }),
      },
    ),
    { params: Promise.resolve({ id: intent.habitId }) },
  );

  return { response, body: await response.json() };
}

describe("AI and HTTP habit completion parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns identical log, streak, and milestone outcomes for completion", async () => {
    mockComplete.mockResolvedValue(completedOutcome);

    const aiOutcome = await completeWithAi(true);
    const httpOutcome = await completeWithHttp(true);

    expect(httpOutcome.response.status).toBe(200);
    expect(aiOutcome).toEqual(completedOutcome);
    expect(httpOutcome.body).toEqual(aiOutcome);
    expect(mockComplete.mock.calls).toEqual([[intent], [intent]]);
    expect(mockUncomplete).not.toHaveBeenCalled();
  });

  it("returns identical log and streak outcomes for reversal", async () => {
    const reversedOutcome = {
      ...completedOutcome,
      log: { ...completedOutcome.log, completed: false },
      completed: false,
      currentStreak: 6,
      milestones: [],
    };
    mockUncomplete.mockResolvedValue(reversedOutcome);

    const aiOutcome = await completeWithAi(false);
    const httpOutcome = await completeWithHttp(false);

    expect(httpOutcome.response.status).toBe(200);
    expect(httpOutcome.body).toEqual(aiOutcome);
    expect(mockUncomplete.mock.calls).toEqual([[intent], [intent]]);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("preserves identical milestone deduplication outcomes across retries", async () => {
    const alreadyRecordedOutcome = {
      ...completedOutcome,
      milestones: [{ status: "already_recorded", threshold: 7 }],
    };
    mockComplete
      .mockResolvedValueOnce(completedOutcome)
      .mockResolvedValueOnce(alreadyRecordedOutcome)
      .mockResolvedValueOnce(completedOutcome)
      .mockResolvedValueOnce(alreadyRecordedOutcome);

    const aiOutcomes = [await completeWithAi(true), await completeWithAi(true)];
    const firstHttpOutcome = await completeWithHttp(true);
    const retriedHttpOutcome = await completeWithHttp(true);

    expect([firstHttpOutcome.body, retriedHttpOutcome.body]).toEqual(aiOutcomes);
    expect(aiOutcomes[1]).toEqual(alreadyRecordedOutcome);
    expect(mockComplete.mock.calls).toEqual([
      [intent],
      [intent],
      [intent],
      [intent],
    ]);
  });

  it("preserves the shared non-critical milestone failure outcome", async () => {
    const milestoneFailureOutcome = {
      ...completedOutcome,
      milestones: [{ status: "failed", threshold: 7 }],
    };
    mockComplete.mockResolvedValue(milestoneFailureOutcome);

    const aiOutcome = await completeWithAi(true);
    const httpOutcome = await completeWithHttp(true);

    expect(httpOutcome.response.status).toBe(200);
    expect(httpOutcome.body).toEqual(aiOutcome);
  });

  it("does not hide a critical shared completion failure from AI callers", async () => {
    const completionFailure = new Error("atomic completion unavailable");
    mockComplete.mockRejectedValue(completionFailure);

    await expect(completeWithAi(true)).rejects.toBe(completionFailure);

    const httpOutcome = await completeWithHttp(true);
    expect(httpOutcome.response.status).toBe(500);
    expect(httpOutcome.body).toEqual({ error: "Failed to toggle habit" });
  });
});
