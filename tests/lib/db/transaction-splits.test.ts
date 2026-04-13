import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransactionSplitsDB } from "@/lib/db/transaction-splits";
import { mockSupabaseClient } from "../../setup";

describe("TransactionSplitsDB", () => {
  let db: TransactionSplitsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new TransactionSplitsDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getByTransaction
  // =========================================================================

  describe("getByTransaction", () => {
    it("returns splits joined with categories ordered by amount_cents desc", async () => {
      const rows = [
        {
          id: "sp-1",
          transaction_id: "t-1",
          amount_cents: 800,
          category: { name: "Food", icon: "🍕", display_name: "Food" },
        },
        {
          id: "sp-2",
          transaction_id: "t-1",
          amount_cents: 200,
          category: { name: "Tax", icon: null, display_name: null },
        },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getByTransaction("t-1");

      expect(result).toEqual(rows);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "transaction_splits"
      );
      expect(mockSupabaseClient.select).toHaveBeenCalledWith(
        "*, category:transaction_categories(name, icon, display_name)"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "transaction_id",
        "t-1"
      );
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("amount_cents", {
        ascending: false,
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getByTransaction("t-1");

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });

      await expect(db.getByTransaction("t-1")).rejects.toEqual({
        code: "500",
        message: "boom",
      });
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("returns empty array without hitting DB when input is empty", async () => {
      const result = await db.create([]);

      expect(result).toEqual([]);
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it("batch inserts and returns created splits", async () => {
      const input = [
        { transaction_id: "t-1", category_id: "c-1", amount_cents: 500 },
        { transaction_id: "t-1", category_id: "c-2", amount_cents: 500 },
      ];
      const created = input.map((s, i) => ({ id: `sp-${i}`, ...s }));
      mockSupabaseClient.setMockResponse(created);

      const result = await db.create(input as any);

      expect(result).toEqual(created);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "transaction_splits"
      );
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(input);
      expect(mockSupabaseClient.select).toHaveBeenCalled();
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.create([
        { transaction_id: "t-1", category_id: "c-1", amount_cents: 100 },
      ] as any);

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "23503",
        message: "fk",
      });

      await expect(
        db.create([
          { transaction_id: "t-1", category_id: "c-1", amount_cents: 100 },
        ] as any)
      ).rejects.toEqual({ code: "23503", message: "fk" });
    });
  });

  // =========================================================================
  // deleteByTransaction
  // =========================================================================

  describe("deleteByTransaction", () => {
    it("deletes all splits for a transaction", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.deleteByTransaction("t-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "transaction_splits"
      );
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "transaction_id",
        "t-1"
      );
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "nope",
      });

      await expect(db.deleteByTransaction("t-1")).rejects.toEqual({
        code: "500",
        message: "nope",
      });
    });
  });
});
