import { describe, it, expect, vi, beforeEach } from "vitest";
import { workoutTools } from "@/lib/ai/tools/workouts";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetWorkoutsWithSummary = vi.fn();
const mockGetActiveWorkout = vi.fn();
const mockStartWorkout = vi.fn();
const mockUpdateWorkout = vi.fn();
const mockCompleteWorkout = vi.fn();
const { mockToWorkoutResponse } = vi.hoisted(() => ({
  mockToWorkoutResponse: vi.fn((workout: unknown) => workout),
}));
const mockGetWorkoutWithExercises = vi.fn();
const mockGetAllExercises = vi.fn();
const mockGetUserRoutines = vi.fn();
const mockGetExerciseHistory = vi.fn();

vi.mock("@/lib/db", () => ({
  WorkoutsDB: class {
    getWorkoutsWithSummary = mockGetWorkoutsWithSummary;
    getActiveWorkout = mockGetActiveWorkout;
    getWorkoutWithExercises = mockGetWorkoutWithExercises;
    getExerciseHistory = mockGetExerciseHistory;
  },
  ExercisesDB: class {
    getAllExercises = mockGetAllExercises;
  },
  RoutinesDB: class {
    getUserRoutines = mockGetUserRoutines;
  },
}));

vi.mock("@/lib/fitness/writes", () => ({
  createWorkoutWrites: vi.fn(() => ({
    start: mockStartWorkout,
    update: mockUpdateWorkout,
    complete: mockCompleteWorkout,
  })),
  toWorkoutResponse: mockToWorkoutResponse,
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
  return workoutTools().find((t) => t.name === name)!;
}

describe("workoutTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 8 tool definitions", () => {
    const tools = workoutTools();
    expect(tools).toHaveLength(8);
    expect(tools.map((t) => t.name)).toEqual([
      "getRecentWorkouts",
      "getActiveWorkout",
      "startWorkout",
      "completeWorkout",
      "getWorkoutDetails",
      "getExercises",
      "getRoutines",
      "getExerciseHistory",
    ]);
  });

  it("startWorkout maps a blank AI input through WorkoutWrites", async () => {
    const ctx = makeCtx();
    mockStartWorkout.mockResolvedValue({
      type: "started",
      workout: { id: "w1", status: "in_progress" },
    });
    const result = await findTool("startWorkout").execute(
      { name: "Push day" },
      ctx,
    );
    expect(mockStartWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      source: { type: "blank", title: "Push day" },
    });
    expect(result).toEqual({ id: "w1", status: "in_progress" });
  });

  it("startWorkout maps a routine AI input through the same source contract", async () => {
    const ctx = makeCtx();
    const workout = { id: "w1", title: "Push day", exercises: [] };
    mockStartWorkout.mockResolvedValue({ type: "started", workout });

    await expect(
      findTool("startWorkout").execute(
        { name: "Ignored for routine", routineId: "routine-1" },
        ctx,
      ),
    ).resolves.toBe(workout);

    expect(mockStartWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      source: { type: "routine", routineId: "routine-1" },
    });
  });

  it.each([
    [{ type: "conflict" }, { error: "You already have an active workout" }],
    [{ type: "not-found" }, { error: "Routine not found" }],
    [
      { type: "invalid-source", message: "Unsupported exercise type" },
      { error: "Unsupported exercise type" },
    ],
  ] as const)("maps the expected start outcome %j for the AI caller", async (outcome, expected) => {
    mockStartWorkout.mockResolvedValue(outcome);

    await expect(
      findTool("startWorkout").execute({ name: "Push day" }, makeCtx()),
    ).resolves.toEqual(expected);
  });

  it("preserves the start confirmation contract", () => {
    expect(findTool("startWorkout").description).toContain(
      "Always confirm with the user first",
    );
  });

  it("completeWorkout verifies ownership then completes", async () => {
    const ctx = makeCtx();
    const completed = { id: "w1", status: "completed" };
    mockCompleteWorkout.mockResolvedValue({ type: "transitioned", workout: completed });
    const result = await findTool("completeWorkout").execute(
      { workoutId: "w1", notes: "Great session" },
      ctx,
    );
    expect(mockGetWorkoutWithExercises).not.toHaveBeenCalled();
    expect(mockCompleteWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w1",
      notes: "Great session",
    });
    expect(mockToWorkoutResponse).toHaveBeenCalledWith(completed);
    expect(result).toEqual(completed);
  });

  it("completeWorkout returns error when not found", async () => {
    const ctx = makeCtx();
    mockCompleteWorkout.mockResolvedValue({ type: "not-found" });
    const result = await findTool("completeWorkout").execute(
      { workoutId: "w999" },
      ctx,
    );
    expect(result).toEqual({ error: "Workout not found" });
    expect(mockCompleteWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w999",
      notes: null,
    });
  });

  it("completeWorkout presents an already-applied transition as success", async () => {
    const completed = { id: "w1", status: "completed" };
    mockCompleteWorkout.mockResolvedValue({
      type: "already-applied",
      workout: completed,
    });

    await expect(
      findTool("completeWorkout").execute({ workoutId: "w1" }, makeCtx()),
    ).resolves.toEqual(completed);
    expect(mockCompleteWorkout).toHaveBeenCalledWith({
      userId: "user-123",
      workoutId: "w1",
      notes: null,
    });
  });

  it("completeWorkout presents an invalid transition as a conversational error", async () => {
    mockCompleteWorkout.mockResolvedValue({
      type: "invalid-transition",
      currentStatus: "discarded",
    });

    await expect(
      findTool("completeWorkout").execute({ workoutId: "w1" }, makeCtx()),
    ).resolves.toEqual({ error: "Workout is no longer editable" });
  });

  it("getWorkoutDetails calls getWorkoutWithExercises", async () => {
    const ctx = makeCtx();
    mockGetWorkoutWithExercises.mockResolvedValue({
      id: "w1",
      exercises: [],
    });
    const result = await findTool("getWorkoutDetails").execute(
      { workoutId: "w1" },
      ctx,
    );
    expect(mockGetWorkoutWithExercises).toHaveBeenCalledWith("w1");
    expect(result).toEqual({ id: "w1", exercises: [] });
  });

  it("getWorkoutDetails returns error when not found", async () => {
    const ctx = makeCtx();
    mockGetWorkoutWithExercises.mockResolvedValue(null);
    const result = await findTool("getWorkoutDetails").execute(
      { workoutId: "w999" },
      ctx,
    );
    expect(result).toEqual({ error: "Workout not found" });
  });

  it("getExercises calls ExercisesDB.getAllExercises", async () => {
    const ctx = makeCtx();
    mockGetAllExercises.mockResolvedValue([
      { id: "ex1", name: "Bench Press" },
    ]);
    const result = await findTool("getExercises").execute({}, ctx);
    expect(mockGetAllExercises).toHaveBeenCalled();
    expect(result).toEqual([{ id: "ex1", name: "Bench Press" }]);
  });

  it("getRoutines calls RoutinesDB.getUserRoutines", async () => {
    const ctx = makeCtx();
    mockGetUserRoutines.mockResolvedValue([
      { id: "r1", name: "PPL - Push" },
    ]);
    const result = await findTool("getRoutines").execute({}, ctx);
    expect(mockGetUserRoutines).toHaveBeenCalledWith("user-123");
    expect(result).toEqual([{ id: "r1", name: "PPL - Push" }]);
  });

  it("getExerciseHistory calls WorkoutsDB.getExerciseHistory", async () => {
    const ctx = makeCtx();
    mockGetExerciseHistory.mockResolvedValue([
      { workout_id: "w1", sets: [] },
    ]);
    const result = await findTool("getExerciseHistory").execute(
      { exerciseId: "ex1" },
      ctx,
    );
    expect(mockGetExerciseHistory).toHaveBeenCalledWith("ex1", "user-123");
    expect(result).toEqual([{ workout_id: "w1", sets: [] }]);
  });
});
