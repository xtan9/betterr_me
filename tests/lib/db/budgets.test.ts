import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BudgetsDB } from "@/lib/db/budgets";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── constants ───────────────────────────────────────────────────────────────
const HH = "hh-1";
const USER = "u-1";
const MONTH = "2026-04-01";
const NEXT_MONTH_STR = "2026-05-01"; // month+1 start-of-month

// Shared helpers
const BUDGET_CATS_SELECT =
  "*, category:transaction_categories(name, icon, color)";

describe("BudgetsDB", () => {
  let db: BudgetsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new BudgetsDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  // Safety net — any test that queues then-responses must reset the prototype.
  // Using the shared helper keeps behavior identical across tests.
  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // =========================================================================
  // getByMonth — SELECT budget (single) → SELECT budget_categories → delegate
  // to getSpendingByCategory (SELECT tx → SELECT splits)
  // =========================================================================
  describe("getByMonth", () => {
    it("returns budget with categories and computed spending (full queryLog)", async () => {
      const budget = {
        id: "b-1",
        household_id: HH,
        month: MONTH,
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

      // .single() reads from setMockResponse — so set it for the budget SELECT
      mockSupabaseClient.setMockResponse(budget);
      // Awaited thenables: budget_categories, transactions, splits
      queueThenResponses([
        { data: budgetCats, error: null },
        { data: transactions, error: null },
        { data: [], error: null },
      ]);

      const result = await db.getByMonth(HH, MONTH);

      // Concrete numeric assertions — mutations to arithmetic / sign / Math.abs
      // must flip these values.
      expect(result).not.toBeNull();
      expect(result!.id).toBe("b-1");
      expect(result!.categories).toHaveLength(2);
      expect(result!.categories[0]).toEqual({
        id: "bc-1",
        budget_id: "b-1",
        category_id: "cat-1",
        allocated_cents: 50000,
        rollover_cents: 0,
        created_at: "2026-04-01T00:00:00Z",
        spent_cents: 2500,
        category_name: "Food",
        category_icon: "🍔",
        category_color: "#f00",
      });
      expect(result!.categories[1]).toEqual({
        id: "bc-2",
        budget_id: "b-1",
        category_id: "cat-2",
        allocated_cents: 30000,
        rollover_cents: 1000,
        created_at: "2026-04-01T00:00:00Z",
        spent_cents: 1000,
        category_name: "Gas",
        category_icon: null,
        category_color: null,
      });
      expect(result!.total_allocated_cents).toBe(80000); // 50000 + 30000
      expect(result!.total_spent_cents).toBe(3500); // 2500 + 1000

      // Full ordered queryLog — pins table / method / args for BOTH phases
      // (budget SELECT, budget_categories SELECT, tx SELECT, splits SELECT).
      // Needed because the same table names / filter columns repeat across
      // phases; expectQuery() would match any of them and miss mutants.
      expect(mockSupabaseClient.queryLog).toEqual([
        // budget SELECT
        { table: "budgets", method: "from", args: ["budgets"] },
        { table: "budgets", method: "select", args: ["*"] },
        { table: "budgets", method: "eq", args: ["household_id", HH] },
        { table: "budgets", method: "eq", args: ["month", MONTH] },
        { table: "budgets", method: "single", args: [] },
        // budget_categories SELECT
        {
          table: "budget_categories",
          method: "from",
          args: ["budget_categories"],
        },
        {
          table: "budget_categories",
          method: "select",
          args: [BUDGET_CATS_SELECT],
        },
        {
          table: "budget_categories",
          method: "eq",
          args: ["budget_id", "b-1"],
        },
        // getSpendingByCategory — transactions SELECT
        { table: "transactions", method: "from", args: ["transactions"] },
        {
          table: "transactions",
          method: "select",
          args: ["id, amount_cents, category_id"],
        },
        { table: "transactions", method: "eq", args: ["household_id", HH] },
        {
          table: "transactions",
          method: "gte",
          args: ["transaction_date", MONTH],
        },
        {
          table: "transactions",
          method: "lt",
          args: ["transaction_date", NEXT_MONTH_STR],
        },
        { table: "transactions", method: "lt", args: ["amount_cents", 0] },
        // splits SELECT
        {
          table: "transaction_splits",
          method: "from",
          args: ["transaction_splits"],
        },
        {
          table: "transaction_splits",
          method: "select",
          args: ["transaction_id, category_id, amount_cents"],
        },
        {
          table: "transaction_splits",
          method: "in",
          args: ["transaction_id", ["t-1", "t-2"]],
        },
      ]);
    });

    it("returns null on PGRST116 (budget not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getByMonth(HH, MONTH);

      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 budget error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.getByMonth(HH, MONTH)).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });

    it("throws when budget_categories fetch errors", async () => {
      const budget = { id: "b-1", month: MONTH };
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([
        { data: null, error: { code: "500", message: "cat fail" } },
      ]);

      await expect(db.getByMonth(HH, MONTH)).rejects.toEqual({
        code: "500",
        message: "cat fail",
      });
    });

    it("defaults category fields to 'Unknown' and null when joined category is missing", async () => {
      const budget = { id: "b-1", month: MONTH };
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
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([
        { data: budgetCats, error: null },
        { data: [], error: null }, // transactions empty — no splits call
      ]);

      const result = await db.getByMonth(HH, MONTH);

      expect(result!.categories[0].category_name).toBe("Unknown");
      expect(result!.categories[0].category_icon).toBeNull();
      expect(result!.categories[0].category_color).toBeNull();
      // No spending for cat-1 → default 0 from `|| 0`
      expect(result!.categories[0].spent_cents).toBe(0);
    });

    it("returns empty categories list when budget_categories data is null", async () => {
      const budget = { id: "b-1", month: MONTH };
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([
        { data: null, error: null }, // budget_categories is null → `|| []`
        { data: [], error: null }, // transactions empty
      ]);

      const result = await db.getByMonth(HH, MONTH);

      expect(result!.categories).toEqual([]);
      expect(result!.total_allocated_cents).toBe(0);
      expect(result!.total_spent_cents).toBe(0);
    });

    // Kills MethodExpression (setMonth → setFullYear) and ArithmeticOperator
    // (getMonth() + 1 → - 1) on the dateTo computation, as well as
    // StringLiteral mutations on "T00:00:00" and the "T" split token.
    it("computes half-open date window [month, nextMonth) even for December", async () => {
      const decBudget = { id: "b-dec", month: "2026-12-01" };
      mockSupabaseClient.setMockResponse(decBudget);
      queueThenResponses([
        { data: [], error: null }, // budget_categories
        { data: [], error: null }, // transactions
      ]);

      await db.getByMonth(HH, "2026-12-01");

      // The `gte` must be the requested month; the `lt` must be 2027-01-01
      // — not 2026-11-01 (from `- 1` mutant) or "T00:00:00" variants.
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "gte",
        args: ["transaction_date", "2026-12-01"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "lt",
        args: ["transaction_date", "2027-01-01"],
      });
    });
  });

  // =========================================================================
  // getByMonthFiltered
  // =========================================================================
  describe("getByMonthFiltered", () => {
    it("applies owner_id + is_shared=false filters for 'mine' (full queryLog)", async () => {
      const budget = {
        id: "b-1",
        household_id: HH,
        owner_id: USER,
        is_shared: false,
        month: MONTH,
        total_cents: 100000,
        rollover_enabled: false,
      };
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([
        { data: [], error: null }, // budget_categories
        { data: [], error: null }, // transactions (getSpendingByCategory)
      ]);

      const result = await db.getByMonthFiltered(HH, USER, "mine", MONTH);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("b-1");

      // Full queryLog — critical here because mine/household branches both
      // call `.from("budgets").eq("household_id", hh).eq("month", m)` before
      // diverging. Positional assertions are the only way to catch which
      // eq() actually ran with which args.
      expect(mockSupabaseClient.queryLog).toEqual([
        // budget SELECT with mine filters
        { table: "budgets", method: "from", args: ["budgets"] },
        { table: "budgets", method: "select", args: ["*"] },
        { table: "budgets", method: "eq", args: ["household_id", HH] },
        { table: "budgets", method: "eq", args: ["month", MONTH] },
        { table: "budgets", method: "eq", args: ["owner_id", USER] },
        { table: "budgets", method: "eq", args: ["is_shared", false] },
        { table: "budgets", method: "single", args: [] },
        // budget_categories SELECT
        {
          table: "budget_categories",
          method: "from",
          args: ["budget_categories"],
        },
        {
          table: "budget_categories",
          method: "select",
          args: [BUDGET_CATS_SELECT],
        },
        {
          table: "budget_categories",
          method: "eq",
          args: ["budget_id", "b-1"],
        },
        // getSpendingByCategory (the mine branch uses non-shared)
        { table: "transactions", method: "from", args: ["transactions"] },
        {
          table: "transactions",
          method: "select",
          args: ["id, amount_cents, category_id"],
        },
        { table: "transactions", method: "eq", args: ["household_id", HH] },
        {
          table: "transactions",
          method: "gte",
          args: ["transaction_date", MONTH],
        },
        {
          table: "transactions",
          method: "lt",
          args: ["transaction_date", NEXT_MONTH_STR],
        },
        { table: "transactions", method: "lt", args: ["amount_cents", 0] },
      ]);
    });

    it("applies is_shared=true filter and uses shared spending for 'household'", async () => {
      const budget = {
        id: "b-2",
        household_id: HH,
        is_shared: true,
        month: MONTH,
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
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([
        { data: budgetCats, error: null },
        // getSpendingByCategoryForShared:
        { data: [{ id: "a-1" }], error: null }, // ours accounts
        {
          data: [{ id: "t-1", amount_cents: -500, category_id: "cat-1" }],
          error: null,
        },
        { data: [], error: null }, // no splits
      ]);

      const result = await db.getByMonthFiltered(
        HH,
        USER,
        "household",
        MONTH,
      );

      expect(result!.categories[0].spent_cents).toBe(500);
      expect(result!.total_spent_cents).toBe(500);
      expect(result!.total_allocated_cents).toBe(100000);

      // Full queryLog — pins ALL args across mine/household divergence plus
      // the getSpendingByCategoryForShared call chain (accounts / tx / splits).
      expect(mockSupabaseClient.queryLog).toEqual([
        // budget SELECT with household filter
        { table: "budgets", method: "from", args: ["budgets"] },
        { table: "budgets", method: "select", args: ["*"] },
        { table: "budgets", method: "eq", args: ["household_id", HH] },
        { table: "budgets", method: "eq", args: ["month", MONTH] },
        { table: "budgets", method: "eq", args: ["is_shared", true] },
        { table: "budgets", method: "single", args: [] },
        // budget_categories SELECT
        {
          table: "budget_categories",
          method: "from",
          args: ["budget_categories"],
        },
        {
          table: "budget_categories",
          method: "select",
          args: [BUDGET_CATS_SELECT],
        },
        {
          table: "budget_categories",
          method: "eq",
          args: ["budget_id", "b-2"],
        },
        // getSpendingByCategoryForShared — accounts SELECT
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", HH] },
        { table: "accounts", method: "eq", args: ["visibility", "ours"] },
        // transactions SELECT (scoped to ours account ids)
        { table: "transactions", method: "from", args: ["transactions"] },
        {
          table: "transactions",
          method: "select",
          args: ["id, amount_cents, category_id"],
        },
        { table: "transactions", method: "eq", args: ["household_id", HH] },
        { table: "transactions", method: "in", args: ["account_id", ["a-1"]] },
        {
          table: "transactions",
          method: "gte",
          args: ["transaction_date", MONTH],
        },
        {
          table: "transactions",
          method: "lt",
          args: ["transaction_date", NEXT_MONTH_STR],
        },
        { table: "transactions", method: "lt", args: ["amount_cents", 0] },
        // splits SELECT
        {
          table: "transaction_splits",
          method: "from",
          args: ["transaction_splits"],
        },
        {
          table: "transaction_splits",
          method: "select",
          args: ["transaction_id, category_id, amount_cents"],
        },
        {
          table: "transaction_splits",
          method: "in",
          args: ["transaction_id", ["t-1"]],
        },
      ]);
    });

    it("returns null on PGRST116", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getByMonthFiltered(HH, USER, "mine", MONTH);

      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.getByMonthFiltered(HH, USER, "mine", MONTH),
      ).rejects.toEqual({ code: "500", message: "fail" });
    });

    it("throws when budget_categories fetch errors", async () => {
      mockSupabaseClient.setMockResponse({ id: "b-1", month: MONTH });
      queueThenResponses([
        { data: null, error: { code: "500", message: "catfail" } },
      ]);

      await expect(
        db.getByMonthFiltered(HH, USER, "mine", MONTH),
      ).rejects.toEqual({ code: "500", message: "catfail" });
    });

    it("defaults category fields and spent_cents when joined category is null ('household')", async () => {
      const budget = { id: "b-2", month: MONTH, is_shared: true };
      const budgetCats = [
        {
          id: "bc-1",
          budget_id: "b-2",
          category_id: "cat-unknown",
          allocated_cents: 10000,
          rollover_cents: 0,
          created_at: "2026-04-01T00:00:00Z",
          category: null, // triggers "Unknown" / null / null defaults
        },
      ];
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([
        { data: budgetCats, error: null },
        { data: [], error: null }, // no "ours" accounts → getSpendingByCategoryForShared returns []
      ]);

      const result = await db.getByMonthFiltered(
        HH,
        USER,
        "household",
        MONTH,
      );

      expect(result!.categories[0]).toEqual({
        id: "bc-1",
        budget_id: "b-2",
        category_id: "cat-unknown",
        allocated_cents: 10000,
        rollover_cents: 0,
        created_at: "2026-04-01T00:00:00Z",
        spent_cents: 0, // no spending → default 0
        category_name: "Unknown",
        category_icon: null,
        category_color: null,
      });
      expect(result!.total_allocated_cents).toBe(10000);
      expect(result!.total_spent_cents).toBe(0);
    });

    it("returns empty categories when budget_categories data is null", async () => {
      const budget = { id: "b-1", month: MONTH, is_shared: false };
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([
        { data: null, error: null },
        { data: [], error: null },
      ]);

      const result = await db.getByMonthFiltered(HH, USER, "mine", MONTH);

      expect(result!.categories).toEqual([]);
      expect(result!.total_allocated_cents).toBe(0);
      expect(result!.total_spent_cents).toBe(0);
    });
  });

  // =========================================================================
  // getSpendingByCategoryForShared
  // =========================================================================
  describe("getSpendingByCategoryForShared", () => {
    it("aggregates spending from 'ours' accounts only (concrete totals)", async () => {
      queueThenResponses([
        { data: [{ id: "a-1" }, { id: "a-2" }], error: null },
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: "cat-1" },
            { id: "t-2", amount_cents: -2000, category_id: "cat-1" },
            { id: "t-3", amount_cents: -500, category_id: "cat-2" },
          ],
          error: null,
        },
        { data: [], error: null },
      ]);

      const result = await db.getSpendingByCategoryForShared(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      // Order of entries from a Map is insertion order; assert concrete values.
      const map = new Map(result.map((r) => [r.category_id, r.total_cents]));
      expect(map.get("cat-1")).toBe(3000); // 1000 + 2000 (Math.abs)
      expect(map.get("cat-2")).toBe(500);
      expect(result).toHaveLength(2);

      // Full queryLog pins every chain argument: "accounts" / "ours" /
      // "transactions" / account_id in / half-open date window / < 0 filter /
      // splits in. Kills the String/Method/Arithmetic mutants in this range.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", HH] },
        { table: "accounts", method: "eq", args: ["visibility", "ours"] },
        { table: "transactions", method: "from", args: ["transactions"] },
        {
          table: "transactions",
          method: "select",
          args: ["id, amount_cents, category_id"],
        },
        { table: "transactions", method: "eq", args: ["household_id", HH] },
        {
          table: "transactions",
          method: "in",
          args: ["account_id", ["a-1", "a-2"]],
        },
        {
          table: "transactions",
          method: "gte",
          args: ["transaction_date", MONTH],
        },
        {
          table: "transactions",
          method: "lt",
          args: ["transaction_date", NEXT_MONTH_STR],
        },
        { table: "transactions", method: "lt", args: ["amount_cents", 0] },
        {
          table: "transaction_splits",
          method: "from",
          args: ["transaction_splits"],
        },
        {
          table: "transaction_splits",
          method: "select",
          args: ["transaction_id, category_id, amount_cents"],
        },
        {
          table: "transaction_splits",
          method: "in",
          args: ["transaction_id", ["t-1", "t-2", "t-3"]],
        },
      ]);
    });

    it("returns [] when 'ours' accounts data is null (no accounts)", async () => {
      // Covers the `(oursAccounts || []).map` fallback on null data plus the
      // `oursIds.length === 0` early return. Asserting that the transactions
      // query NEVER ran is what kills the `|| []` → `|| ["Stryker was here"]`
      // mutant — the mutant would synthesize a non-empty id list and proceed
      // to query transactions.
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.getSpendingByCategoryForShared(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([]);
      const txFrom = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "from" && e.args[0] === "transactions",
      );
      expect(txFrom).toHaveLength(0);
    });

    it("returns [] when no 'ours' accounts (empty array early-return)", async () => {
      queueThenResponses([{ data: [], error: null }]);

      const result = await db.getSpendingByCategoryForShared(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([]);
      // transactions SELECT must NOT have run.
      const txFrom = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "from" && e.args[0] === "transactions",
      );
      expect(txFrom).toHaveLength(0);
    });

    it("throws when accounts fetch errors", async () => {
      queueThenResponses([
        { data: null, error: { code: "500", message: "accfail" } },
      ]);

      await expect(
        db.getSpendingByCategoryForShared(HH, MONTH, NEXT_MONTH_STR),
      ).rejects.toEqual({ code: "500", message: "accfail" });
    });

    it("returns [] when no transactions found (skips splits query)", async () => {
      queueThenResponses([
        { data: [{ id: "a-1" }], error: null },
        { data: [], error: null },
      ]);

      const result = await db.getSpendingByCategoryForShared(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([]);
      // Splits SELECT must NOT have run.
      const splitsFrom = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "from" && e.args[0] === "transaction_splits",
      );
      expect(splitsFrom).toHaveLength(0);
    });

    it("returns [] when transactions data is null", async () => {
      queueThenResponses([
        { data: [{ id: "a-1" }], error: null },
        { data: null, error: null }, // tx null → early return
      ]);

      const result = await db.getSpendingByCategoryForShared(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([]);
    });

    it("throws when transactions fetch errors", async () => {
      queueThenResponses([
        { data: [{ id: "a-1" }], error: null },
        { data: null, error: { code: "500", message: "txfail" } },
      ]);

      await expect(
        db.getSpendingByCategoryForShared(HH, MONTH, NEXT_MONTH_STR),
      ).rejects.toEqual({ code: "500", message: "txfail" });
    });

    it("throws when splits fetch errors", async () => {
      queueThenResponses([
        { data: [{ id: "a-1" }], error: null },
        {
          data: [{ id: "t-1", amount_cents: -1000, category_id: "cat-1" }],
          error: null,
        },
        { data: null, error: { code: "500", message: "splitfail" } },
      ]);

      await expect(
        db.getSpendingByCategoryForShared(HH, MONTH, NEXT_MONTH_STR),
      ).rejects.toEqual({ code: "500", message: "splitfail" });
    });

    it("prefers splits over parent categories and uses absolute amounts", async () => {
      queueThenResponses([
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
            {
              transaction_id: "t-1",
              category_id: "cat-split-a",
              amount_cents: -600,
            },
            {
              transaction_id: "t-1",
              category_id: "cat-split-b",
              amount_cents: -400,
            },
          ],
          error: null,
        },
      ]);

      const result = await db.getSpendingByCategoryForShared(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      const map = new Map(result.map((r) => [r.category_id, r.total_cents]));
      expect(map.get("cat-parent")).toBeUndefined(); // skipped — has splits
      expect(map.get("cat-solo")).toBe(500);
      expect(map.get("cat-split-a")).toBe(600); // Math.abs(-600)
      expect(map.get("cat-split-b")).toBe(400);
      // Total entries = cat-solo + two splits
      expect(result).toHaveLength(3);
    });

    it("skips null category_id on both parent tx and splits", async () => {
      queueThenResponses([
        { data: [{ id: "a-1" }], error: null },
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: null }, // skipped
            { id: "t-2", amount_cents: -500, category_id: "cat-1" },
          ],
          error: null,
        },
        {
          data: [
            { transaction_id: "t-3", category_id: null, amount_cents: -300 }, // skipped
            {
              transaction_id: "t-4",
              category_id: "cat-2",
              amount_cents: -200,
            },
          ],
          error: null,
        },
      ]);

      const result = await db.getSpendingByCategoryForShared(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([
        { category_id: "cat-1", total_cents: 500 },
        { category_id: "cat-2", total_cents: 200 },
      ]);
    });

    it("handles null splits data (treats as no splits)", async () => {
      queueThenResponses([
        { data: [{ id: "a-1" }], error: null },
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: "cat-1" },
          ],
          error: null,
        },
        { data: null, error: null }, // splits null → `|| []` default
      ]);

      const result = await db.getSpendingByCategoryForShared(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([{ category_id: "cat-1", total_cents: 1000 }]);
    });

    it("accumulates across duplicate-category splits (kills `|| 0` mutant)", async () => {
      // Two splits on the same transaction with the SAME category — the
      // second iteration MUST read `current` (the first's accumulated value)
      // back out of the Map. A mutant that replaces `|| 0` with `false`
      // would collapse the second read to `false + 300 = 300` instead of
      // `600 + 300 = 900`.
      queueThenResponses([
        { data: [{ id: "a-1" }], error: null },
        {
          data: [
            { id: "t-1", amount_cents: -900, category_id: "cat-parent" },
          ],
          error: null,
        },
        {
          data: [
            {
              transaction_id: "t-1",
              category_id: "cat-x",
              amount_cents: -600,
            },
            {
              transaction_id: "t-1",
              category_id: "cat-x",
              amount_cents: -300,
            },
          ],
          error: null,
        },
      ]);

      const result = await db.getSpendingByCategoryForShared(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([{ category_id: "cat-x", total_cents: 900 }]);
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe("create", () => {
    it("inserts budget and categories (full queryLog)", async () => {
      const createdBudget = {
        id: "b-1",
        household_id: HH,
        month: MONTH,
        total_cents: 100000,
        rollover_enabled: true,
      };
      // .single() returns the inserted budget
      mockSupabaseClient.setMockResponse(createdBudget);
      // Awaited thenable for the categories insert
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.create(
        {
          household_id: HH,
          month: MONTH,
          total_cents: 100000,
          rollover_enabled: true,
        },
        [{ category_id: "cat-1", allocated_cents: 50000 }],
      );

      expect(result).toEqual(createdBudget);

      expect(mockSupabaseClient.queryLog).toEqual([
        // budget INSERT
        { table: "budgets", method: "from", args: ["budgets"] },
        {
          table: "budgets",
          method: "insert",
          args: [
            {
              household_id: HH,
              month: MONTH,
              total_cents: 100000,
              rollover_enabled: true,
            },
          ],
        },
        { table: "budgets", method: "select", args: [] },
        { table: "budgets", method: "single", args: [] },
        // categories INSERT
        {
          table: "budget_categories",
          method: "from",
          args: ["budget_categories"],
        },
        {
          table: "budget_categories",
          method: "insert",
          args: [
            [
              {
                budget_id: "b-1",
                category_id: "cat-1",
                allocated_cents: 50000,
              },
            ],
          ],
        },
      ]);
    });

    it("skips categories insert when array is empty", async () => {
      const createdBudget = { id: "b-1" };
      mockSupabaseClient.setMockResponse(createdBudget);

      const result = await db.create(
        {
          household_id: HH,
          month: MONTH,
          total_cents: 0,
          rollover_enabled: false,
        },
        [],
      );

      expect(result).toEqual(createdBudget);

      // No `.from("budget_categories")` call when categories is empty.
      const catCall = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "from" && e.args[0] === "budget_categories",
      );
      expect(catCall).toHaveLength(0);
    });

    it("throws when budget insert errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "bfail",
      });

      await expect(
        db.create(
          {
            household_id: HH,
            month: MONTH,
            total_cents: 0,
            rollover_enabled: false,
          },
          [],
        ),
      ).rejects.toEqual({ code: "500", message: "bfail" });
    });

    it("throws when categories insert errors", async () => {
      mockSupabaseClient.setMockResponse({ id: "b-1" });
      queueThenResponses([
        { data: null, error: { code: "500", message: "catfail" } },
      ]);

      await expect(
        db.create(
          {
            household_id: HH,
            month: MONTH,
            total_cents: 100,
            rollover_enabled: false,
          },
          [{ category_id: "cat-1", allocated_cents: 100 }],
        ),
      ).rejects.toEqual({ code: "500", message: "catfail" });
    });

    it("maps ALL categories (not just the first) into insert payload", async () => {
      mockSupabaseClient.setMockResponse({ id: "b-1" });
      queueThenResponses([{ data: null, error: null }]);

      await db.create(
        {
          household_id: HH,
          month: MONTH,
          total_cents: 300,
          rollover_enabled: false,
        },
        [
          { category_id: "cat-1", allocated_cents: 100 },
          { category_id: "cat-2", allocated_cents: 200 },
        ],
      );

      mockSupabaseClient.expectQuery({
        table: "budget_categories",
        method: "insert",
        args: [
          [
            { budget_id: "b-1", category_id: "cat-1", allocated_cents: 100 },
            { budget_id: "b-1", category_id: "cat-2", allocated_cents: 200 },
          ],
        ],
      });
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe("update", () => {
    it("updates budget fields, deletes + re-inserts categories, re-fetches (full queryLog)", async () => {
      const updated = {
        id: "b-1",
        total_cents: 200000,
        rollover_enabled: true,
      };
      // Queue: update / delete / insert (3 awaited thenables), then single()
      // reads from setMockResponse.
      queueThenResponses([
        { data: null, error: null }, // budget update
        { data: null, error: null }, // delete budget_categories
        { data: null, error: null }, // insert budget_categories
      ]);
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.update(
        "b-1",
        { total_cents: 200000, rollover_enabled: true },
        [{ category_id: "cat-1", allocated_cents: 100000 }],
      );

      expect(result).toEqual(updated);

      expect(mockSupabaseClient.queryLog).toEqual([
        // budget UPDATE
        { table: "budgets", method: "from", args: ["budgets"] },
        {
          table: "budgets",
          method: "update",
          args: [{ total_cents: 200000, rollover_enabled: true }],
        },
        { table: "budgets", method: "eq", args: ["id", "b-1"] },
        // DELETE existing budget_categories
        {
          table: "budget_categories",
          method: "from",
          args: ["budget_categories"],
        },
        { table: "budget_categories", method: "delete", args: [] },
        {
          table: "budget_categories",
          method: "eq",
          args: ["budget_id", "b-1"],
        },
        // INSERT new budget_categories
        {
          table: "budget_categories",
          method: "from",
          args: ["budget_categories"],
        },
        {
          table: "budget_categories",
          method: "insert",
          args: [
            [
              {
                budget_id: "b-1",
                category_id: "cat-1",
                allocated_cents: 100000,
              },
            ],
          ],
        },
        // Final SELECT
        { table: "budgets", method: "from", args: ["budgets"] },
        { table: "budgets", method: "select", args: ["*"] },
        { table: "budgets", method: "eq", args: ["id", "b-1"] },
        { table: "budgets", method: "single", args: [] },
      ]);
    });

    it("skips budget update when updates object is empty", async () => {
      const updated = { id: "b-1" };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.update("b-1", {});

      expect(result).toEqual(updated);
      // No UPDATE at all.
      const updateCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "update",
      );
      expect(updateCalls).toHaveLength(0);
    });

    it("sends ONLY total_cents when rollover_enabled is undefined", async () => {
      queueThenResponses([{ data: null, error: null }]);
      mockSupabaseClient.setMockResponse({ id: "b-1" });

      await db.update("b-1", { total_cents: 500 });

      // Must be the exact partial update — not including rollover_enabled
      // (undefined would trigger the `!== undefined` conditional if mutated).
      mockSupabaseClient.expectQuery({
        table: "budgets",
        method: "update",
        args: [{ total_cents: 500 }],
      });
    });

    it("sends ONLY rollover_enabled when total_cents is undefined", async () => {
      queueThenResponses([{ data: null, error: null }]);
      mockSupabaseClient.setMockResponse({ id: "b-1" });

      await db.update("b-1", { rollover_enabled: true });

      mockSupabaseClient.expectQuery({
        table: "budgets",
        method: "update",
        args: [{ rollover_enabled: true }],
      });
    });

    it("sends rollover_enabled=false (not dropped by falsy check)", async () => {
      // Kills mutant that replaces `!== undefined` with `!== null` or truthy —
      // a `false` value must still be written.
      queueThenResponses([{ data: null, error: null }]);
      mockSupabaseClient.setMockResponse({ id: "b-1" });

      await db.update("b-1", { rollover_enabled: false });

      mockSupabaseClient.expectQuery({
        table: "budgets",
        method: "update",
        args: [{ rollover_enabled: false }],
      });
    });

    it("sends total_cents=0 (not dropped by falsy check)", async () => {
      queueThenResponses([{ data: null, error: null }]);
      mockSupabaseClient.setMockResponse({ id: "b-1" });

      await db.update("b-1", { total_cents: 0 });

      mockSupabaseClient.expectQuery({
        table: "budgets",
        method: "update",
        args: [{ total_cents: 0 }],
      });
    });

    it("deletes categories but skips insert when new list is empty", async () => {
      queueThenResponses([
        { data: null, error: null }, // update
        { data: null, error: null }, // delete
      ]);
      mockSupabaseClient.setMockResponse({ id: "b-1" });

      await db.update("b-1", { total_cents: 100 }, []);

      // DELETE happened…
      const deleteCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "delete",
      );
      expect(deleteCalls).toHaveLength(1);
      // …but there is no INSERT on budget_categories.
      const catInserts = mockSupabaseClient.queryLog.filter(
        (e) =>
          e.method === "insert" &&
          Array.isArray(e.args[0]) &&
          Array.isArray((e.args[0] as unknown[]).slice(0, 0)),
      );
      expect(catInserts).toHaveLength(0);
    });

    it("throws when budget update errors", async () => {
      queueThenResponses([
        { data: null, error: { code: "500", message: "ufail" } },
      ]);

      await expect(
        db.update("b-1", { total_cents: 100 }),
      ).rejects.toEqual({ code: "500", message: "ufail" });
    });

    it("throws when delete errors", async () => {
      queueThenResponses([
        { data: null, error: null }, // update succeeds
        { data: null, error: { code: "500", message: "delfail" } },
      ]);

      await expect(
        db.update("b-1", { total_cents: 100 }, [
          { category_id: "cat-1", allocated_cents: 100 },
        ]),
      ).rejects.toEqual({ code: "500", message: "delfail" });
    });

    it("throws when categories insert errors", async () => {
      queueThenResponses([
        { data: null, error: null }, // update
        { data: null, error: null }, // delete
        { data: null, error: { code: "500", message: "insfail" } },
      ]);

      await expect(
        db.update("b-1", { total_cents: 100 }, [
          { category_id: "cat-1", allocated_cents: 100 },
        ]),
      ).rejects.toEqual({ code: "500", message: "insfail" });
    });

    it("throws when final fetch errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fetchfail",
      });

      await expect(db.update("b-1", {})).rejects.toEqual({
        code: "500",
        message: "fetchfail",
      });
    });

    it("does NOT touch budget_categories when categories is undefined", async () => {
      queueThenResponses([{ data: null, error: null }]);
      mockSupabaseClient.setMockResponse({ id: "b-1" });

      // No categories arg — atomic replace block should be skipped.
      await db.update("b-1", { total_cents: 100 });

      const bcCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "from" && e.args[0] === "budget_categories",
      );
      expect(bcCalls).toHaveLength(0);
    });
  });

  // =========================================================================
  // delete
  // =========================================================================
  describe("delete", () => {
    it("deletes budget row by id", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.delete("b-1");

      // Single-query method — assert full chain.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "budgets", method: "from", args: ["budgets"] },
        { table: "budgets", method: "delete", args: [] },
        { table: "budgets", method: "eq", args: ["id", "b-1"] },
      ]);
    });

    it("throws on delete error", async () => {
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
    it("aggregates by category with no splits (concrete totals + full queryLog)", async () => {
      queueThenResponses([
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: "cat-1" },
            { id: "t-2", amount_cents: -2500, category_id: "cat-1" },
            { id: "t-3", amount_cents: -500, category_id: "cat-2" },
          ],
          error: null,
        },
        { data: [], error: null },
      ]);

      const result = await db.getSpendingByCategory(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      const map = new Map(result.map((r) => [r.category_id, r.total_cents]));
      expect(map.get("cat-1")).toBe(3500); // 1000 + 2500 (Math.abs both)
      expect(map.get("cat-2")).toBe(500);
      expect(result).toHaveLength(2);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "transactions", method: "from", args: ["transactions"] },
        {
          table: "transactions",
          method: "select",
          args: ["id, amount_cents, category_id"],
        },
        { table: "transactions", method: "eq", args: ["household_id", HH] },
        {
          table: "transactions",
          method: "gte",
          args: ["transaction_date", MONTH],
        },
        {
          table: "transactions",
          method: "lt",
          args: ["transaction_date", NEXT_MONTH_STR],
        },
        { table: "transactions", method: "lt", args: ["amount_cents", 0] },
        {
          table: "transaction_splits",
          method: "from",
          args: ["transaction_splits"],
        },
        {
          table: "transaction_splits",
          method: "select",
          args: ["transaction_id, category_id, amount_cents"],
        },
        {
          table: "transaction_splits",
          method: "in",
          args: ["transaction_id", ["t-1", "t-2", "t-3"]],
        },
      ]);
    });

    it("returns [] when no transactions (empty array)", async () => {
      queueThenResponses([{ data: [], error: null }]);

      const result = await db.getSpendingByCategory(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([]);
      // No splits SELECT.
      const splitsFrom = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "from" && e.args[0] === "transaction_splits",
      );
      expect(splitsFrom).toHaveLength(0);
    });

    it("returns [] when transactions data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.getSpendingByCategory(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([]);
    });

    it("throws when transactions fetch errors", async () => {
      queueThenResponses([
        { data: null, error: { code: "500", message: "tx" } },
      ]);

      await expect(
        db.getSpendingByCategory(HH, MONTH, NEXT_MONTH_STR),
      ).rejects.toEqual({ code: "500", message: "tx" });
    });

    it("throws when splits fetch errors", async () => {
      queueThenResponses([
        {
          data: [{ id: "t-1", amount_cents: -1000, category_id: "cat-1" }],
          error: null,
        },
        { data: null, error: { code: "500", message: "sp" } },
      ]);

      await expect(
        db.getSpendingByCategory(HH, MONTH, NEXT_MONTH_STR),
      ).rejects.toEqual({ code: "500", message: "sp" });
    });

    it("prefers split categories and uses absolute amounts when tx is split", async () => {
      queueThenResponses([
        {
          data: [
            { id: "t-split", amount_cents: -1000, category_id: "cat-parent" },
            { id: "t-solo", amount_cents: -300, category_id: "cat-solo" },
          ],
          error: null,
        },
        {
          data: [
            {
              transaction_id: "t-split",
              category_id: "cat-a",
              amount_cents: -600,
            },
            {
              transaction_id: "t-split",
              category_id: "cat-b",
              amount_cents: -400,
            },
          ],
          error: null,
        },
      ]);

      const result = await db.getSpendingByCategory(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      const map = new Map(result.map((r) => [r.category_id, r.total_cents]));
      expect(map.get("cat-parent")).toBeUndefined();
      expect(map.get("cat-solo")).toBe(300);
      expect(map.get("cat-a")).toBe(600);
      expect(map.get("cat-b")).toBe(400);
      expect(result).toHaveLength(3);
    });

    it("skips transactions and splits with null category_id", async () => {
      queueThenResponses([
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: null },
            { id: "t-2", amount_cents: -500, category_id: "cat-1" },
          ],
          error: null,
        },
        {
          data: [
            { transaction_id: "t-3", category_id: null, amount_cents: -200 },
          ],
          error: null,
        },
      ]);

      const result = await db.getSpendingByCategory(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([{ category_id: "cat-1", total_cents: 500 }]);
    });

    it("handles null splits data (treats as [])", async () => {
      queueThenResponses([
        {
          data: [
            { id: "t-1", amount_cents: -1000, category_id: "cat-1" },
          ],
          error: null,
        },
        { data: null, error: null }, // splits null → `|| []`
      ]);

      const result = await db.getSpendingByCategory(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([{ category_id: "cat-1", total_cents: 1000 }]);
    });

    it("accumulates Math.abs across positive/negative split amounts", async () => {
      // Defensive: Math.abs must run on the split amount. A mutation that
      // removes it would turn negatives into negative totals.
      queueThenResponses([
        {
          data: [{ id: "t-1", amount_cents: -1000, category_id: "cat-parent" }],
          error: null,
        },
        {
          data: [
            { transaction_id: "t-1", category_id: "cat-x", amount_cents: -700 },
            { transaction_id: "t-1", category_id: "cat-x", amount_cents: -300 },
          ],
          error: null,
        },
      ]);

      const result = await db.getSpendingByCategory(
        HH,
        MONTH,
        NEXT_MONTH_STR,
      );

      expect(result).toEqual([{ category_id: "cat-x", total_cents: 1000 }]);
    });
  });

  // =========================================================================
  // getBudgetTotalsByMonth
  // =========================================================================
  describe("getBudgetTotalsByMonth", () => {
    it("returns empty Map when no months requested (no DB call)", async () => {
      const result = await db.getBudgetTotalsByMonth(HH, []);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it("returns map of month to total_cents (full queryLog)", async () => {
      mockSupabaseClient.setMockResponse([
        { month: "2026-04-01", total_cents: 100000 },
        { month: "2026-03-01", total_cents: 80000 },
      ]);

      const result = await db.getBudgetTotalsByMonth(HH, [
        "2026-04-01",
        "2026-03-01",
      ]);

      expect(result.get("2026-04-01")).toBe(100000);
      expect(result.get("2026-03-01")).toBe(80000);
      expect(result.size).toBe(2);

      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "budgets", method: "from", args: ["budgets"] },
        {
          table: "budgets",
          method: "select",
          args: ["month, total_cents"],
        },
        { table: "budgets", method: "eq", args: ["household_id", HH] },
        {
          table: "budgets",
          method: "in",
          args: ["month", ["2026-04-01", "2026-03-01"]],
        },
      ]);
    });

    it("returns empty map when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getBudgetTotalsByMonth(HH, ["2026-04-01"]);

      expect(result.size).toBe(0);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.getBudgetTotalsByMonth(HH, ["2026-04-01"]),
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // getSpendingTrends — uses `new Date()`, needs fake timers
  // =========================================================================
  describe("getSpendingTrends", () => {
    it("returns empty array when 0 months requested (no DB calls)", async () => {
      const result = await db.getSpendingTrends(HH, 0);

      expect(result).toEqual([]);
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it("aggregates spending per month for N months, current first then oldest", async () => {
      // Freeze time at 2026-04-15 so the month math is deterministic:
      //   i=0 → 2026-04-01 .. 2026-05-01
      //   i=1 → 2026-03-01 .. 2026-04-01
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-15T12:00:00.000Z"));
      try {
        queueThenResponses([
          // Month 1 (current, April): tx cat-1 $10
          {
            data: [{ id: "t-1", amount_cents: -1000, category_id: "cat-1" }],
            error: null,
          },
          { data: [], error: null }, // splits
          // Month 2 (March): tx cat-2 $5
          {
            data: [{ id: "t-2", amount_cents: -500, category_id: "cat-2" }],
            error: null,
          },
          { data: [], error: null },
        ]);

        const result = await db.getSpendingTrends(HH, 2);

        expect(result).toEqual([
          { month: "2026-04-01", category_id: "cat-1", total_cents: 1000 },
          { month: "2026-03-01", category_id: "cat-2", total_cents: 500 },
        ]);

        // Verify the half-open date windows match what the month loop should
        // produce. This pins the arithmetic `now.getMonth() - i` and the
        // `getFullYear()`/`getMonth() + 1`/`padStart` formatting.
        mockSupabaseClient.expectQuery({
          table: "transactions",
          method: "gte",
          args: ["transaction_date", "2026-04-01"],
        });
        mockSupabaseClient.expectQuery({
          table: "transactions",
          method: "lt",
          args: ["transaction_date", "2026-05-01"],
        });
        mockSupabaseClient.expectQuery({
          table: "transactions",
          method: "gte",
          args: ["transaction_date", "2026-03-01"],
        });
        mockSupabaseClient.expectQuery({
          table: "transactions",
          method: "lt",
          args: ["transaction_date", "2026-04-01"],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("handles January wrap-back (i=1 crosses into prior year)", async () => {
      // 2026-01-15 → i=0 is 2026-01, i=1 is 2025-12. Exercises year wrap.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
      try {
        queueThenResponses([
          // Month 1 (current, Jan 2026)
          {
            data: [{ id: "t-1", amount_cents: -1000, category_id: "cat-1" }],
            error: null,
          },
          { data: [], error: null },
          // Month 2 (Dec 2025)
          {
            data: [{ id: "t-2", amount_cents: -200, category_id: "cat-2" }],
            error: null,
          },
          { data: [], error: null },
        ]);

        const result = await db.getSpendingTrends(HH, 2);

        expect(result).toEqual([
          { month: "2026-01-01", category_id: "cat-1", total_cents: 1000 },
          { month: "2025-12-01", category_id: "cat-2", total_cents: 200 },
        ]);

        // Half-open for Jan 2026 → gte 2026-01-01, lt 2026-02-01
        mockSupabaseClient.expectQuery({
          table: "transactions",
          method: "gte",
          args: ["transaction_date", "2026-01-01"],
        });
        mockSupabaseClient.expectQuery({
          table: "transactions",
          method: "lt",
          args: ["transaction_date", "2026-02-01"],
        });
        // Half-open for Dec 2025 → gte 2025-12-01, lt 2026-01-01
        mockSupabaseClient.expectQuery({
          table: "transactions",
          method: "gte",
          args: ["transaction_date", "2025-12-01"],
        });
        mockSupabaseClient.expectQuery({
          table: "transactions",
          method: "lt",
          args: ["transaction_date", "2026-01-01"],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns empty when all months have no spending", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-15T12:00:00.000Z"));
      try {
        queueThenResponses([
          { data: [], error: null }, // current month tx: empty → early return, no splits call
        ]);

        const result = await db.getSpendingTrends(HH, 1);

        expect(result).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("zero-pads single-digit months in the emitted month string", async () => {
      // Covers the padStart("0") literal — if padding drops, month becomes "2026-3-01".
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
      try {
        queueThenResponses([
          {
            data: [{ id: "t-1", amount_cents: -100, category_id: "cat-1" }],
            error: null,
          },
          { data: [], error: null },
        ]);

        const result = await db.getSpendingTrends(HH, 1);

        expect(result).toEqual([
          { month: "2026-03-01", category_id: "cat-1", total_cents: 100 },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // =========================================================================
  // computeRollover
  // =========================================================================
  describe("computeRollover", () => {
    it("computes allocated + rollover - spent per category (concrete values + full queryLog)", async () => {
      const budget = { id: "b-1", month: MONTH };
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
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([
        { data: budgetCats, error: null }, // budget_categories
        // getSpendingByCategory:
        {
          data: [{ id: "t-1", amount_cents: -30000, category_id: "cat-1" }],
          error: null,
        },
        { data: [], error: null }, // splits
      ]);

      const result = await db.computeRollover("b-1", HH);

      // cat-1: 50000 + 1000 - 30000 = 21000
      // cat-2: 20000 + 0 - 0 = 20000 (no spending → default 0)
      expect(result).toEqual([
        { category_id: "cat-1", rollover_cents: 21000 },
        { category_id: "cat-2", rollover_cents: 20000 },
      ]);

      // Full queryLog — critical because multiple phases call overlapping
      // tables (budgets SELECT by id, budget_categories SELECT, transactions
      // SELECT, splits SELECT).
      expect(mockSupabaseClient.queryLog).toEqual([
        // budget SELECT
        { table: "budgets", method: "from", args: ["budgets"] },
        { table: "budgets", method: "select", args: ["*"] },
        { table: "budgets", method: "eq", args: ["id", "b-1"] },
        { table: "budgets", method: "single", args: [] },
        // budget_categories SELECT
        {
          table: "budget_categories",
          method: "from",
          args: ["budget_categories"],
        },
        { table: "budget_categories", method: "select", args: ["*"] },
        {
          table: "budget_categories",
          method: "eq",
          args: ["budget_id", "b-1"],
        },
        // getSpendingByCategory — transactions SELECT with half-open window
        { table: "transactions", method: "from", args: ["transactions"] },
        {
          table: "transactions",
          method: "select",
          args: ["id, amount_cents, category_id"],
        },
        { table: "transactions", method: "eq", args: ["household_id", HH] },
        {
          table: "transactions",
          method: "gte",
          args: ["transaction_date", MONTH],
        },
        {
          table: "transactions",
          method: "lt",
          args: ["transaction_date", NEXT_MONTH_STR],
        },
        { table: "transactions", method: "lt", args: ["amount_cents", 0] },
        // splits SELECT
        {
          table: "transaction_splits",
          method: "from",
          args: ["transaction_splits"],
        },
        {
          table: "transaction_splits",
          method: "select",
          args: ["transaction_id, category_id, amount_cents"],
        },
        {
          table: "transaction_splits",
          method: "in",
          args: ["transaction_id", ["t-1"]],
        },
      ]);
    });

    it("returns negative rollover when spending exceeds allocated + prior", async () => {
      const budget = { id: "b-1", month: MONTH };
      const budgetCats = [
        {
          id: "bc-1",
          budget_id: "b-1",
          category_id: "cat-1",
          allocated_cents: 10000,
          rollover_cents: 0,
        },
      ];
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([
        { data: budgetCats, error: null },
        {
          data: [{ id: "t-1", amount_cents: -15000, category_id: "cat-1" }],
          error: null,
        },
        { data: [], error: null },
      ]);

      const result = await db.computeRollover("b-1", HH);

      // 10000 + 0 - 15000 = -5000
      expect(result).toEqual([
        { category_id: "cat-1", rollover_cents: -5000 },
      ]);
    });

    it("returns [] when budget has zero categories", async () => {
      const budget = { id: "b-1", month: MONTH };
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([{ data: [], error: null }]);

      const result = await db.computeRollover("b-1", HH);

      expect(result).toEqual([]);
      // getSpendingByCategory must NOT run when there are no categories.
      const txFrom = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "from" && e.args[0] === "transactions",
      );
      expect(txFrom).toHaveLength(0);
    });

    it("returns [] when budget_categories data is null", async () => {
      const budget = { id: "b-1", month: MONTH };
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.computeRollover("b-1", HH);

      expect(result).toEqual([]);
    });

    it("throws when budget fetch errors", async () => {
      // Use `single.mockResolvedValueOnce` to return the error ONLY for the
      // budget SELECT. Subsequent awaited queries fall through to the
      // prototype `then` (null/null). This ensures the `if (budgetError)`
      // branch is the ONLY reason this test throws — a mutant replacing it
      // with `if (false)` would skip the throw, reach `.budget_categories`
      // with null data, and return `[]` without error (killing the mutant).
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "bfail" },
      });
      mockSupabaseClient.setMockResponse(null, null);

      await expect(db.computeRollover("b-1", HH)).rejects.toEqual({
        code: "500",
        message: "bfail",
      });
    });

    it("throws when budget_categories fetch errors", async () => {
      mockSupabaseClient.setMockResponse({ id: "b-1", month: MONTH });
      queueThenResponses([
        { data: null, error: { code: "500", message: "catfail" } },
      ]);

      await expect(db.computeRollover("b-1", HH)).rejects.toEqual({
        code: "500",
        message: "catfail",
      });
    });

    // Kills MethodExpression (setMonth → setFullYear) and ArithmeticOperator
    // (getMonth() + 1 → - 1) inside computeRollover's date window.
    it("computes dateTo as first-of-next-month (December wrap into next year)", async () => {
      const budget = { id: "b-dec", month: "2026-12-01" };
      const budgetCats = [
        {
          id: "bc-1",
          budget_id: "b-dec",
          category_id: "cat-x",
          allocated_cents: 100,
          rollover_cents: 0,
        },
      ];
      mockSupabaseClient.setMockResponse(budget);
      queueThenResponses([
        { data: budgetCats, error: null },
        { data: [], error: null }, // tx empty → no splits query
      ]);

      await db.computeRollover("b-dec", HH);

      // gte must be the requested month (dateFrom = budget.month)
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "gte",
        args: ["transaction_date", "2026-12-01"],
      });
      // lt must be 2027-01-01 (month + 1, year wraps).
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "lt",
        args: ["transaction_date", "2027-01-01"],
      });
    });
  });

  // =========================================================================
  // confirmRollover
  // =========================================================================
  describe("confirmRollover", () => {
    it("updates rollover_cents for each category (full queryLog pins every eq)", async () => {
      queueThenResponses([
        { data: null, error: null }, // first UPDATE
        { data: null, error: null }, // second UPDATE
      ]);

      await db.confirmRollover("b-from", "b-to", [
        { category_id: "cat-1", rollover_cents: 1000 },
        { category_id: "cat-2", rollover_cents: -500 },
      ]);

      // Full ordered queryLog — there are TWO UPDATE phases hitting the same
      // table with the same column names on eq(). expectQuery() would happily
      // match either one; only queryLog catches mutants that swap the rollover
      // value / category_id / budget_id for the wrong iteration.
      expect(mockSupabaseClient.queryLog).toEqual([
        // First rollover row
        {
          table: "budget_categories",
          method: "from",
          args: ["budget_categories"],
        },
        {
          table: "budget_categories",
          method: "update",
          args: [{ rollover_cents: 1000 }],
        },
        {
          table: "budget_categories",
          method: "eq",
          args: ["budget_id", "b-to"],
        },
        {
          table: "budget_categories",
          method: "eq",
          args: ["category_id", "cat-1"],
        },
        // Second rollover row (negative value survives)
        {
          table: "budget_categories",
          method: "from",
          args: ["budget_categories"],
        },
        {
          table: "budget_categories",
          method: "update",
          args: [{ rollover_cents: -500 }],
        },
        {
          table: "budget_categories",
          method: "eq",
          args: ["budget_id", "b-to"],
        },
        {
          table: "budget_categories",
          method: "eq",
          args: ["category_id", "cat-2"],
        },
      ]);
    });

    it("no-ops on empty rollovers array (no DB calls)", async () => {
      await db.confirmRollover("b-from", "b-to", []);

      expect(mockSupabaseClient.queryLog).toEqual([]);
    });

    it("throws on update error (first row)", async () => {
      queueThenResponses([
        { data: null, error: { code: "500", message: "rollfail" } },
      ]);

      await expect(
        db.confirmRollover("b-from", "b-to", [
          { category_id: "cat-1", rollover_cents: 1000 },
        ]),
      ).rejects.toEqual({ code: "500", message: "rollfail" });
    });

    it("throws on update error mid-loop (second row fails after first succeeds)", async () => {
      // Kills any mutant that accidentally short-circuits the loop or ignores
      // errors on subsequent iterations.
      queueThenResponses([
        { data: null, error: null }, // first succeeds
        { data: null, error: { code: "500", message: "row2fail" } },
      ]);

      await expect(
        db.confirmRollover("b-from", "b-to", [
          { category_id: "cat-1", rollover_cents: 1000 },
          { category_id: "cat-2", rollover_cents: 2000 },
        ]),
      ).rejects.toEqual({ code: "500", message: "row2fail" });
    });
  });
});
