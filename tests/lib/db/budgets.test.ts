import { describe, it, expect, vi, beforeEach } from "vitest";
import { BudgetsDB } from "@/lib/db/budgets";
import { mockSupabaseClient } from "../../setup";

describe("BudgetsDB", () => {
  let db: BudgetsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new BudgetsDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getByMonth
  // =========================================================================

  describe("getByMonth", () => {
    it("returns budget with categories and computed spending", async () => {
      const budget = {
        id: "b-1",
        household_id: "hh-1",
        month: "2026-04-01",
        total_cents: 100000,
        rollover_enabled: false,
      };
      const budgetCats = [
        {
          id: "bc-1",
          budget_id: "b-1",
          category_id: "cat-1",
          allocated_cents: 50000,
          rollover_cents: 0,
          created_at: "2026-04-01T00:00:00Z",
          category: { name: "Food", icon: "🍔", color: "#f00" },
        },
        {
          id: "bc-2",
          budget_id: "b-1",
          category_id: "cat-2",
          allocated_cents: 30000,
          rollover_cents: 1000,
          created_at: "2026-04-01T00:00:00Z",
          category: { name: "Gas", icon: null, color: null },
        },
      ];
      const transactions = [
        { id: "t-1", amount_cents: -2500, category_id: "cat-1" },
        { id: "t-2", amount_cents: -1000, category_id: "cat-2" },
      ];

      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: budget, error: null });
      // For subsequent awaits, we must queue via .then override
      const thenSeq = [
        { data: budgetCats, error: null }, // budget_categories fetch
        { data: transactions, error: null }, // transactions in getSpendingByCategory
        { data: [], error: null }, // splits
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getByMonth("hh-1", "2026-04-01");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("b-1");
      expect(result!.categories).toHaveLength(2);
      expect(result!.categories[0]).toMatchObject({
        category_id: "cat-1",
        allocated_cents: 50000,
        spent_cents: 2500,
        category_name: "Food",
        category_icon: "🍔",
        category_color: "#f00",
      });
      expect(result!.categories[1]).toMatchObject({
        category_id: "cat-2",
        spent_cents: 1000,
        category_name: "Gas",
        category_icon: null,
        category_color: null,
      });
      expect(result!.total_allocated_cents).toBe(80000);
      expect(result!.total_spent_cents).toBe(3500);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("budgets");

      // restore
      mockSupabaseClient.then = origThen;
    });

    it("returns null on PGRST116", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });

      const result = await db.getByMonth("hh-1", "2026-04-01");

      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 budget error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "fail" },
      });

      await expect(db.getByMonth("hh-1", "2026-04-01")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });

    it("throws when budget_categories fetch errors", async () => {
      const budget = {
        id: "b-1",
        household_id: "hh-1",
        month: "2026-04-01",
        total_cents: 100000,
        rollover_enabled: false,
      };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: budget,
        error: null,
      });
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        mockSupabaseClient.then = origThen;
        return Promise.resolve({
          data: null,
          error: { code: "500", message: "cat fail" },
        }).then(onFulfilled, onRejected);
      };

      await expect(db.getByMonth("hh-1", "2026-04-01")).rejects.toEqual({
        code: "500",
        message: "cat fail",
      });
    });

    it("handles null budget_categories and defaults category fields", async () => {
      const budget = {
        id: "b-1",
        household_id: "hh-1",
        month: "2026-04-01",
        total_cents: 100000,
        rollover_enabled: false,
      };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: budget,
        error: null,
      });
      const thenSeq = [
        { data: null, error: null }, // budget_categories null
        { data: [], error: null }, // transactions empty
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getByMonth("hh-1", "2026-04-01");

      expect(result).not.toBeNull();
      expect(result!.categories).toEqual([]);
      expect(result!.total_allocated_cents).toBe(0);
      expect(result!.total_spent_cents).toBe(0);

      mockSupabaseClient.then = origThen;
    });

    it("uses 'Unknown' when joined category is missing", async () => {
      const budget = {
        id: "b-1",
        household_id: "hh-1",
        month: "2026-04-01",
        total_cents: 100000,
        rollover_enabled: false,
      };
      const budgetCats = [
        {
          id: "bc-1",
          budget_id: "b-1",
          category_id: "cat-1",
          allocated_cents: 50000,
          rollover_cents: 0,
          created_at: "2026-04-01T00:00:00Z",
          category: null,
        },
      ];
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: budget,
        error: null,
      });
      const thenSeq = [
        { data: budgetCats, error: null },
        { data: [], error: null },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getByMonth("hh-1", "2026-04-01");

      expect(result!.categories[0].category_name).toBe("Unknown");
      expect(result!.categories[0].category_icon).toBeNull();
      expect(result!.categories[0].category_color).toBeNull();
      expect(result!.categories[0].spent_cents).toBe(0);

      mockSupabaseClient.then = origThen;
    });
  });

  // =========================================================================
  // getByMonthFiltered
  // =========================================================================

  describe("getByMonthFiltered", () => {
    it("filters by owner_id and is_shared=false for 'mine'", async () => {
      const budget = {
        id: "b-1",
        household_id: "hh-1",
        owner_id: "u-1",
        is_shared: false,
        month: "2026-04-01",
        total_cents: 100000,
        rollover_enabled: false,
      };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: budget,
        error: null,
      });
      const thenSeq = [
        { data: [], error: null }, // budget_categories
        { data: [], error: null }, // transactions (getSpendingByCategory)
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getByMonthFiltered(
        "hh-1",
        "u-1",
        "mine",
        "2026-04-01"
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe("b-1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("owner_id", "u-1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_shared", false);

      mockSupabaseClient.then = origThen;
    });

    it("filters by is_shared=true and uses shared spending for 'household'", async () => {
      const budget = {
        id: "b-2",
        household_id: "hh-1",
        is_shared: true,
        month: "2026-04-01",
        total_cents: 200000,
        rollover_enabled: false,
      };
      const budgetCats = [
        {
          id: "bc-1",
          budget_id: "b-2",
          category_id: "cat-1",
          allocated_cents: 100000,
          rollover_cents: 0,
          created_at: "2026-04-01T00:00:00Z",
          category: { name: "Food", icon: null, color: null },
        },
      ];
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: budget,
        error: null,
      });
      const thenSeq = [
        { data: budgetCats, error: null },
        // getSpendingByCategoryForShared:
        { data: [{ id: "a-1" }], error: null }, // accounts
        { data: [{ id: "t-1", amount_cents: -500, category_id: "cat-1" }], error: null }, // tx
        { data: [], error: null }, // splits
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getByMonthFiltered(
        "hh-1",
        "u-1",
        "household",
        "2026-04-01"
      );

      expect(result!.categories[0].spent_cents).toBe(500);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_shared", true);

      mockSupabaseClient.then = origThen;
    });

    it("returns null on PGRST116", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });

      const result = await db.getByMonthFiltered(
        "hh-1",
        "u-1",
        "mine",
        "2026-04-01"
      );

      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "fail" },
      });

      await expect(
        db.getByMonthFiltered("hh-1", "u-1", "mine", "2026-04-01")
      ).rejects.toEqual({ code: "500", message: "fail" });
    });

    it("throws when budget_categories fetch errors", async () => {
      const budget = {
        id: "b-1",
        household_id: "hh-1",
        owner_id: "u-1",
        is_shared: false,
        month: "2026-04-01",
      };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: budget,
        error: null,
      });
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        mockSupabaseClient.then = origThen;
        return Promise.resolve({
          data: null,
          error: { code: "500", message: "catfail" },
        }).then(onFulfilled, onRejected);
      };

      await expect(
        db.getByMonthFiltered("hh-1", "u-1", "mine", "2026-04-01")
      ).rejects.toEqual({ code: "500", message: "catfail" });
    });
  });

  // =========================================================================
  // getSpendingByCategoryForShared
  // =========================================================================

  describe("getSpendingByCategoryForShared", () => {
    it("aggregates spending from 'ours' accounts only", async () => {
      const thenSeq = [
        { data: [{ id: "a-1" }, { id: "a-2" }], error: null },
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: "cat-1" },
            { id: "t-2", amount_cents: -2000, category_id: "cat-1" },
            { id: "t-3", amount_cents: -500, category_id: "cat-2" },
          ],
          error: null,
        },
        { data: [], error: null }, // no splits
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getSpendingByCategoryForShared(
        "hh-1",
        "2026-04-01",
        "2026-05-01"
      );

      expect(result).toEqual(
        expect.arrayContaining([
          { category_id: "cat-1", total_cents: 3000 },
          { category_id: "cat-2", total_cents: 500 },
        ])
      );
      expect(result).toHaveLength(2);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("visibility", "ours");

      mockSupabaseClient.then = origThen;
    });

    it("returns [] when no 'ours' accounts", async () => {
      mockSupabaseClient.setMockResponse([]);

      const result = await db.getSpendingByCategoryForShared(
        "hh-1",
        "2026-04-01",
        "2026-05-01"
      );

      expect(result).toEqual([]);
    });

    it("throws when accounts fetch errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "accfail",
      });

      await expect(
        db.getSpendingByCategoryForShared("hh-1", "2026-04-01", "2026-05-01")
      ).rejects.toEqual({ code: "500", message: "accfail" });
    });

    it("returns [] when no transactions", async () => {
      const thenSeq = [
        { data: [{ id: "a-1" }], error: null },
        { data: [], error: null },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getSpendingByCategoryForShared(
        "hh-1",
        "2026-04-01",
        "2026-05-01"
      );

      expect(result).toEqual([]);
      mockSupabaseClient.then = origThen;
    });

    it("throws when transactions fetch errors", async () => {
      const thenSeq = [
        { data: [{ id: "a-1" }], error: null },
        { data: null, error: { code: "500", message: "txfail" } },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      await expect(
        db.getSpendingByCategoryForShared("hh-1", "2026-04-01", "2026-05-01")
      ).rejects.toEqual({ code: "500", message: "txfail" });

      mockSupabaseClient.then = origThen;
    });

    it("throws when splits fetch errors", async () => {
      const thenSeq = [
        { data: [{ id: "a-1" }], error: null },
        {
          data: [{ id: "t-1", amount_cents: -1000, category_id: "cat-1" }],
          error: null,
        },
        { data: null, error: { code: "500", message: "splitfail" } },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      await expect(
        db.getSpendingByCategoryForShared("hh-1", "2026-04-01", "2026-05-01")
      ).rejects.toEqual({ code: "500", message: "splitfail" });

      mockSupabaseClient.then = origThen;
    });

    it("prefers splits over parent transaction category", async () => {
      const thenSeq = [
        { data: [{ id: "a-1" }], error: null },
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: "cat-parent" },
            { id: "t-2", amount_cents: -500, category_id: "cat-solo" },
          ],
          error: null,
        },
        {
          data: [
            { transaction_id: "t-1", category_id: "cat-split-a", amount_cents: -600 },
            { transaction_id: "t-1", category_id: "cat-split-b", amount_cents: -400 },
          ],
          error: null,
        },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getSpendingByCategoryForShared(
        "hh-1",
        "2026-04-01",
        "2026-05-01"
      );

      const map = new Map(result.map((r) => [r.category_id, r.total_cents]));
      expect(map.get("cat-parent")).toBeUndefined();
      expect(map.get("cat-solo")).toBe(500);
      expect(map.get("cat-split-a")).toBe(600);
      expect(map.get("cat-split-b")).toBe(400);

      mockSupabaseClient.then = origThen;
    });

    it("skips transactions/splits with null category_id", async () => {
      const thenSeq = [
        { data: [{ id: "a-1" }], error: null },
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: null },
            { id: "t-2", amount_cents: -500, category_id: "cat-1" },
          ],
          error: null,
        },
        {
          data: [
            { transaction_id: "t-3", category_id: null, amount_cents: -300 },
          ],
          error: null,
        },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getSpendingByCategoryForShared(
        "hh-1",
        "2026-04-01",
        "2026-05-01"
      );

      expect(result).toEqual([{ category_id: "cat-1", total_cents: 500 }]);

      mockSupabaseClient.then = origThen;
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("creates budget and inserts categories", async () => {
      const created = {
        id: "b-1",
        household_id: "hh-1",
        month: "2026-04-01",
        total_cents: 100000,
        rollover_enabled: true,
      };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: created,
        error: null,
      });
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        mockSupabaseClient.then = origThen;
        return Promise.resolve({ data: null, error: null }).then(
          onFulfilled,
          onRejected
        );
      };

      const result = await db.create(
        {
          household_id: "hh-1",
          month: "2026-04-01",
          total_cents: 100000,
          rollover_enabled: true,
        },
        [{ category_id: "cat-1", allocated_cents: 50000 }]
      );

      expect(result).toEqual(created);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        household_id: "hh-1",
        month: "2026-04-01",
        total_cents: 100000,
        rollover_enabled: true,
      });
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith([
        {
          budget_id: "b-1",
          category_id: "cat-1",
          allocated_cents: 50000,
        },
      ]);
    });

    it("creates budget with no categories and skips second insert", async () => {
      const created = {
        id: "b-1",
        household_id: "hh-1",
        month: "2026-04-01",
        total_cents: 0,
        rollover_enabled: false,
      };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: created,
        error: null,
      });

      const result = await db.create(
        {
          household_id: "hh-1",
          month: "2026-04-01",
          total_cents: 0,
          rollover_enabled: false,
        },
        []
      );

      expect(result).toEqual(created);
      // insert for budget only
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(1);
    });

    it("throws when budget insert errors", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "fail" },
      });

      await expect(
        db.create(
          {
            household_id: "hh-1",
            month: "2026-04-01",
            total_cents: 0,
            rollover_enabled: false,
          },
          []
        )
      ).rejects.toEqual({ code: "500", message: "fail" });
    });

    it("throws when categories insert errors", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "b-1" },
        error: null,
      });
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        mockSupabaseClient.then = origThen;
        return Promise.resolve({
          data: null,
          error: { code: "500", message: "catfail" },
        }).then(onFulfilled, onRejected);
      };

      await expect(
        db.create(
          {
            household_id: "hh-1",
            month: "2026-04-01",
            total_cents: 100,
            rollover_enabled: false,
          },
          [{ category_id: "cat-1", allocated_cents: 100 }]
        )
      ).rejects.toEqual({ code: "500", message: "catfail" });
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe("update", () => {
    it("updates budget fields and replaces categories", async () => {
      const updated = {
        id: "b-1",
        total_cents: 200000,
        rollover_enabled: true,
      };
      // budget update (.then), delete (.then), insert (.then), final select (.single)
      const thenSeq = [
        { data: null, error: null }, // update
        { data: null, error: null }, // delete
        { data: null, error: null }, // insert
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: updated,
        error: null,
      });

      const result = await db.update(
        "b-1",
        { total_cents: 200000, rollover_enabled: true },
        [{ category_id: "cat-1", allocated_cents: 100000 }]
      );

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        total_cents: 200000,
        rollover_enabled: true,
      });
      expect(mockSupabaseClient.delete).toHaveBeenCalled();

      mockSupabaseClient.then = origThen;
    });

    it("skips budget update when no updates provided", async () => {
      const updated = { id: "b-1" };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: updated,
        error: null,
      });

      const result = await db.update("b-1", {});

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.update).not.toHaveBeenCalled();
    });

    it("handles empty categories array (delete only, no insert)", async () => {
      const updated = { id: "b-1" };
      const thenSeq = [
        { data: null, error: null }, // update
        { data: null, error: null }, // delete
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: updated,
        error: null,
      });

      const result = await db.update("b-1", { total_cents: 100 }, []);

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.delete).toHaveBeenCalled();

      mockSupabaseClient.then = origThen;
    });

    it("throws when update errors", async () => {
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        mockSupabaseClient.then = origThen;
        return Promise.resolve({
          data: null,
          error: { code: "500", message: "ufail" },
        }).then(onFulfilled, onRejected);
      };

      await expect(
        db.update("b-1", { total_cents: 100 })
      ).rejects.toEqual({ code: "500", message: "ufail" });
    });

    it("throws when delete errors", async () => {
      const thenSeq = [
        { data: null, error: null }, // update
        { data: null, error: { code: "500", message: "delfail" } },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      await expect(
        db.update("b-1", { total_cents: 100 }, [
          { category_id: "cat-1", allocated_cents: 100 },
        ])
      ).rejects.toEqual({ code: "500", message: "delfail" });

      mockSupabaseClient.then = origThen;
    });

    it("throws when insert errors", async () => {
      const thenSeq = [
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: { code: "500", message: "insfail" } },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      await expect(
        db.update("b-1", { total_cents: 100 }, [
          { category_id: "cat-1", allocated_cents: 100 },
        ])
      ).rejects.toEqual({ code: "500", message: "insfail" });

      mockSupabaseClient.then = origThen;
    });

    it("throws when final fetch errors", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "fetchfail" },
      });

      await expect(db.update("b-1", {})).rejects.toEqual({
        code: "500",
        message: "fetchfail",
      });
    });

    it("updates only total_cents when rollover_enabled not provided", async () => {
      const thenSeq = [{ data: null, error: null }];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "b-1" },
        error: null,
      });

      await db.update("b-1", { total_cents: 500 });

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        total_cents: 500,
      });

      mockSupabaseClient.then = origThen;
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe("delete", () => {
    it("deletes budget by id", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.delete("b-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("budgets");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "b-1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.delete("b-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // getSpendingByCategory
  // =========================================================================

  describe("getSpendingByCategory", () => {
    it("aggregates by category with no splits", async () => {
      const thenSeq = [
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: "cat-1" },
            { id: "t-2", amount_cents: -2500, category_id: "cat-1" },
            { id: "t-3", amount_cents: -500, category_id: "cat-2" },
          ],
          error: null,
        },
        { data: [], error: null },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getSpendingByCategory(
        "hh-1",
        "2026-04-01",
        "2026-05-01"
      );

      const map = new Map(result.map((r) => [r.category_id, r.total_cents]));
      expect(map.get("cat-1")).toBe(3500);
      expect(map.get("cat-2")).toBe(500);

      mockSupabaseClient.then = origThen;
    });

    it("returns [] when no transactions", async () => {
      mockSupabaseClient.setMockResponse([]);

      const result = await db.getSpendingByCategory(
        "hh-1",
        "2026-04-01",
        "2026-05-01"
      );

      expect(result).toEqual([]);
    });

    it("returns [] when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getSpendingByCategory(
        "hh-1",
        "2026-04-01",
        "2026-05-01"
      );

      expect(result).toEqual([]);
    });

    it("throws when tx fetch errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "tx",
      });

      await expect(
        db.getSpendingByCategory("hh-1", "2026-04-01", "2026-05-01")
      ).rejects.toEqual({ code: "500", message: "tx" });
    });

    it("throws when splits fetch errors", async () => {
      const thenSeq = [
        {
          data: [{ id: "t-1", amount_cents: -1000, category_id: "cat-1" }],
          error: null,
        },
        { data: null, error: { code: "500", message: "sp" } },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      await expect(
        db.getSpendingByCategory("hh-1", "2026-04-01", "2026-05-01")
      ).rejects.toEqual({ code: "500", message: "sp" });

      mockSupabaseClient.then = origThen;
    });

    it("prefers split categories over parent when tx is split", async () => {
      const thenSeq = [
        {
          data: [
            { id: "t-split", amount_cents: -1000, category_id: "cat-parent" },
            { id: "t-solo", amount_cents: -300, category_id: "cat-solo" },
          ],
          error: null,
        },
        {
          data: [
            { transaction_id: "t-split", category_id: "cat-a", amount_cents: -600 },
            { transaction_id: "t-split", category_id: "cat-b", amount_cents: -400 },
          ],
          error: null,
        },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getSpendingByCategory(
        "hh-1",
        "2026-04-01",
        "2026-05-01"
      );

      const map = new Map(result.map((r) => [r.category_id, r.total_cents]));
      expect(map.get("cat-parent")).toBeUndefined();
      expect(map.get("cat-solo")).toBe(300);
      expect(map.get("cat-a")).toBe(600);
      expect(map.get("cat-b")).toBe(400);

      mockSupabaseClient.then = origThen;
    });

    it("skips transactions and splits with null category_id", async () => {
      const thenSeq = [
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: null },
            { id: "t-2", amount_cents: -500, category_id: "cat-1" },
          ],
          error: null,
        },
        {
          data: [{ transaction_id: "t-3", category_id: null, amount_cents: -200 }],
          error: null,
        },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getSpendingByCategory(
        "hh-1",
        "2026-04-01",
        "2026-05-01"
      );

      expect(result).toEqual([{ category_id: "cat-1", total_cents: 500 }]);

      mockSupabaseClient.then = origThen;
    });
  });

  // =========================================================================
  // getBudgetTotalsByMonth
  // =========================================================================

  describe("getBudgetTotalsByMonth", () => {
    it("returns empty Map when no months requested", async () => {
      const result = await db.getBudgetTotalsByMonth("hh-1", []);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it("returns map of month to total_cents", async () => {
      mockSupabaseClient.setMockResponse([
        { month: "2026-04-01", total_cents: 100000 },
        { month: "2026-03-01", total_cents: 80000 },
      ]);

      const result = await db.getBudgetTotalsByMonth("hh-1", [
        "2026-04-01",
        "2026-03-01",
      ]);

      expect(result.get("2026-04-01")).toBe(100000);
      expect(result.get("2026-03-01")).toBe(80000);
      expect(result.size).toBe(2);
      expect(mockSupabaseClient.in).toHaveBeenCalledWith("month", [
        "2026-04-01",
        "2026-03-01",
      ]);
    });

    it("returns empty map when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getBudgetTotalsByMonth("hh-1", ["2026-04-01"]);

      expect(result.size).toBe(0);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.getBudgetTotalsByMonth("hh-1", ["2026-04-01"])
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // getSpendingTrends
  // =========================================================================

  describe("getSpendingTrends", () => {
    it("returns empty array when 0 months requested", async () => {
      const result = await db.getSpendingTrends("hh-1", 0);

      expect(result).toEqual([]);
    });

    it("aggregates spending per month for N months", async () => {
      // For each month, getSpendingByCategory issues 2 queries (tx, splits).
      // For 2 months, that's 4 queries total.
      const thenSeq = [
        // Month 1 (current): 1 tx cat-1 $10
        {
          data: [{ id: "t-1", amount_cents: -1000, category_id: "cat-1" }],
          error: null,
        },
        { data: [], error: null },
        // Month 2 (prev): 1 tx cat-2 $5
        {
          data: [{ id: "t-2", amount_cents: -500, category_id: "cat-2" }],
          error: null,
        },
        { data: [], error: null },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getSpendingTrends("hh-1", 2);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        category_id: "cat-1",
        total_cents: 1000,
      });
      expect(result[0].month).toMatch(/^\d{4}-\d{2}-01$/);
      expect(result[1]).toMatchObject({
        category_id: "cat-2",
        total_cents: 500,
      });

      mockSupabaseClient.then = origThen;
    });

    it("skips months with no spending but still returns array", async () => {
      const thenSeq = [
        { data: [], error: null }, // month 1 tx
        // no second query for splits because transactions is empty → early return
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.getSpendingTrends("hh-1", 1);

      expect(result).toEqual([]);

      mockSupabaseClient.then = origThen;
    });
  });

  // =========================================================================
  // computeRollover
  // =========================================================================

  describe("computeRollover", () => {
    it("computes allocated + rollover - spent per category", async () => {
      const budget = {
        id: "b-1",
        month: "2026-04-01",
      };
      const budgetCats = [
        {
          id: "bc-1",
          budget_id: "b-1",
          category_id: "cat-1",
          allocated_cents: 50000,
          rollover_cents: 1000,
        },
        {
          id: "bc-2",
          budget_id: "b-1",
          category_id: "cat-2",
          allocated_cents: 20000,
          rollover_cents: 0,
        },
      ];
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: budget,
        error: null,
      });
      const thenSeq = [
        { data: budgetCats, error: null }, // budget_categories
        // getSpendingByCategory:
        {
          data: [{ id: "t-1", amount_cents: -30000, category_id: "cat-1" }],
          error: null,
        },
        { data: [], error: null }, // splits
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.computeRollover("b-1", "hh-1");

      expect(result).toEqual([
        { category_id: "cat-1", rollover_cents: 50000 + 1000 - 30000 },
        { category_id: "cat-2", rollover_cents: 20000 + 0 - 0 },
      ]);

      mockSupabaseClient.then = origThen;
    });

    it("returns negative rollover when overspent", async () => {
      const budget = { id: "b-1", month: "2026-04-01" };
      const budgetCats = [
        {
          id: "bc-1",
          budget_id: "b-1",
          category_id: "cat-1",
          allocated_cents: 10000,
          rollover_cents: 0,
        },
      ];
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: budget,
        error: null,
      });
      const thenSeq = [
        { data: budgetCats, error: null },
        {
          data: [{ id: "t-1", amount_cents: -15000, category_id: "cat-1" }],
          error: null,
        },
        { data: [], error: null },
      ];
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        const next = thenSeq.shift();
        if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
        return origThen(onFulfilled, onRejected);
      };

      const result = await db.computeRollover("b-1", "hh-1");

      expect(result[0].rollover_cents).toBe(-5000);

      mockSupabaseClient.then = origThen;
    });

    it("returns [] when budget has no categories", async () => {
      const budget = { id: "b-1", month: "2026-04-01" };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: budget,
        error: null,
      });
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        mockSupabaseClient.then = origThen;
        return Promise.resolve({ data: [], error: null }).then(
          onFulfilled,
          onRejected
        );
      };

      const result = await db.computeRollover("b-1", "hh-1");

      expect(result).toEqual([]);
    });

    it("throws when budget fetch errors", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "bfail" },
      });

      await expect(db.computeRollover("b-1", "hh-1")).rejects.toEqual({
        code: "500",
        message: "bfail",
      });
    });

    it("throws when budget_categories fetch errors", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "b-1", month: "2026-04-01" },
        error: null,
      });
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        mockSupabaseClient.then = origThen;
        return Promise.resolve({
          data: null,
          error: { code: "500", message: "catfail" },
        }).then(onFulfilled, onRejected);
      };

      await expect(db.computeRollover("b-1", "hh-1")).rejects.toEqual({
        code: "500",
        message: "catfail",
      });
    });
  });

  // =========================================================================
  // confirmRollover
  // =========================================================================

  describe("confirmRollover", () => {
    it("updates rollover_cents per category", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.confirmRollover("b-from", "b-to", [
        { category_id: "cat-1", rollover_cents: 1000 },
        { category_id: "cat-2", rollover_cents: -500 },
      ]);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("budget_categories");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        rollover_cents: 1000,
      });
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        rollover_cents: -500,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("budget_id", "b-to");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "category_id",
        "cat-1"
      );
    });

    it("no-ops on empty rollovers array", async () => {
      await db.confirmRollover("b-from", "b-to", []);

      expect(mockSupabaseClient.update).not.toHaveBeenCalled();
    });

    it("throws on error", async () => {
      const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
      mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
        mockSupabaseClient.then = origThen;
        return Promise.resolve({
          data: null,
          error: { code: "500", message: "rollfail" },
        }).then(onFulfilled, onRejected);
      };

      await expect(
        db.confirmRollover("b-from", "b-to", [
          { category_id: "cat-1", rollover_cents: 1000 },
        ])
      ).rejects.toEqual({ code: "500", message: "rollfail" });
    });
  });
});
