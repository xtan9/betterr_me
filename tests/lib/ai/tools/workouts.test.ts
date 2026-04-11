import { describe, it, expect, vi, beforeEach } from "vitest";
import { workoutTools } from "@/lib/ai/tools/workouts";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetWorkoutsWithSummary = vi.fn();
const mockGetActiveWorkout = vi.fn();
const mockStartWorkout = vi.fn();
const mockUpdateWorkout = vi.fn();
const mockGetWorkoutWithExercises = vi.fn();
const mockGetAllExercises = vi.fn();
const mockGetUserRoutines = vi.fn();
const mockGetExerciseHistory = vi.fn();

vi.mock("@/lib/db", () => ({
  WorkoutsDB: class {
    getWorkoutsWithSummary = mockGetWorkoutsWithSummary;
    getActiveWorkout = mockGetActiveWorkout;
    startWorkout = mockStartWorkout;
    updateWorkout = mockUpdateWorkout;
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

  it("startWorkout calls WorkoutsDB.startWorkout", async () => {
    const ctx = makeCtx();
    mockStartWorkout.mockResolvedValue({ id: "w1", status: "in_progress" });
    const result = await findTool("startWorkout").execute(
      { name: "Push day" },
      ctx,
    );
    expect(mockStartWorkout).toHaveBeenCalledWith("user-123", {
      title: "Push day",
      routine_id: undefined,
    });
    expect(result).toEqual({ id: "w1", status: "in_progress" });
  });

  it("completeWorkout sets status to completed", async () => {
    const ctx = makeCtx();
    mockUpdateWorkout.mockResolvedValue({ id: "w1", status: "completed" });
    await findTool("completeWorkout").execute(
      { workoutId: "w1", notes: "Great session" },
      ctx,
    );
    expect(mockUpdateWorkout).toHaveBeenCalledWith("w1", {
      status: "completed",
      notes: "Great session",
    });
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
