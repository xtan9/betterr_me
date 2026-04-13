import { describe, it, expect, vi, beforeEach } from "vitest";
import { MerchantRulesDB } from "@/lib/db/merchant-rules";
import { mockSupabaseClient } from "../../setup";

describe("MerchantRulesDB", () => {
  let db: MerchantRulesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new MerchantRulesDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getByHousehold
  // =========================================================================

  describe("getByHousehold", () => {
    it("returns rules ordered by merchant_name ASC", async () => {
      const rules = [
        {
          id: "r-1",
          household_id: "hh-1",
          merchant_name: "Amazon",
          merchant_name_lower: "amazon",
          category_id: "c-1",
          category: { name: "shopping", icon: "cart", display_name: "Shopping" },
        },
      ];
      mockSupabaseClient.setMockResponse(rules);

      const result = await db.getByHousehold("hh-1");

      expect(result).toEqual(rules);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "merchant_category_rules"
      );
      expect(mockSupabaseClient.select).toHaveBeenCalledWith(
        "*, category:transaction_categories(name, icon, display_name)"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("merchant_name", {
        ascending: true,
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
        message: "db down",
      });

      await expect(db.getByHousehold("hh-1")).rejects.toEqual({
        code: "500",
        message: "db down",
      });
    });
  });

  // =========================================================================
  // findByMerchant
  // =========================================================================

  describe("findByMerchant", () => {
    it("returns rule by case-insensitive merchant name", async () => {
      const rule = {
        id: "r-1",
        household_id: "hh-1",
        merchant_name: "Amazon",
        merchant_name_lower: "amazon",
        category_id: "c-1",
      };
      mockSupabaseClient.setMockResponse(rule);

      const result = await db.findByMerchant("hh-1", "AMAZON");

      expect(result).toEqual(rule);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "merchant_category_rules"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      // Lowercased for the lookup
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "merchant_name_lower",
        "amazon"
      );
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("lowercases mixed-case input", async () => {
      mockSupabaseClient.setMockResponse({ id: "r-1" });

      await db.findByMerchant("hh-1", "StArBuCkS");

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "merchant_name_lower",
        "starbucks"
      );
    });

    it("returns null when not found (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.findByMerchant("hh-1", "Unknown");

      expect(result).toBeNull();
    });

    it("throws on other errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.findByMerchant("hh-1", "Amazon")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("creates a rule and auto-computes merchant_name_lower", async () => {
      const inserted = {
        id: "r-new",
        household_id: "hh-1",
        merchant_name: "Whole Foods",
        merchant_name_lower: "whole foods",
        category_id: "c-1",
      };
      mockSupabaseClient.setMockResponse(inserted);

      const result = await db.create({
        household_id: "hh-1",
        merchant_name: "Whole Foods",
        category_id: "c-1",
      } as any);

      expect(result).toEqual(inserted);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "merchant_category_rules"
      );
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        household_id: "hh-1",
        merchant_name: "Whole Foods",
        category_id: "c-1",
        merchant_name_lower: "whole foods",
      });
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("lowercases merchant_name with mixed case", async () => {
      mockSupabaseClient.setMockResponse({ id: "r-1" });

      await db.create({
        household_id: "hh-1",
        merchant_name: "CoStCo",
        category_id: "c-2",
      } as any);

      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant_name: "CoStCo",
          merchant_name_lower: "costco",
        })
      );
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "23505",
        message: "duplicate",
      });

      await expect(
        db.create({
          household_id: "hh-1",
          merchant_name: "Dup",
          category_id: "c-1",
        } as any)
      ).rejects.toEqual({ code: "23505", message: "duplicate" });
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe("delete", () => {
    it("deletes a rule by id", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.delete("r-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "merchant_category_rules"
      );
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "r-1");
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.delete("r-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // findBulk
  // =========================================================================

  describe("findBulk", () => {
    it("returns empty Map for empty input without querying", async () => {
      const result = await db.findBulk("hh-1", []);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it("returns a Map keyed by lowercase merchant name", async () => {
      const rules = [
        {
          id: "r-1",
          household_id: "hh-1",
          merchant_name: "Amazon",
          merchant_name_lower: "amazon",
          category_id: "c-1",
        },
        {
          id: "r-2",
          household_id: "hh-1",
          merchant_name: "Costco",
          merchant_name_lower: "costco",
          category_id: "c-2",
        },
      ];
      mockSupabaseClient.setMockResponse(rules);

      const result = await db.findBulk("hh-1", ["AMAZON", "Costco", "Unknown"]);

      expect(result.size).toBe(2);
      expect(result.get("amazon")).toEqual(rules[0]);
      expect(result.get("costco")).toEqual(rules[1]);
      expect(result.get("unknown")).toBeUndefined();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "merchant_category_rules"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      // Lowercased list passed to .in()
      expect(mockSupabaseClient.in).toHaveBeenCalledWith(
        "merchant_name_lower",
        ["amazon", "costco", "unknown"]
      );
    });

    it("returns empty Map when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.findBulk("hh-1", ["Amazon"]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.findBulk("hh-1", ["Amazon"])).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });
});
