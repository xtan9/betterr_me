import { describe, it, expect, vi, beforeEach } from "vitest";
import { CategoriesDB } from "@/lib/db/categories";
import { SEED_CATEGORIES } from "@/lib/categories/seed";
import { mockSupabaseClient } from "../../setup";

describe("CategoriesDB (lib/db/categories)", () => {
  let db: CategoriesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new CategoriesDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getUserCategories
  // =========================================================================

  describe("getUserCategories", () => {
    it("returns categories ordered by sort_order", async () => {
      const rows = [
        { id: "c1", name: "Errands", sort_order: 0 },
        { id: "c2", name: "Health", sort_order: 1 },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getUserCategories("user-1");

      expect(result).toEqual(rows);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("categories");
      expect(mockSupabaseClient.select).toHaveBeenCalledWith("*");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("sort_order", {
        ascending: true,
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getUserCategories("user-1");

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });

      await expect(db.getUserCategories("user-1")).rejects.toEqual({
        code: "500",
        message: "boom",
      });
    });
  });

  // =========================================================================
  // getCategory
  // =========================================================================

  describe("getCategory", () => {
    it("returns category when found", async () => {
      const cat = { id: "c1", user_id: "user-1", name: "Errands" };
      mockSupabaseClient.setMockResponse(cat);

      const result = await db.getCategory("c1", "user-1");

      expect(result).toEqual(cat);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("categories");
      expect(mockSupabaseClient.select).toHaveBeenCalledWith("*");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "c1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("returns null on PGRST116 (not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getCategory("missing", "user-1");

      expect(result).toBeNull();
    });

    it("throws on other errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.getCategory("c1", "user-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // createCategory
  // =========================================================================

  describe("createCategory", () => {
    it("inserts and returns the new category", async () => {
      const insert = {
        user_id: "user-1",
        name: "NewCat",
        color: "red",
        icon: null,
        sort_order: 5,
      };
      const created = { id: "c-new", ...insert };
      mockSupabaseClient.setMockResponse(created);

      const result = await db.createCategory(insert as any);

      expect(result).toEqual(created);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("categories");
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
        db.createCategory({ user_id: "user-1", name: "X" } as any)
      ).rejects.toEqual({ code: "23505", message: "dup" });
    });
  });

  // =========================================================================
  // updateCategory
  // =========================================================================

  describe("updateCategory", () => {
    it("updates and returns the category", async () => {
      const updated = { id: "c1", user_id: "user-1", name: "Renamed" };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateCategory("c1", "user-1", {
        name: "Renamed",
      } as any);

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("categories");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        name: "Renamed",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "c1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on error (including PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      await expect(
        db.updateCategory("missing", "user-1", { name: "X" } as any)
      ).rejects.toEqual({ code: "PGRST116" });
    });
  });

  // =========================================================================
  // deleteCategory
  // =========================================================================

  describe("deleteCategory", () => {
    it("deletes the category", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.deleteCategory("c1", "user-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("categories");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "c1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.deleteCategory("c1", "user-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // seedCategories
  // =========================================================================

  describe("seedCategories", () => {
    // Safety net: this block monkey-patches `mockSupabaseClient.then` to
    // sequence two distinct terminal awaits (getUserCategories then insert).
    afterEach(() => {
      delete (mockSupabaseClient as { then?: unknown }).then;
    });

    it("exposes exactly 12 seed categories with expected shape", () => {
      expect(SEED_CATEGORIES).toHaveLength(12);
      expect(SEED_CATEGORIES.map((c) => c.name)).toEqual([
        "Errands",
        "Health",
        "Finance",
        "Home",
        "Social",
        "Learning",
        "Meetings",
        "Planning",
        "Development",
        "Research",
        "Admin",
        "Review",
      ]);
    });

    it("returns existing categories without seeding when user has some", async () => {
      const existing = [
        { id: "c1", name: "Errands", sort_order: 0 },
        { id: "c2", name: "Health", sort_order: 1 },
      ];
      mockSupabaseClient.setMockResponse(existing);

      const result = await db.seedCategories("user-1");

      expect(result).toEqual(existing);
      // insert should NOT have been called because user had categories
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it("seeds exactly the 12 defaults when user has none", async () => {
      // Sequence of awaited thenables:
      //   1. getUserCategories → []
      //   2. final insert().select() → inserted rows
      const insertedRows = SEED_CATEGORIES.map((cat, i) => ({
        id: `c-${i}`,
        user_id: "user-1",
        name: cat.name,
        color: cat.color,
        icon: cat.icon ?? null,
        sort_order: i,
      }));

      const thenSeq = [
        { data: [], error: null }, // getUserCategories
        { data: insertedRows, error: null }, // insert().select()
      ];
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        return Promise.resolve(next).then(onFulfilled, onRejected);
      } as any;

      const result = await db.seedCategories("user-1");

      expect(result).toEqual(insertedRows);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("categories");
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(1);

      const insertArg = (mockSupabaseClient.insert as any).mock.calls[0][0];
      expect(insertArg).toHaveLength(12);
      expect(insertArg).toEqual(
        SEED_CATEGORIES.map((cat, i) => ({
          user_id: "user-1",
          name: cat.name,
          color: cat.color,
          icon: cat.icon ?? null,
          sort_order: i,
        }))
      );
    });

    it("returns empty array when insert returns null data", async () => {
      const thenSeq = [
        { data: [], error: null },
        { data: null, error: null },
      ];
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        return Promise.resolve(next).then(onFulfilled, onRejected);
      } as any;

      const result = await db.seedCategories("user-1");

      expect(result).toEqual([]);
    });

    it("throws when insert fails", async () => {
      const thenSeq = [
        { data: [], error: null },
        { data: null, error: { code: "500", message: "insert failed" } },
      ];
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        return Promise.resolve(next).then(onFulfilled, onRejected);
      } as any;

      await expect(db.seedCategories("user-1")).rejects.toEqual({
        code: "500",
        message: "insert failed",
      });
    });

    it("propagates getUserCategories error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "read fail",
      });

      await expect(db.seedCategories("user-1")).rejects.toEqual({
        code: "500",
        message: "read fail",
      });
    });
  });
});
