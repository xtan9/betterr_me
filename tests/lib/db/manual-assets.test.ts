import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManualAssetsDB } from "@/lib/db/manual-assets";
import { mockSupabaseClient } from "../../setup";

describe("ManualAssetsDB", () => {
  let db: ManualAssetsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new ManualAssetsDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getByHousehold
  // =========================================================================

  describe("getByHousehold", () => {
    it("returns all assets for a household ordered by created_at desc", async () => {
      const mockAssets = [
        { id: "a-2", household_id: "hh-1", name: "Gold", value_cents: 500000 },
        { id: "a-1", household_id: "hh-1", name: "Car", value_cents: 2000000 },
      ];
      mockSupabaseClient.setMockResponse(mockAssets);

      const result = await db.getByHousehold("hh-1");

      expect(result).toEqual(mockAssets);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("manual_assets");
      expect(mockSupabaseClient.select).toHaveBeenCalledWith("*");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getByHousehold("hh-1");

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });

      await expect(db.getByHousehold("hh-1")).rejects.toEqual({
        code: "500",
        message: "boom",
      });
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("inserts and returns the new asset", async () => {
      const insert = {
        household_id: "hh-1",
        name: "Boat",
        value_cents: 1000000,
      };
      const created = { id: "a-new", ...insert };
      mockSupabaseClient.setMockResponse(created);

      const result = await db.create(insert as any);

      expect(result).toEqual(created);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("manual_assets");
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(insert);
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "23505",
        message: "dup",
      });

      await expect(
        db.create({ household_id: "hh-1", name: "X", value_cents: 1 } as any)
      ).rejects.toEqual({ code: "23505", message: "dup" });
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe("update", () => {
    it("updates the asset by id and returns the row", async () => {
      const updates = { name: "Renamed", value_cents: 42 };
      const updated = { id: "a-1", household_id: "hh-1", ...updates };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.update("a-1", updates as any);

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("manual_assets");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "a-1");
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "nope",
      });

      await expect(db.update("a-1", { name: "x" } as any)).rejects.toEqual({
        code: "500",
        message: "nope",
      });
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe("delete", () => {
    it("deletes the asset by id", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.delete("a-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("manual_assets");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "a-1");
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.delete("a-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });
});
