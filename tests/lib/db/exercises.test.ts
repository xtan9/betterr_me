import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExercisesDB } from "@/lib/db/exercises";
import { mockSupabaseClient } from "../../setup";

const owner = "64181000-0000-4000-8000-000000000001";
const projection =
  "id,user_id,name,muscle_group_primary,muscle_groups_secondary,equipment,exercise_type,is_custom,created_at,updated_at,catalog_key,archived_at,measurement_convention,version::text,exercise_media(gif_url,thumbnail_url,instructions,alternative_names,exercisedb_id,media_status)";

describe("ExercisesDB", () => {
  let db: ExercisesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new ExercisesDB(mockSupabaseClient as any);
  });

  afterEach(() => {
    delete (mockSupabaseClient as { then?: unknown }).then;
  });

  // =========================================================================
  // getAllExercises
  // =========================================================================

  describe("getAllExercises", () => {
    it("returns all exercises ordered by name asc with media join", async () => {
      const rows = [
        { id: "e1", name: "Bench Press", exercise_media: { gif_url: "g" } },
        { id: "e2", name: "Squat", exercise_media: null },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getAllExercises(owner);

      expect(result).toEqual(rows);
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "from",
        args: ["exercises"],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "select",
        args: [projection],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "or",
        args: [`user_id.is.null,user_id.eq.${owner}`],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "is",
        args: ["archived_at", null],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "order",
        args: ["name", { ascending: true }],
      });
    });

    it("includes archived definitions on request while keeping owner visibility and precise versions", async () => {
      const row = {
        id: "e1",
        name: "Archived press",
        version: "9007199254740993",
        archived_at: "2026-10-25T10:00:00Z",
      };
      mockSupabaseClient.setMockResponse([row]);

      expect(await db.getAllExercises(owner, true)).toEqual([row]);
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "from",
        args: ["exercises"],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "select",
        args: [projection],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "or",
        args: [`user_id.is.null,user_id.eq.${owner}`],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "order",
        args: ["name", { ascending: true }],
      });
      expect(mockSupabaseClient.queryLog).not.toContainEqual({
        table: "exercises",
        method: "is",
        args: ["archived_at", null],
      });
    });

    it("returns [] when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getAllExercises();

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.getAllExercises()).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // getExercise
  // =========================================================================

  describe("getExercise", () => {
    it("returns exercise by id", async () => {
      const row = {
        id: "e1",
        name: "Bench Press",
        version: "9007199254740993",
        archived_at: "2026-10-25T10:00:00Z",
      };
      mockSupabaseClient.setMockResponse(row);

      const result = await db.getExercise("e1", owner);

      expect(result).toEqual(row);
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "from",
        args: ["exercises"],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "select",
        args: [projection],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "eq",
        args: ["id", "e1"],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "or",
        args: [`user_id.is.null,user_id.eq.${owner}`],
      });
      mockSupabaseClient.expectQuery({
        table: "exercises",
        method: "single",
        args: [],
      });
      expect(mockSupabaseClient.queryLog).not.toContainEqual({
        table: "exercises",
        method: "is",
        args: ["archived_at", null],
      });
    });

    it("returns null on PGRST116 (not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getExercise("missing");

      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });

      await expect(db.getExercise("e1")).rejects.toEqual({
        code: "500",
        message: "boom",
      });
    });
  });
});
