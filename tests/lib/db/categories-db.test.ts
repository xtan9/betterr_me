import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CategoriesDB } from "@/lib/db/categories-db";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoneyCategoryInsert } from "@/lib/db/types";

/**
 * Rewires `.single()` so tests can queue distinct per-phase payloads AND
 * still have the call recorded in `queryLog`. `mockResolvedValueOnce`
 * replaces the implementation outright and skips `record()`, which breaks
 * full-queryLog assertions.
 */
interface SingleResponse {
  data: unknown;
  error: unknown;
}
let singleQueue: SingleResponse[] = [];
function queueSingleResponses(responses: SingleResponse[]) {
  singleQueue = [...responses];
}
function reinstallSingle() {
  const fn = mockSupabaseClient.single as unknown as ReturnType<typeof vi.fn>;
  fn.mockReset();
  fn.mockImplementation(() => {
    const self = mockSupabaseClient as unknown as {
      queryLog: Array<{ table: string | null; method: string; args: unknown[] }>;
      currentTable: string | null;
      mockData: unknown;
      mockError: unknown;
    };
    self.queryLog.push({
      table: self.currentTable ?? null,
      method: "single",
      args: [],
    });
    const next = singleQueue.shift();
    if (next) {
      return Promise.resolve({ data: next.data, error: next.error });
    }
    return Promise.resolve({ data: self.mockData, error: self.mockError });
  });
}

