import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CategoriesDB } from "@/lib/db/categories-db";
import { mockSupabaseClient } from "../../setup";

describe("CategoriesDB (lib/db/categories-db, money)", () => {
  let db: CategoriesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new CategoriesDB(mockSupabaseClient as any);
  });

  // Safety net: some tests monkey-patch `mockSupabaseClient.then` to sequence
  // multiple distinct terminal awaits within a single call. Delete the own
  // property after each test so it doesn't leak into subsequent tests.
  afterEach(() => {
    delete (mockSupabaseClient as { then?: unknown }).then;
  });

  // =========================================================================
  // getAll
  // =========================================================================

  describe("getAll", () => {
    it("returns system + household categories ordered is_system DESC then name ASC", async () => {
      const rows = [
        { id: "s1", name: "Food", is_system: true, household_id: null },
        { id: "h1", name: "Custom", is_system: false, household_id: "hh-1" },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getAll("hh-1");

      expect(result).toEqual(rows);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "transaction_categories"
      );
      expect(mockSupabaseClient.select).toHaveBeenCalledWith("*");
      expect(mockSupabaseClient.or).toHaveBeenCalledWith(
        "household_id.is.null,household_id.eq.hh-1"
      );
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("is_system", {
        ascending: false,
      });
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("name", {
        ascending: true,
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getAll("hh-1");

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.getAll("hh-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // getHidden
  // =========================================================================

  describe("getHidden", () => {
    it("returns hidden category IDs", async () => {
      mockSupabaseClient.setMockResponse([
        { category_id: "cat-1" },
        { category_id: "cat-2" },
      ]);

      const result = await db.getHidden("hh-1");

      expect(result).toEqual(["cat-1", "cat-2"]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("hidden_categories");
      expect(mockSupabaseClient.select).toHaveBeenCalledWith("category_id");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "household_id",
        "hh-1"
      );
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getHidden("hh-1");

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.getHidden("hh-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // getVisible
  // =========================================================================

  describe("getVisible", () => {
    it("returns all categories when none are hidden (skips .not filter)", async () => {
      const categories = [
        { id: "s1", name: "Food", is_system: true },
        { id: "s2", name: "Rent", is_system: true },
      ];
      const thenSeq = [
        { data: [], error: null }, // getHidden → []
        { data: categories, error: null }, // final query
      ];
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        return Promise.resolve(next).then(onFulfilled, onRejected);
      } as any;

      const result = await db.getVisible("hh-1");

      expect(result).toEqual(categories);
      expect(mockSupabaseClient.not).not.toHaveBeenCalled();
    });

    it("excludes hidden category IDs via .not('id','in',...)", async () => {
      const categories = [{ id: "s2", name: "Rent", is_system: true }];
      const thenSeq = [
        { data: [{ category_id: "cat-h1" }, { category_id: "cat-h2" }], error: null },
        { data: categories, error: null },
      ];
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        return Promise.resolve(next).then(onFulfilled, onRejected);
      } as any;

      const result = await db.getVisible("hh-1");

      expect(result).toEqual(categories);
      expect(mockSupabaseClient.not).toHaveBeenCalledWith(
        "id",
        "in",
        "(cat-h1,cat-h2)"
      );
    });

    it("returns empty array when final data is null", async () => {
      const thenSeq = [
        { data: [], error: null },
        { data: null, error: null },
      ];
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        return Promise.resolve(next).then(onFulfilled, onRejected);
      } as any;

      const result = await db.getVisible("hh-1");

      expect(result).toEqual([]);
    });

    it("throws when final query errors", async () => {
      const thenSeq = [
        { data: [], error: null },
        { data: null, error: { code: "500", message: "bad" } },
      ];
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        return Promise.resolve(next).then(onFulfilled, onRejected);
      } as any;

      await expect(db.getVisible("hh-1")).rejects.toEqual({
        code: "500",
        message: "bad",
      });
    });

    it("propagates getHidden error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "hidden fail",
      });

      await expect(db.getVisible("hh-1")).rejects.toEqual({
        code: "500",
        message: "hidden fail",
      });
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("inserts and returns the new category", async () => {
      const insert = {
        household_id: "hh-1",
        name: "Custom",
        color: "blue",
        icon: "star",
      };
      const created = { id: "c-new", ...insert, is_system: false };
      mockSupabaseClient.setMockResponse(created);

      const result = await db.create(insert as any);

      expect(result).toEqual(created);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "transaction_categories"
      );
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(insert);
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "23505",
        message: "dup",
      });

      await expect(
        db.create({ household_id: "hh-1", name: "X" } as any)
      ).rejects.toEqual({ code: "23505", message: "dup" });
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe("update", () => {
    it("updates and returns the category", async () => {
      const updated = { id: "c1", name: "Renamed", color: "green" };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.update("c1", {
        name: "Renamed",
        color: "green",
      } as any);

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "transaction_categories"
      );
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        name: "Renamed",
        color: "green",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "c1");
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.update("c1", { name: "X" } as any)).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe("delete", () => {
    it("deletes non-system category", async () => {
      // fetch .single() → { is_system: false }
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { is_system: false },
        error: null,
      });
      // Final delete await
      mockSupabaseClient.setMockResponse(null);

      await db.delete("c1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "transaction_categories"
      );
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "c1");
    });

    it("throws when fetching the category fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "fetch fail" },
      });

      await expect(db.delete("c1")).rejects.toEqual({
        code: "500",
        message: "fetch fail",
      });
      expect(mockSupabaseClient.delete).not.toHaveBeenCalled();
    });

    it("refuses to delete system categories", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { is_system: true },
        error: null,
      });

      await expect(db.delete("sys-1")).rejects.toThrow(
        "Cannot delete system categories"
      );
      expect(mockSupabaseClient.delete).not.toHaveBeenCalled();
    });

    it("throws when final delete fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { is_system: false },
        error: null,
      });
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "del fail",
      });

      await expect(db.delete("c1")).rejects.toEqual({
        code: "500",
        message: "del fail",
      });
    });

    it("allows delete when fetched row is null (no is_system guard trip)", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      mockSupabaseClient.setMockResponse(null);

      await db.delete("c1");

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // hide
  // =========================================================================

  describe("hide", () => {
    it("inserts a hidden_categories row", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.hide("hh-1", "cat-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("hidden_categories");
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        household_id: "hh-1",
        category_id: "cat-1",
      });
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.hide("hh-1", "cat-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // unhide
  // =========================================================================

  describe("unhide", () => {
    it("deletes the hidden_categories row", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.unhide("hh-1", "cat-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("hidden_categories");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "household_id",
        "hh-1"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "category_id",
        "cat-1"
      );
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.unhide("hh-1", "cat-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });
});
