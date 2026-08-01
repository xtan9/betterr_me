import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { ToolContext } from "@/lib/ai/tools/types";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  start: vi.fn(),
}));

const supabase = {} as ToolContext["supabase"];

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mocks.authenticateRequest,
  cookieRouteErrorMessage: vi.fn(() => "Unauthorized"),
}));

vi.mock("@/lib/db/workouts", () => ({
  WorkoutsDB: class {},
}));

vi.mock("@/lib/db", () => ({
  WorkoutsDB: class {},
  ExercisesDB: class {},
  RoutinesDB: class {},
}));

vi.mock("@/lib/fitness/writes", () => ({
  createWorkoutWrites: vi.fn(() => ({ start: mocks.start })),
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { POST as postWorkouts } from "@/app/api/workouts/route";
import { POST as postRoutineStart } from "@/app/api/routines/[id]/start/route";
import { workoutTools } from "@/lib/ai/tools/workouts";

const startedWorkout = {
  id: "workout-1",
  user_id: "user-1",
  title: "Push day",
  routine_id: "64500000-0000-4000-8000-000000000001",
  status: "in_progress",
  exercises: [],
};

const routineId = "64500000-0000-4000-8000-000000000001";

function makeAuth() {
  return {
    ok: true,
    outcome: "authenticated",
    principal: { type: "user", userId: "user-1", credential: "cookie" },
    permissions: ["read", "write"],
    requiredPermission: "write",
    client: supabase,
  };
}

function startTool() {
  return workoutTools().find((tool) => tool.name === "startWorkout")!;
}

describe("workout start adapter parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue(makeAuth());
    mocks.start.mockResolvedValue({ type: "started", workout: startedWorkout });
  });

  it("preserves blank-start source and presentation across HTTP and AI", async () => {
    const httpResponse = await postWorkouts(
      new NextRequest("http://localhost/api/workouts", {
        method: "POST",
        body: JSON.stringify({ title: "Push day" }),
      }),
    );
    const aiResult = await startTool().execute(
      { name: "Push day" },
      {
        userId: "user-1",
        supabase,
        date: "2026-08-01",
        timezone: "UTC",
      } satisfies ToolContext,
    );

    expect(mocks.start.mock.calls.map(([request]) => request)).toEqual([
      {
        userId: "user-1",
        source: { type: "blank", title: "Push day" },
      },
      {
        userId: "user-1",
        source: { type: "blank", title: "Push day" },
      },
    ]);
    await expect(httpResponse.json()).resolves.toEqual({
      workout: startedWorkout,
    });
    expect(aiResult).toEqual(startedWorkout);
  });

  it("preserves routine source across both HTTP routes and AI", async () => {
    const genericHttpResponse = await postWorkouts(
      new NextRequest("http://localhost/api/workouts", {
        method: "POST",
        body: JSON.stringify({ routine_id: routineId }),
      }),
    );
    const routineHttpResponse = await postRoutineStart(
      new NextRequest("http://localhost/api/routines/start", { method: "POST" }),
      { params: Promise.resolve({ id: routineId }) },
    );
    const aiResult = await startTool().execute(
      { routineId },
      {
        userId: "user-1",
        supabase,
        date: "2026-08-01",
        timezone: "UTC",
      } satisfies ToolContext,
    );

    expect(mocks.start.mock.calls.map(([request]) => request)).toEqual([
      {
        userId: "user-1",
        source: { type: "routine", routineId },
      },
      {
        userId: "user-1",
        source: { type: "routine", routineId },
      },
      {
        userId: "user-1",
        source: { type: "routine", routineId },
      },
    ]);
    expect(genericHttpResponse.status).toBe(201);
    expect(routineHttpResponse.status).toBe(201);
    expect(aiResult).toEqual(startedWorkout);
  });
});
