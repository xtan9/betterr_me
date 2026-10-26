import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import contract from "@/tests/fixtures/train-measurement-contract.json";
import historyContract from "@/tests/fixtures/train-history-contract.json";
import { WorkoutsDB } from "@/lib/db/workouts";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock the logger so we can assert on log.error / log.warn exact calls — this
// kills the StringLiteral mutants on log messages and the ObjectLiteral mutants
// on the warn context object.
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
import { log } from "@/lib/logger";

const USER_ID = "user-123";
const WORKOUT_ID = "w-1";
const EXERCISE_ID = "ex-1";


describe("WorkoutsDB", () => {
  let workoutsDB: WorkoutsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    workoutsDB = new WorkoutsDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  it("reads the captured native definition after the live catalog is renamed", async () => {
    const definition = { catalogKey: 'strength.barbell-bench-press.v1', name: { en: 'Recorded bench', zh: '已记录卧推' }, equipment: 'barbell', mode: 'weight_reps', convention: 'barbell-total' };
    const live = { id: EXERCISE_ID, name: 'Renamed live definition', equipment: 'barbell', exercise_type: 'weight_reps' };
    const original = contract.completion;
    const completed = { ...original, version: 1, exercises: [{ ...original.exercises[0], definition,
      sets: [{ id: original.exercises[0].sets[0].id, performed: { weightKg: 0.123, reps: 5, kind: 'working' } }] }] };
    mockSupabaseClient.setMockResponse({ id: original.id, user_id: original.ownerId, status: 'completed', started_at: original.startedAt,
      completed_at: original.completedAt, duration_seconds: 600, native_completion: completed,
      workout_exercises: [{ id: completed.exercises[0].id, exercise_id: EXERCISE_ID, exercise: live, sets: [{ id: completed.exercises[0].sets[0].id }] }] });
    const result = await workoutsDB.getWorkoutWithExercises(original.id, original.ownerId);
    expect(result?.exercises[0].exercise).toMatchObject({ id: EXERCISE_ID, name: 'Recorded bench', equipment: 'barbell', exercise_type: 'weight_reps' });
    expect(result?.exercises[0]).toMatchObject({ recorded_definition: definition, live_exercise: live });
    mockSupabaseClient.expectQuery({ method: 'eq', args: ['user_id', original.ownerId] });
  });
  it("does not expose a foreign custom reference through a service-backed owned workout read", async () => {
    mockSupabaseClient.setMockResponse({ id: WORKOUT_ID, user_id: USER_ID, workout_exercises: [{ id: 'legacy-cross-owner-entry', exercise: { id: 'private-id', user_id: 'another-owner', name: 'Private definition' }, sets: [] }] });
    const result = await workoutsDB.getWorkoutWithExercises(WORKOUT_ID, USER_ID);
    expect(result?.exercises).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('Private definition');
  });

  it("exposes only an owned explicit plan association to cookie and trusted Assistant detail reads", async () => {
    const link = { owner_id: USER_ID, workout_id: WORKOUT_ID, captured_occurrence_id: '64220000-0000-4000-8000-000000000002', linked_at: '2026-10-26T10:00:00Z' };
    mockSupabaseClient.setMockResponse({ id: WORKOUT_ID, user_id: USER_ID, status: 'completed', train_workout_plan_links: link, workout_exercises: [] });
    const result = await workoutsDB.getWorkoutWithExercises(WORKOUT_ID, USER_ID);
    expect(result?.trainingPlanLink).toEqual({ ownerId: USER_ID, workoutId: WORKOUT_ID, occurrenceId: link.captured_occurrence_id, linkedAt: link.linked_at });
    mockSupabaseClient.expectQuery({ method: 'eq', args: ['user_id', USER_ID] });
    expect(result).not.toHaveProperty('train_workout_plan_links');
    mockSupabaseClient.setMockResponse({ id: WORKOUT_ID, user_id: USER_ID, status: 'completed', train_workout_plan_links: { ...link, owner_id: 'another-owner' }, workout_exercises: [] });
    expect((await workoutsDB.getWorkoutWithExercises(WORKOUT_ID, USER_ID))?.trainingPlanLink).toBeNull();
  });

  it("does not silently replace an unsupported recorded document with live catalog facts", async () => {
    mockSupabaseClient.setMockResponse({ id: WORKOUT_ID, native_completion: { version: 2 }, workout_exercises: [{ id: "entry", exercise: { name: "Current catalog" }, sets: [] }] });
    await expect(workoutsDB.getWorkoutWithExercises(WORKOUT_ID, USER_ID)).resolves.toMatchObject({ recordedStatus: 'unsupported', exercises: [] });
  });

  it("keeps raw large values while making overflowing history aggregates unavailable", async () => {
    const sets = [{ weight_kg: Number.MAX_VALUE, reps: 2, is_completed: true, set_type: "normal" }];
    mockSupabaseClient.setMockResponse([{ id: WORKOUT_ID, workout_exercises: [{ exercise: { name: "Bench" }, sets }] }]);
    expect((await workoutsDB.getWorkoutsWithSummary(USER_ID))[0].totalVolume).toBeNull();
    mockSupabaseClient.setMockResponse([{ workout: { id: WORKOUT_ID, started_at: "2026-10-25" }, sets }]);
    const history = await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID);
    expect(history[0]).toMatchObject({ best_set_weight_kg: Number.MAX_VALUE, best_set_reps: 2, total_volume: null });
  });

  it("propagates current authority errors without falling back to stale legacy rows", async () => {
    const error=new Error('Current read failed');
    const reader=vi.fn().mockResolvedValue({data:null,error});
    const db=new WorkoutsDB(mockSupabaseClient as unknown as SupabaseClient,reader);
    await expect(db.getExerciseHistory(EXERCISE_ID,historyContract.record.ownerId)).rejects.toBe(error);
    expect(reader).toHaveBeenCalledExactlyOnceWith(historyContract.record.ownerId,null,null,0);
    expect(mockSupabaseClient.queryLog).toEqual([]);
  });

  describe('current history readers', () => {
    const owner = historyContract.record.ownerId;
    const calls = [
      { name: 'getCurrentWorkouts', limit: null, run: (db: WorkoutsDB) => db.getCurrentWorkouts(owner) },
      { name: 'getComparableProgress', limit: null, run: (db: WorkoutsDB) => db.getComparableProgress(EXERCISE_ID, owner) },
      { name: 'getLastWorkout', limit: 1, run: (db: WorkoutsDB) => db.getLastWorkout(owner) },
    ];
    it.each(calls)('$name propagates an authority error without raw-table fallback', async ({ run, limit }) => {
      const error = new Error('Current authority failed');
      const reader = vi.fn().mockResolvedValue({ data: null, error });
      const db = new WorkoutsDB(mockSupabaseClient as unknown as SupabaseClient, reader);
      await expect(run(db)).rejects.toBe(error);
      expect(reader).toHaveBeenCalledExactlyOnceWith(owner, null, limit, 0);
      expect(mockSupabaseClient.queryLog).toEqual([]);
    });
    it.each(calls)('$name distinguishes disabled authority from an empty current result', async ({ name, run, limit }) => {
      const reader = vi.fn().mockResolvedValueOnce({ data: { status: 'not_ready' }, error: null })
        .mockResolvedValueOnce({ data: { status: 'available', workouts: [] }, error: null });
      const db = new WorkoutsDB(mockSupabaseClient as unknown as SupabaseClient, reader);
      expect(await run(db)).toEqual(name === 'getLastWorkout' ? undefined : null);
      expect(await run(db)).toEqual(name === 'getLastWorkout' ? null : []);
      expect(reader.mock.calls).toEqual([[owner, null, limit, 0], [owner, null, limit, 0]]);
      expect(mockSupabaseClient.queryLog).toEqual([]);
    });
    it('returns the current date-only row and only the requested exercise comparison', async () => {
      const current = historyContract.record;
      const row = { id: current.id, user_id: owner, started_at: null, duration_seconds: null,
        workoutDay: current.workoutDay, currentHistory: current,
        workout_exercises: current.current.document.exercises.map((entry, index) => ({
          id: entry.id, workout_id: current.id, exercise_id: index === 0 ? EXERCISE_ID : `other-${index}`, sets: [],
        })) };
      const reader = vi.fn().mockResolvedValue({ data: { status: 'available', workouts: [row] }, error: null });
      const db = new WorkoutsDB(mockSupabaseClient as unknown as SupabaseClient, reader);
      expect(await db.getCurrentWorkouts(owner)).toMatchObject([{ id: current.id, started_at: null, duration_seconds: null, workoutDay: '2026-10-24', currentHistory: current }]);
      expect(await db.getLastWorkout(owner)).toEqual({ workoutDay: '2026-10-24', startedAt: null });
      const groups = await db.getComparableProgress(EXERCISE_ID, owner);
      expect(groups).toHaveLength(1);
      expect(groups![0].records).toMatchObject([
        { metric: 'reps', at: { kind: 'loadKg', value: 0.123 }, value: 5,
          sources: [{ workoutId: current.id, revision: '1', entryId: current.current.document.exercises[0].id }] },
        { metric: 'loadKg', at: { kind: 'reps', value: 5 }, value: 0.123 },
      ]);
      expect(reader.mock.calls).toEqual([[owner, null, null, 0], [owner, null, 1, 0], [owner, null, null, 0]]);
      expect(mockSupabaseClient.queryLog).toEqual([]);
    });
  });

  it("groups repeated current entries into one workout in canonical newest-first order", async () => {
    const current = historyContract.record;
    const row = {id:current.id,user_id:current.ownerId,started_at:null,workoutDay:current.workoutDay,currentHistory:current,
      workout_exercises:[1,2].map(index=>({id:`entry-${index}`,workout_id:current.id,exercise_id:EXERCISE_ID,
        exercise:{id:EXERCISE_ID,user_id:null,exercise_type:'weight_reps'},
        sets:[{id:`working-${index}`,workout_exercise_id:`entry-${index}`,is_completed:true,set_type:'normal'},
          {id:`warmup-${index}`,workout_exercise_id:`entry-${index}`,is_completed:true,set_type:'warmup'},
          {id:`unfinished-${index}`,workout_exercise_id:`entry-${index}`,is_completed:false,set_type:'normal'}]}))};
    const reader=vi.fn().mockResolvedValue({data:{status:'available',workouts:[row]},error:null});
    const result=await new WorkoutsDB(mockSupabaseClient as unknown as SupabaseClient,reader).getExerciseHistory(EXERCISE_ID,current.ownerId);
    expect(result).toEqual([{started_at:null,workoutDay:'2026-10-24',workout_id:current.id,best_set_weight_kg:null,best_set_reps:null,total_volume:null,total_sets:2}]);
    expect(reader).toHaveBeenCalledWith(current.ownerId,null,null,0);
  });

  // ===========================================================================
  // getActiveWorkout
  // ===========================================================================
  describe("getActiveWorkout", () => {
    it("returns reshaped workout with sets sorted by set_number ascending", async () => {
      const mockData = {
        id: WORKOUT_ID,
        user_id: USER_ID,
        status: "in_progress",
        workout_exercises: [
          {
            id: "we-1",
            sort_order: 0,
            exercise: { id: "ex-1", name: "Bench Press" },
            sets: [
              { id: "s-3", set_number: 3, weight_kg: 100 },
              { id: "s-1", set_number: 1, weight_kg: 60 },
              { id: "s-2", set_number: 2, weight_kg: 80 },
            ],
          },
        ],
      };
      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getActiveWorkout(USER_ID);

      expect(result).not.toBeNull();
      expect(result!.exercises).toHaveLength(1);
      expect(result!.exercises[0].sets.map((s) => s.set_number)).toEqual([
        1, 2, 3,
      ]);

      // Assert the full query chain — kills table/eq/order/ascending mutants.
      mockSupabaseClient.expectQuery({
        table: "workouts",
        method: "from",
        args: ["workouts"],
      });
      // Exact select join-template string — kills StringLiteral mutant that
      // would collapse the template to ``.
      mockSupabaseClient.expectQuery({
        method: "select",
        args: [
          `
        *,
        workout_exercises (
          *,
          exercise:exercises (*),
          sets:workout_sets (*)
        )
      `,
        ],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["status", "in_progress"],
      });
      mockSupabaseClient.expectQuery({
        method: "order",
        args: [
          "sort_order",
          { referencedTable: "workout_exercises", ascending: true },
        ],
      });
      mockSupabaseClient.expectQuery({ method: "single", args: [] });
    });

    it("returns an empty exercises array when workout_exercises is missing/null", async () => {
      // Covers the `?? []` default — if we mutate that to `&& []` the result
      // becomes undefined and .map throws, which the test catches.
      mockSupabaseClient.setMockResponse({
        id: WORKOUT_ID,
        user_id: USER_ID,
        status: "in_progress",
        workout_exercises: null,
      });

      const result = await workoutsDB.getActiveWorkout(USER_ID);
      expect(result!.exercises).toEqual([]);
    });

    it("defaults sets to [] when we.sets is null (exercise has no sets yet)", async () => {
      mockSupabaseClient.setMockResponse({
        id: WORKOUT_ID,
        user_id: USER_ID,
        status: "in_progress",
        workout_exercises: [
          {
            id: "we-1",
            sort_order: 0,
            exercise: { id: "ex-1", name: "Squat" },
            sets: null,
          },
        ],
      });

      const result = await workoutsDB.getActiveWorkout(USER_ID);
      expect(result!.exercises[0].sets).toEqual([]);
    });

    it("returns null when no active workout exists (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await workoutsDB.getActiveWorkout(USER_ID);
      expect(result).toBeNull();
      // PGRST116 path must NOT log error.
      expect(log.error).not.toHaveBeenCalled();
    });

    it("logs error and throws on non-PGRST116 errors", async () => {
      const dbError = { code: "PGRST301", message: "internal error" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(workoutsDB.getActiveWorkout(USER_ID)).rejects.toEqual(
        dbError,
      );
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get active workout",
        dbError,
      );
    });
  });

  // ===========================================================================
  // getWorkoutWithExercises
  // ===========================================================================
  describe("getWorkoutWithExercises", () => {
    it("reshapes workout and sorts sets by set_number ascending", async () => {
      const mockData = {
        id: WORKOUT_ID,
        title: "Pull Day",
        status: "completed",
        workout_exercises: [
          {
            id: "we-1",
            sort_order: 0,
            exercise: { id: "ex-1", name: "Deadlift" },
            sets: [
              { id: "s-2", set_number: 2, weight_kg: 100 },
              { id: "s-1", set_number: 1, weight_kg: 80 },
              { id: "s-3", set_number: 3, weight_kg: 120 },
            ],
          },
        ],
      };
      mockSupabaseClient.setMockResponse(mockData);

      const result = await workoutsDB.getWorkoutWithExercises(WORKOUT_ID);

      expect(result).not.toBeNull();
      expect(result!.exercises).toHaveLength(1);
      expect(result!.exercises[0].exercise.name).toBe("Deadlift");
      expect(result!.exercises[0].sets.map((s) => s.set_number)).toEqual([
        1, 2, 3,
      ]);
      expect(result!.exercises[0].sets.map((s) => s.weight_kg)).toEqual([
        80, 100, 120,
      ]);

      // Full-chain query assertion — kills table/eq/order mutants.
      mockSupabaseClient.expectQuery({
        table: "workouts",
        method: "from",
        args: ["workouts"],
      });
      mockSupabaseClient.expectQuery({
        method: "select",
        args: [
          `
        *,
        train_workout_plan_links (owner_id,workout_id,captured_occurrence_id,linked_at),
        workout_exercises (
          *,
          exercise:exercises (*),
          sets:workout_sets (*)
        )
      `,
        ],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["id", WORKOUT_ID],
      });
      mockSupabaseClient.expectQuery({
        method: "order",
        args: [
          "sort_order",
          { referencedTable: "workout_exercises", ascending: true },
        ],
      });
      mockSupabaseClient.expectQuery({ method: "single", args: [] });
    });

    it("defaults sets to [] when we.sets is null", async () => {
      mockSupabaseClient.setMockResponse({
        id: WORKOUT_ID,
        title: "Empty sets",
        workout_exercises: [
          {
            id: "we-1",
            sort_order: 0,
            exercise: { id: "ex-1", name: "Row" },
            sets: null,
          },
        ],
      });

      const result = await workoutsDB.getWorkoutWithExercises(WORKOUT_ID);
      expect(result!.exercises[0].sets).toEqual([]);
    });

    it("returns empty exercises when workout_exercises is null", async () => {
      mockSupabaseClient.setMockResponse({
        id: WORKOUT_ID,
        title: "Solo",
        workout_exercises: null,
      });

      const result = await workoutsDB.getWorkoutWithExercises(WORKOUT_ID);
      expect(result!.exercises).toEqual([]);
    });

    it("returns null when workout not found (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await workoutsDB.getWorkoutWithExercises("missing");
      expect(result).toBeNull();
      expect(log.error).not.toHaveBeenCalled();
    });

    it("logs error and throws on non-PGRST116 errors", async () => {
      const dbError = { code: "PGRST301", message: "internal error" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(
        workoutsDB.getWorkoutWithExercises(WORKOUT_ID),
      ).rejects.toEqual(dbError);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get workout with exercises",
        dbError,
      );
    });
  });


  // ===========================================================================
  // getWorkouts (list)
  // ===========================================================================
  describe("getWorkouts", () => {
    it("lists non-in_progress workouts ordered by started_at desc with default limit=20", async () => {
      const rows = [
        { id: "w-2", started_at: "2026-04-10T10:00:00Z", status: "completed" },
        { id: "w-1", started_at: "2026-04-01T10:00:00Z", status: "completed" },
      ];
      queueThenResponses([{ data: rows, error: null }]);

      const result = await workoutsDB.getWorkouts(USER_ID);

      expect(result).toEqual(rows);

      expect(mockSupabaseClient.queryLog).toEqual([
        {table:null,method:'rpc',args:['read_train_history_compat',{p_id:null,p_limit:20,p_offset:0}]},
        { table: "workouts", method: "from", args: ["workouts"] },
        { table: "workouts", method: "select", args: ["*"] },
        { table: "workouts", method: "eq", args: ["user_id", USER_ID] },
        { table: "workouts", method: "neq", args: ["status", "in_progress"] },
        {
          table: "workouts",
          method: "order",
          args: ["started_at", { ascending: false }],
        },
        { table: "workouts", method: "limit", args: [20] },
      ]);
    });

    it("honors custom limit option", async () => {
      queueThenResponses([{ data: [], error: null }]);

      await workoutsDB.getWorkouts(USER_ID, { limit: 5 });

      mockSupabaseClient.expectQuery({
        table: "workouts",
        method: "limit",
        args: [5],
      });
    });

    it("returns [] when data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await workoutsDB.getWorkouts(USER_ID);
      expect(result).toEqual([]);
    });

    it("logs error and throws on DB error", async () => {
      const dbError = { code: "PGRST500", message: "list failed" };
      queueThenResponses([{ data: null, error: dbError }]);

      await expect(workoutsDB.getWorkouts(USER_ID)).rejects.toEqual(dbError);
      expect(log.error).toHaveBeenCalledWith("Failed to get workouts", dbError);
    });
  });

  // ===========================================================================
  // getPreviousSets
  // ===========================================================================
  describe("getPreviousSets", () => {
    it("returns sets from the most recent completed workout, sorted by set_number", async () => {
      const rows = [
        {
          workout_id: "w-older",
          workout: { started_at: "2026-02-20T10:00:00Z", status: "completed" },
          sets: [{ id: "s-old-1", set_number: 1, weight_kg: 60 }],
        },
        {
          workout_id: "w-newest",
          workout: { started_at: "2026-02-28T10:00:00Z", status: "completed" },
          sets: [
            { id: "s-new-2", set_number: 2, weight_kg: 85 },
            { id: "s-new-1", set_number: 1, weight_kg: 80 },
          ],
        },
        {
          workout_id: "w-middle",
          workout: { started_at: "2026-02-24T10:00:00Z", status: "completed" },
          sets: [{ id: "s-mid-1", set_number: 1, weight_kg: 70 }],
        },
      ];
      queueThenResponses([{ data: rows, error: null }]);

      const result = await workoutsDB.getPreviousSets(EXERCISE_ID, USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("s-new-1");
      expect(result[1].id).toBe("s-new-2");
      expect(result.map((s) => s.set_number)).toEqual([1, 2]);

      // Query chain
      expect(mockSupabaseClient.queryLog).toEqual([
        {table:null,method:'rpc',args:['read_train_history_compat',{p_id:null,p_limit:null,p_offset:0}]},
        {
          table: "workout_exercises",
          method: "from",
          args: ["workout_exercises"],
        },
        {
          table: "workout_exercises",
          method: "select",
          args: [
            `
        id, workout_id,
        exercise:exercises (user_id, exercise_type),
        sets:workout_sets (*),
        workout:workouts!inner (id, user_id, started_at, completed_at, duration_seconds, status, native_completion, recorded_completion)
      `,
          ],
        },
        {
          table: "workout_exercises",
          method: "eq",
          args: ["exercise_id", EXERCISE_ID],
        },
        {
          table: "workout_exercises",
          method: "eq",
          args: ["workout.status", "completed"],
        },
        { table: "workout_exercises", method: "eq", args: ["workout.user_id", USER_ID] },
        {
          table: "workout_exercises",
          method: "order",
          args: [
            "started_at",
            { referencedTable: "workouts", ascending: false },
          ],
        },
        { table: "workout_exercises", method: "limit", args: [5] },
      ]);
    });

    it("returns [] when data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await workoutsDB.getPreviousSets(EXERCISE_ID, USER_ID);
      expect(result).toEqual([]);
    });

    it("returns [] when data array is empty", async () => {
      queueThenResponses([{ data: [], error: null }]);

      const result = await workoutsDB.getPreviousSets(EXERCISE_ID, USER_ID);
      expect(result).toEqual([]);
    });

    it("defaults sets to [] when the most recent workout's sets is null", async () => {
      // Covers the `?? []` default inside the sort-result path.
      queueThenResponses([
        {
          data: [
            {
              workout_id: "w-1",
              workout: {
                started_at: "2026-02-28T10:00:00Z",
                status: "completed",
              },
              sets: null,
            },
          ],
          error: null,
        },
      ]);

      const result = await workoutsDB.getPreviousSets(EXERCISE_ID, USER_ID);
      expect(result).toEqual([]);
    });

    it("logs error and throws on DB error", async () => {
      const dbError = { code: "PGRST500", message: "prev failed" };
      queueThenResponses([{ data: null, error: dbError }]);

      await expect(workoutsDB.getPreviousSets(EXERCISE_ID, USER_ID)).rejects.toEqual(
        dbError,
      );
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get previous sets",
        dbError,
      );
    });
  });

  // ===========================================================================
  // getWorkoutsWithSummary — aggregation math is critical
  // ===========================================================================
  describe("getWorkoutsWithSummary", () => {
    it("computes exact totalVolume from completed sets only and shapes full summary", async () => {
      const rows = [
        {
          id: "w-1",
          title: "Push Day",
          notes: "good session",
          started_at: "2026-02-28T10:00:00Z",
          completed_at: "2026-02-28T11:00:00Z",
          duration_seconds: 3600,
          workout_exercises: [
            {
              id: "we-1",
              exercise: { name: "Bench Press" },
              sets: [
                {
                  weight_kg: 80,
                  reps: 10,
                  is_completed: true,
                  set_type: "normal",
                },
                {
                  weight_kg: 60,
                  reps: 8,
                  is_completed: true,
                  set_type: "normal",
                },
                {
                  weight_kg: 100,
                  reps: 5,
                  is_completed: false,
                  set_type: "normal",
                },
              ],
            },
            {
              id: "we-2",
              exercise: { name: "Incline Press" },
              sets: [
                {
                  weight_kg: 50,
                  reps: 12,
                  is_completed: true,
                  set_type: "normal",
                },
              ],
            },
          ],
        },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await workoutsDB.getWorkoutsWithSummary(USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "w-1",
        title: "Push Day",
        notes: "good session",
        started_at: "2026-02-28T10:00:00Z",
        completed_at: "2026-02-28T11:00:00Z",
        duration_seconds: 3600,
        recordedStatus: "legacy",
        exerciseCount: 2,
        exerciseNames: ["Bench Press", "Incline Press"],
        // 80*10 + 60*8 + 50*12 = 800 + 480 + 600 = 1880
        totalVolume: 1880,
        totalSets: 3, // three completed sets across both exercises
      });
    });

    it("filters exercises with null name out of exerciseNames but keeps count", async () => {
      mockSupabaseClient.setMockResponse([
        {
          id: "w-1",
          title: "Mixed",
          notes: null,
          started_at: "2026-02-28T10:00:00Z",
          completed_at: "2026-02-28T11:00:00Z",
          duration_seconds: 3600,
          workout_exercises: [
            { id: "we-1", exercise: null, sets: [] },
            { id: "we-2", exercise: { name: "Squat" }, sets: [] },
          ],
        },
      ]);

      const result = await workoutsDB.getWorkoutsWithSummary(USER_ID);

      expect(result[0].exerciseCount).toBe(2);
      expect(result[0].exerciseNames).toEqual(["Squat"]);
    });

    it("treats null weight/reps as 0 in volume (but counts the completed set)", async () => {
      mockSupabaseClient.setMockResponse([
        {
          id: "w-1",
          title: "Cardio",
          notes: null,
          started_at: "2026-02-28T10:00:00Z",
          completed_at: "2026-02-28T11:00:00Z",
          duration_seconds: 3600,
          workout_exercises: [
            {
              id: "we-1",
              exercise: { name: "Running" },
              sets: [
                {
                  weight_kg: null,
                  reps: null,
                  is_completed: true,
                  set_type: "normal",
                },
              ],
            },
          ],
        },
      ]);

      const result = await workoutsDB.getWorkoutsWithSummary(USER_ID);
      expect(result[0].totalVolume).toBe(0);
      expect(result[0].totalSets).toBe(1);
    });

    it("defaults workout_exercises to [] when null", async () => {
      mockSupabaseClient.setMockResponse([
        {
          id: "w-1",
          title: "Empty",
          notes: null,
          started_at: "2026-02-28T10:00:00Z",
          completed_at: "2026-02-28T11:00:00Z",
          duration_seconds: 3600,
          workout_exercises: null,
        },
      ]);

      const result = await workoutsDB.getWorkoutsWithSummary(USER_ID);
      expect(result[0].exerciseCount).toBe(0);
      expect(result[0].exerciseNames).toEqual([]);
      expect(result[0].totalVolume).toBe(0);
      expect(result[0].totalSets).toBe(0);
    });

    it("returns [] when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await workoutsDB.getWorkoutsWithSummary(USER_ID);
      expect(result).toEqual([]);
    });

    it("defaults limit=20 and offset=0 and asserts the exact range/order query chain", async () => {
      mockSupabaseClient.setMockResponse([]);

      await workoutsDB.getWorkoutsWithSummary(USER_ID);

      // offset + limit - 1 = 0 + 20 - 1 = 19
      mockSupabaseClient.expectQuery({
        table: "workouts",
        method: "range",
        args: [0, 19],
      });
      mockSupabaseClient.expectQuery({
        method: "select",
        args: [
          `
        *,
        workout_exercises (
          id,
          exercise:exercises (name, user_id, exercise_type),
          sets:workout_sets (id, weight_kg, reps, is_completed, set_type)
        )
      `,
        ],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["status", "completed"],
      });
      mockSupabaseClient.expectQuery({
        method: "order",
        args: ["started_at", { ascending: false }],
      });
    });

    it("uses provided limit and offset in the range call (exact math)", async () => {
      mockSupabaseClient.setMockResponse([]);

      await workoutsDB.getWorkoutsWithSummary(USER_ID, {
        limit: 10,
        offset: 40,
      });

      // offset + limit - 1 = 40 + 10 - 1 = 49. Kills both the +1/-1 and the
      // - → * / → - mutants on the range expression.
      mockSupabaseClient.expectQuery({
        method: "range",
        args: [40, 49],
      });
    });

    it("logs error and throws on DB error", async () => {
      const dbError = { code: "PGRST500", message: "summary failed" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(workoutsDB.getWorkoutsWithSummary(USER_ID)).rejects.toEqual(
        dbError,
      );
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get workouts with summary",
        dbError,
      );
    });
  });

  // ===========================================================================
  // getExerciseHistory — Math.max, filter, reduce, since option
  // ===========================================================================
  describe("getExerciseHistory", () => {
    it("computes best/volume from completed normal sets only with distinct values (kills Math.max→min)", async () => {
      // Weights [70, 100, 85]: max=100, min=70. Reps [8, 5, 10]: max=10, min=5.
      // Volume = 70*8 + 100*5 + 85*10 = 560 + 500 + 850 = 1910.
      queueThenResponses([
        {
          data: [
            {
              workout_id: "w-1",
              workout: {
                id: "w-1",
                started_at: "2026-02-28T10:00:00Z",
                status: "completed",
                user_id: USER_ID,
              },
              sets: [
                {
                  weight_kg: 70,
                  reps: 8,
                  duration_seconds: null,
                  is_completed: true,
                  set_type: "normal",
                },
                {
                  weight_kg: 100,
                  reps: 5,
                  duration_seconds: null,
                  is_completed: true,
                  set_type: "normal",
                },
                {
                  weight_kg: 85,
                  reps: 10,
                  duration_seconds: null,
                  is_completed: true,
                  set_type: "normal",
                },
                // Warmup — excluded
                {
                  weight_kg: 200,
                  reps: 1,
                  duration_seconds: null,
                  is_completed: true,
                  set_type: "warmup",
                },
                // Incomplete normal — excluded
                {
                  weight_kg: 300,
                  reps: 1,
                  duration_seconds: null,
                  is_completed: false,
                  set_type: "normal",
                },
              ],
            },
          ],
          error: null,
        },
      ]);

      const result = await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        started_at: "2026-02-28T10:00:00Z",
        workout_id: "w-1",
        best_set_weight_kg: 100, // Math.max — min would give 70
        best_set_reps: 10, // Math.max — min would give 5
        total_volume: 1910,
        total_sets: 3,
      });
    });

    it("preserves zero weight (no falsy nullification)", async () => {
      queueThenResponses([
        {
          data: [
            {
              workout_id: "w-1",
              workout: {
                id: "w-1",
                started_at: "2026-02-28T10:00:00Z",
                status: "completed",
                user_id: USER_ID,
              },
              sets: [
                {
                  weight_kg: 0,
                  reps: 10,
                  duration_seconds: null,
                  is_completed: true,
                  set_type: "normal",
                },
                {
                  weight_kg: 0,
                  reps: 12,
                  duration_seconds: null,
                  is_completed: true,
                  set_type: "normal",
                },
              ],
            },
          ],
          error: null,
        },
      ]);

      const result = await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID);
      expect(result[0].best_set_weight_kg).toBe(0);
      expect(result[0].best_set_reps).toBe(12);
      expect(result[0].total_volume).toBe(0);
      expect(result[0].total_sets).toBe(2);
    });

    it("returns null for weight when all completed normal sets have null weight", async () => {
      queueThenResponses([
        {
          data: [
            {
              workout_id: "w-1",
              workout: {
                id: "w-1",
                started_at: "2026-02-28T10:00:00Z",
                status: "completed",
                user_id: USER_ID,
              },
              sets: [
                {
                  weight_kg: null,
                  reps: 10,
                  duration_seconds: 60,
                  is_completed: true,
                  set_type: "normal",
                },
              ],
            },
          ],
          error: null,
        },
      ]);

      const result = await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID);
      expect(result[0].best_set_weight_kg).toBeNull();
      // Reps are non-null → we assert the non-null branch too.
      expect(result[0].best_set_reps).toBe(10);
      expect(result[0].total_sets).toBe(1);
    });

    it("returns null for reps when all completed normal sets have null reps (distinguishes reps filter mutant)", async () => {
      // This test specifically targets the `reps` filter `v !== null → true`
      // mutant: without filtering nulls out, the array would be `[null]`,
      // `Math.max(null) = 0`, and best_set_reps would become 0 instead of null.
      queueThenResponses([
        {
          data: [
            {
              workout_id: "w-1",
              workout: {
                id: "w-1",
                started_at: "2026-02-28T10:00:00Z",
                status: "completed",
                user_id: USER_ID,
              },
              sets: [
                {
                  weight_kg: 50,
                  reps: null,
                  duration_seconds: 60,
                  is_completed: true,
                  set_type: "normal",
                },
              ],
            },
          ],
          error: null,
        },
      ]);

      const result = await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID);
      expect(result[0].best_set_reps).toBeNull();
      expect(result[0].best_set_weight_kg).toBe(50);
      expect(result[0].total_sets).toBe(1);
    });

    it("returns null best_reps and null total_volume when no completed normal sets exist", async () => {
      // Only non-normal / non-completed sets. This triggers the
      // `length > 0 ? ... : null` branches — kills the `true` / `>= 0` mutants.
      queueThenResponses([
        {
          data: [
            {
              workout_id: "w-1",
              workout: {
                id: "w-1",
                started_at: "2026-02-28T10:00:00Z",
                status: "completed",
                user_id: USER_ID,
              },
              sets: [
                {
                  weight_kg: 80,
                  reps: 5,
                  duration_seconds: null,
                  is_completed: true,
                  set_type: "warmup",
                },
                {
                  weight_kg: 80,
                  reps: 5,
                  duration_seconds: null,
                  is_completed: false,
                  set_type: "normal",
                },
              ],
            },
          ],
          error: null,
        },
      ]);

      const result = await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID);
      expect(result[0].best_set_weight_kg).toBeNull();
      expect(result[0].best_set_reps).toBeNull();
      expect(result[0].total_volume).toBeNull();
      expect(result[0].total_sets).toBe(0);
    });

    it("applies the since filter via gte when option is set", async () => {
      queueThenResponses([{ data: [], error: null }]);

      await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID, {
        since: "2026-01-01T00:00:00Z",
      });

      mockSupabaseClient.expectQuery({
        method: "gte",
        args: ["workout.started_at", "2026-01-01T00:00:00Z"],
      });
    });

    it("does NOT apply gte when since is omitted", async () => {
      queueThenResponses([{ data: [], error: null }]);

      await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID);

      const gteCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "gte",
      );
      expect(gteCalls).toHaveLength(0);
    });

    it("asserts full base query chain (table, eqs, final order descending)", async () => {
      queueThenResponses([{ data: [], error: null }]);

      await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID);

      mockSupabaseClient.expectQuery({
        table: "workout_exercises",
        method: "from",
        args: ["workout_exercises"],
      });
      mockSupabaseClient.expectQuery({
        method: "select",
        args: [
          `
        id, workout_id,
        exercise:exercises (user_id, exercise_type),
        sets:workout_sets (id, weight_kg, reps, duration_seconds, is_completed, set_type),
        workout:workouts!inner (id, user_id, started_at, completed_at, duration_seconds, status, native_completion, recorded_completion)
      `,
        ],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["exercise_id", EXERCISE_ID],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["workout.status", "completed"],
      });
      mockSupabaseClient.expectQuery({
        method: "eq",
        args: ["workout.user_id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        method: "order",
        args: [
          "started_at",
          { referencedTable: "workouts", ascending: false },
        ],
      });
    });

    it("returns [] when data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID);
      expect(result).toEqual([]);
    });

    it("defaults row.sets to [] when null (kills `?? []` mutant)", async () => {
      queueThenResponses([
        {
          data: [
            {
              workout_id: "w-1",
              workout: {
                id: "w-1",
                started_at: "2026-02-28T10:00:00Z",
                status: "completed",
                user_id: USER_ID,
              },
              sets: null,
            },
          ],
          error: null,
        },
      ]);

      const result = await workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID);
      expect(result).toHaveLength(1);
      expect(result[0].total_sets).toBe(0);
      expect(result[0].best_set_weight_kg).toBeNull();
    });

    it("logs error and throws on DB error", async () => {
      const dbError = { code: "PGRST500", message: "history failed" };
      queueThenResponses([{ data: null, error: dbError }]);

      await expect(
        workoutsDB.getExerciseHistory(EXERCISE_ID, USER_ID),
      ).rejects.toEqual(dbError);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get exercise history",
        dbError,
      );
    });
  });

  // ===========================================================================
  // getExerciseSets — filter + flatMap style aggregation
  // ===========================================================================
  describe("getExerciseSets", () => {
    it("returns only completed normal sets, enriched with workout_started_at", async () => {
      queueThenResponses([
        {
          data: [
            {
              workout: {
                started_at: "2026-02-28T10:00:00Z",
                status: "completed",
                user_id: USER_ID,
              },
              sets: [
                {
                  id: "s-1",
                  is_completed: true,
                  set_type: "normal",
                  weight_kg: 80,
                  reps: 10,
                },
                {
                  id: "s-2",
                  is_completed: true,
                  set_type: "warmup",
                  weight_kg: 40,
                  reps: 10,
                },
                {
                  id: "s-3",
                  is_completed: false,
                  set_type: "normal",
                  weight_kg: 100,
                  reps: 5,
                },
                {
                  id: "s-4",
                  is_completed: true,
                  set_type: "drop",
                  weight_kg: 60,
                  reps: 12,
                },
              ],
            },
          ],
          error: null,
        },
      ]);

      const result = await workoutsDB.getExerciseSets(EXERCISE_ID, USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("s-1");
      expect(result[0].workout_started_at).toBe("2026-02-28T10:00:00Z");
    });

    it("aggregates sets from multiple workouts preserving order", async () => {
      queueThenResponses([
        {
          data: [
            {
              workout: {
                started_at: "2026-02-20T10:00:00Z",
                status: "completed",
                user_id: USER_ID,
              },
              sets: [
                {
                  id: "s-1",
                  is_completed: true,
                  set_type: "normal",
                  weight_kg: 80,
                  reps: 10,
                },
              ],
            },
            {
              workout: {
                started_at: "2026-02-28T10:00:00Z",
                status: "completed",
                user_id: USER_ID,
              },
              sets: [
                {
                  id: "s-2",
                  is_completed: true,
                  set_type: "normal",
                  weight_kg: 90,
                  reps: 8,
                },
              ],
            },
          ],
          error: null,
        },
      ]);

      const result = await workoutsDB.getExerciseSets(EXERCISE_ID, USER_ID);
      expect(result.map((s) => s.id)).toEqual(["s-1", "s-2"]);
      expect(result.map((s) => s.workout_started_at)).toEqual([
        "2026-02-20T10:00:00Z",
        "2026-02-28T10:00:00Z",
      ]);
    });

    it("defaults row.sets to [] when null", async () => {
      queueThenResponses([
        {
          data: [
            {
              workout: {
                started_at: "2026-02-28T10:00:00Z",
                status: "completed",
                user_id: USER_ID,
              },
              sets: null,
            },
          ],
          error: null,
        },
      ]);

      const result = await workoutsDB.getExerciseSets(EXERCISE_ID, USER_ID);
      expect(result).toEqual([]);
    });

    it("returns [] when data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await workoutsDB.getExerciseSets(EXERCISE_ID, USER_ID);
      expect(result).toEqual([]);
    });

    it("asserts full query chain (table + eqs)", async () => {
      queueThenResponses([{ data: [], error: null }]);

      await workoutsDB.getExerciseSets(EXERCISE_ID, USER_ID);

      expect(mockSupabaseClient.queryLog).toEqual([
        {table:null,method:'rpc',args:['read_train_history_compat',{p_id:null,p_limit:null,p_offset:0}]},
        {
          table: "workout_exercises",
          method: "from",
          args: ["workout_exercises"],
        },
        {
          table: "workout_exercises",
          method: "select",
          args: [
            `
        id,
        exercise:exercises (user_id, exercise_type),
        sets:workout_sets (*),
        workout:workouts!inner (id, user_id, started_at, completed_at, duration_seconds, status, native_completion, recorded_completion)
      `,
          ],
        },
        {
          table: "workout_exercises",
          method: "eq",
          args: ["exercise_id", EXERCISE_ID],
        },
        {
          table: "workout_exercises",
          method: "eq",
          args: ["workout.status", "completed"],
        },
        {
          table: "workout_exercises",
          method: "eq",
          args: ["workout.user_id", USER_ID],
        },
      ]);
    });

    it("logs error and throws on DB error", async () => {
      const dbError = { code: "PGRST500", message: "sets failed" };
      queueThenResponses([{ data: null, error: dbError }]);

      await expect(
        workoutsDB.getExerciseSets(EXERCISE_ID, USER_ID),
      ).rejects.toEqual(dbError);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get exercise sets",
        dbError,
      );
    });
  });

  // ===========================================================================
  // getLastCompletedAt
  // ===========================================================================
  describe("getLastCompletedAt", () => {
    it("returns completed_at from the maybeSingle row", async () => {
      mockSupabaseClient.setMockResponse({
        completed_at: "2026-02-28T12:00:00Z",
      });

      const result = await workoutsDB.getLastCompletedAt(USER_ID);
      expect(result).toBe("2026-02-28T12:00:00Z");

      expect(mockSupabaseClient.queryLog).toEqual([
        {table:null,method:'rpc',args:['read_train_history_compat',{p_id:null,p_limit:null,p_offset:0}]},
        { table: "workouts", method: "from", args: ["workouts"] },
        { table: "workouts", method: "select", args: ["completed_at"] },
        { table: "workouts", method: "eq", args: ["user_id", USER_ID] },
        { table: "workouts", method: "eq", args: ["status", "completed"] },
        {
          table: "workouts",
          method: "order",
          args: ["completed_at", { ascending: false }],
        },
        { table: "workouts", method: "limit", args: [1] },
        { table: "workouts", method: "maybeSingle", args: [] },
      ]);
    });

    it("returns null when no completed workouts exist", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await workoutsDB.getLastCompletedAt(USER_ID);
      expect(result).toBeNull();
    });

    it("logs error and throws on DB error", async () => {
      const dbError = { code: "PGRST500", message: "last failed" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(workoutsDB.getLastCompletedAt(USER_ID)).rejects.toEqual(
        dbError,
      );
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get last completed workout",
        dbError,
      );
    });
  });

  // ===========================================================================
  // getWeekWorkoutCount
  // ===========================================================================
  describe("getWeekWorkoutCount", () => {
    it("appends T00:00:00 to bare date and returns count via head-only select", async () => {
      mockSupabaseClient.setMockResponse(null, null, 3);

      const result = await workoutsDB.getWeekWorkoutCount(
        USER_ID,
        "2026-02-23",
      );
      expect(result).toBe(3);

      expect(mockSupabaseClient.queryLog).toEqual([
        {table:null,method:'rpc',args:['read_train_history_compat',{p_id:null,p_limit:null,p_offset:0}]},
        { table: "workouts", method: "from", args: ["workouts"] },
        {
          table: "workouts",
          method: "select",
          args: ["id", { count: "exact", head: true }],
        },
        { table: "workouts", method: "eq", args: ["user_id", USER_ID] },
        { table: "workouts", method: "eq", args: ["status", "completed"] },
        {
          table: "workouts",
          method: "gte",
          args: ["started_at", "2026-02-23T00:00:00"],
        },
      ]);
    });

    it("passes the date through unchanged when it already contains a 'T'", async () => {
      mockSupabaseClient.setMockResponse(null, null, 5);

      await workoutsDB.getWeekWorkoutCount(USER_ID, "2026-02-23T06:00:00");

      mockSupabaseClient.expectQuery({
        method: "gte",
        args: ["started_at", "2026-02-23T06:00:00"],
      });
    });

    it("returns 0 when count is null", async () => {
      mockSupabaseClient.setMockResponse(null, null, null);

      const result = await workoutsDB.getWeekWorkoutCount(
        USER_ID,
        "2026-02-23",
      );
      expect(result).toBe(0);
    });

    it("logs error and throws on DB error", async () => {
      const dbError = { code: "PGRST500", message: "count failed" };
      mockSupabaseClient.setMockResponse(null, dbError, null);

      await expect(
        workoutsDB.getWeekWorkoutCount(USER_ID, "2026-02-23"),
      ).rejects.toEqual(dbError);
      expect(log.error).toHaveBeenCalledWith(
        "Failed to get week workout count",
        dbError,
      );
    });
  });
});