describe("CategoriesDB (lib/db/categories-db, money)", () => {
  let db: CategoriesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    singleQueue = [];
    reinstallSingle();
    db = new CategoriesDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // =========================================================================
  // getAll
  // =========================================================================

  describe("getAll", () => {
    const HOUSEHOLD_ID = "hh-1";

    it("returns system + household categories ordered is_system DESC then name ASC", async () => {
      const rows = [
        { id: "s1", name: "Food", is_system: true, household_id: null },
        { id: "h1", name: "Custom", is_system: false, household_id: HOUSEHOLD_ID },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getAll(HOUSEHOLD_ID);

      expect(result).toEqual(rows);

      // Full SELECT chain, in order.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "transaction_categories", method: "from", args: ["transaction_categories"] },
        { table: "transaction_categories", method: "select", args: ["*"] },
        {
          table: "transaction_categories",
          method: "or",
          args: [`household_id.is.null,household_id.eq.${HOUSEHOLD_ID}`],
        },
        {
          table: "transaction_categories",
          method: "order",
          args: ["is_system", { ascending: false }],
        },
        {
          table: "transaction_categories",
          method: "order",
          args: ["name", { ascending: true }],
        },
      ]);
    });

    it("returns empty array when data is null (exercises the `data || []` branch)", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getAll(HOUSEHOLD_ID);

      expect(result).toEqual([]);
    });

    it("returns data verbatim when it is an empty array (no fallback applied)", async () => {
      // Empty array is truthy-for-`||` in the sense that it's not null/undefined,
      // so source returns `data`. Still testing the happy-path return value.
      mockSupabaseClient.setMockResponse([]);

      const result = await db.getAll(HOUSEHOLD_ID);

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      const dbError = { code: "500", message: "fail" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.getAll(HOUSEHOLD_ID)).rejects.toEqual(dbError);
    });
  });

  // =========================================================================
  // getHidden
  // =========================================================================

  describe("getHidden", () => {
    const HOUSEHOLD_ID = "hh-1";

    it("returns hidden category IDs (maps category_id column)", async () => {
      mockSupabaseClient.setMockResponse([
        { category_id: "cat-1" },
        { category_id: "cat-2" },
      ]);

      const result = await db.getHidden(HOUSEHOLD_ID);

      expect(result).toEqual(["cat-1", "cat-2"]);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "hidden_categories", method: "from", args: ["hidden_categories"] },
        { table: "hidden_categories", method: "select", args: ["category_id"] },
        { table: "hidden_categories", method: "eq", args: ["household_id", HOUSEHOLD_ID] },
      ]);
    });

    it("returns empty array when data is null (exercises `(data || [])` branch)", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getHidden(HOUSEHOLD_ID);

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      const dbError = { code: "500", message: "fail" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.getHidden(HOUSEHOLD_ID)).rejects.toEqual(dbError);
    });
  });

  // =========================================================================
  // getVisible
  // =========================================================================

  describe("getVisible", () => {
    const HOUSEHOLD_ID = "hh-1";

    it("returns all categories when none are hidden (skips .not filter)", async () => {
      const categories = [
        { id: "s1", name: "Food", is_system: true },
        { id: "s2", name: "Rent", is_system: true },
      ];
      // Phase 1: getHidden awaited → []
      // Phase 2: final awaited query → categories
      queueThenResponses([
        { data: [], error: null },
        { data: categories, error: null },
      ]);

      const result = await db.getVisible(HOUSEHOLD_ID);

      expect(result).toEqual(categories);

      // .not MUST NOT have been called because hidden list was empty.
      const notCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "not",
      );
      expect(notCalls).toHaveLength(0);

      // Assert the SELECT chain args explicitly.
      mockSupabaseClient.expectQuery({
        table: "transaction_categories",
        method: "from",
        args: ["transaction_categories"],
      });
      mockSupabaseClient.expectQuery({
        table: "transaction_categories",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "transaction_categories",
        method: "or",
        args: [`household_id.is.null,household_id.eq.${HOUSEHOLD_ID}`],
      });
      mockSupabaseClient.expectQuery({
        table: "transaction_categories",
        method: "order",
        args: ["is_system", { ascending: false }],
      });
      mockSupabaseClient.expectQuery({
        table: "transaction_categories",
        method: "order",
        args: ["name", { ascending: true }],
      });
    });

    it("excludes hidden category IDs via .not('id','in',...) when list is non-empty", async () => {
      const categories = [{ id: "s2", name: "Rent", is_system: true }];
      queueThenResponses([
        { data: [{ category_id: "cat-h1" }, { category_id: "cat-h2" }], error: null },
        { data: categories, error: null },
      ]);

      const result = await db.getVisible(HOUSEHOLD_ID);

      expect(result).toEqual(categories);

      mockSupabaseClient.expectQuery({
        table: "transaction_categories",
        method: "not",
        args: ["id", "in", "(cat-h1,cat-h2)"],
      });
    });

    it("passes a single hidden ID through the join without a trailing comma", async () => {
      const categories = [{ id: "s2", name: "Rent", is_system: true }];
      queueThenResponses([
        { data: [{ category_id: "only" }], error: null },
        { data: categories, error: null },
      ]);

      await db.getVisible(HOUSEHOLD_ID);

      // Catches mutants that change the join separator or parentheses.
      mockSupabaseClient.expectQuery({
        table: "transaction_categories",
        method: "not",
        args: ["id", "in", "(only)"],
      });
    });

    it("returns empty array when final data is null (exercises `data || []` branch)", async () => {
      queueThenResponses([
        { data: [], error: null },
        { data: null, error: null },
      ]);

      const result = await db.getVisible(HOUSEHOLD_ID);

      expect(result).toEqual([]);
    });

    it("throws when final query errors", async () => {
      const dbError = { code: "500", message: "bad" };
      queueThenResponses([
        { data: [], error: null },
        { data: null, error: dbError },
      ]);

      await expect(db.getVisible(HOUSEHOLD_ID)).rejects.toEqual(dbError);
    });

    it("propagates getHidden error (bails out before building the SELECT)", async () => {
      const dbError = { code: "500", message: "hidden fail" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.getVisible(HOUSEHOLD_ID)).rejects.toEqual(dbError);

      // The SELECT phase never ran → only the hidden_categories chain present.
      // `.or` belongs to the SELECT phase and must be absent when getHidden
      // throws. This catches mutants that reorder the two phases.
      const orCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "or",
      );
      expect(orCalls).toHaveLength(0);
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("inserts and returns the new category (full chain)", async () => {
      const insert: MoneyCategoryInsert = {
        household_id: "hh-1",
        name: "Custom",
        color: "blue",
        icon: "star",
        is_system: false,
        display_name: null,
      };
      const created = { id: "c-new", ...insert };
      mockSupabaseClient.setMockResponse(created);

      const result = await db.create(insert);

      expect(result).toEqual(created);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "transaction_categories", method: "from", args: ["transaction_categories"] },
        { table: "transaction_categories", method: "insert", args: [insert] },
        { table: "transaction_categories", method: "select", args: [] },
        { table: "transaction_categories", method: "single", args: [] },
      ]);
    });

    it("throws on DB error", async () => {
      const dbError = { code: "23505", message: "dup" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(
        db.create({
          household_id: "hh-1",
          name: "X",
          icon: null,
          color: null,
          display_name: null,
          is_system: false,
        }),
      ).rejects.toEqual(dbError);
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe("update", () => {
    const CATEGORY_ID = "c1";

    it("updates and returns the category (full chain)", async () => {
      const updated = { id: CATEGORY_ID, name: "Renamed", color: "green" };
      mockSupabaseClient.setMockResponse(updated);

      const updates = { name: "Renamed", color: "green" } as const;
      const result = await db.update(CATEGORY_ID, updates);

      expect(result).toEqual(updated);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "transaction_categories", method: "from", args: ["transaction_categories"] },
        { table: "transaction_categories", method: "update", args: [updates] },
        { table: "transaction_categories", method: "eq", args: ["id", CATEGORY_ID] },
        { table: "transaction_categories", method: "select", args: [] },
        { table: "transaction_categories", method: "single", args: [] },
      ]);
    });

    it("throws on DB error", async () => {
      const dbError = { code: "500", message: "fail" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(
        db.update(CATEGORY_ID, { name: "X" }),
      ).rejects.toEqual(dbError);
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe("delete", () => {
    const CATEGORY_ID = "c1";

    it("deletes a non-system category (asserts two-phase full chain)", async () => {
      // Phase 1: SELECT is_system via .single() → { is_system: false }
      queueSingleResponses([{ data: { is_system: false }, error: null }]);
      // Phase 2: DELETE awaited → { data: null, error: null }
      queueThenResponses([{ data: null, error: null }]);

      await db.delete(CATEGORY_ID);

      expect(mockSupabaseClient.queryLog).toEqual([
        // SELECT is_system
        { table: "transaction_categories", method: "from", args: ["transaction_categories"] },
        { table: "transaction_categories", method: "select", args: ["is_system"] },
        { table: "transaction_categories", method: "eq", args: ["id", CATEGORY_ID] },
        { table: "transaction_categories", method: "single", args: [] },
        // DELETE
        { table: "transaction_categories", method: "from", args: ["transaction_categories"] },
        { table: "transaction_categories", method: "delete", args: [] },
        { table: "transaction_categories", method: "eq", args: ["id", CATEGORY_ID] },
      ]);
    });

    it("throws when fetching the category fails and does NOT attempt delete", async () => {
      const dbError = { code: "500", message: "fetch fail" };
      queueSingleResponses([{ data: null, error: dbError }]);

      await expect(db.delete(CATEGORY_ID)).rejects.toEqual(dbError);

      const deletes = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "delete",
      );
      expect(deletes).toHaveLength(0);
    });

    it("refuses to delete system categories with exact error message", async () => {
      queueSingleResponses([{ data: { is_system: true }, error: null }]);

      await expect(db.delete("sys-1")).rejects.toThrow(
        "Cannot delete system categories",
      );

      const deletes = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "delete",
      );
      expect(deletes).toHaveLength(0);
    });

    it("throws when the final DELETE fails", async () => {
      const dbError = { code: "500", message: "del fail" };
      queueSingleResponses([{ data: { is_system: false }, error: null }]);
      queueThenResponses([{ data: null, error: dbError }]);

      await expect(db.delete(CATEGORY_ID)).rejects.toEqual(dbError);
    });

    it("allows delete when fetched row is null (is_system guard uses optional-chaining)", async () => {
      // Source uses `category?.is_system`, so a null row falls through to delete.
      queueSingleResponses([{ data: null, error: null }]);
      queueThenResponses([{ data: null, error: null }]);

      await db.delete(CATEGORY_ID);

      const deletes = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "delete",
      );
      expect(deletes).toHaveLength(1);
    });
  });

  // =========================================================================
  // hide
  // =========================================================================

  describe("hide", () => {
    const HOUSEHOLD_ID = "hh-1";
    const CATEGORY_ID = "cat-1";

    it("inserts a hidden_categories row with full chain", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.hide(HOUSEHOLD_ID, CATEGORY_ID);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "hidden_categories", method: "from", args: ["hidden_categories"] },
        {
          table: "hidden_categories",
          method: "insert",
          args: [{ household_id: HOUSEHOLD_ID, category_id: CATEGORY_ID }],
        },
      ]);
    });

    it("throws on DB error", async () => {
      const dbError = { code: "500", message: "fail" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(db.hide(HOUSEHOLD_ID, CATEGORY_ID)).rejects.toEqual(dbError);
    });
  });

  // =========================================================================
  // unhide
  // =========================================================================

  describe("unhide", () => {
    const HOUSEHOLD_ID = "hh-1";
    const CATEGORY_ID = "cat-1";

    it("deletes the hidden_categories row with full chain (both .eq args)", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.unhide(HOUSEHOLD_ID, CATEGORY_ID);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "hidden_categories", method: "from", args: ["hidden_categories"] },
        { table: "hidden_categories", method: "delete", args: [] },
        { table: "hidden_categories", method: "eq", args: ["household_id", HOUSEHOLD_ID] },
        { table: "hidden_categories", method: "eq", args: ["category_id", CATEGORY_ID] },
      ]);
    });

    it("throws on DB error", async () => {
      const dbError = { code: "500", message: "fail" };
      mockSupabaseClient.setMockResponse(null, dbError);

      await expect(
        db.unhide(HOUSEHOLD_ID, CATEGORY_ID),
      ).rejects.toEqual(dbError);
    });
  });
});
