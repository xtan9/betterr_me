import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TransactionsDB, escapeIlike } from "@/lib/db/transactions";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransactionInsert } from "@/lib/db/types";

// Mock logger (per R4 — only mock boundaries).
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe("escapeIlike", () => {
  it("escapes % characters", () => {
    expect(escapeIlike("50% off")).toBe("50\\% off");
  });

  it("escapes _ characters", () => {
    expect(escapeIlike("foo_bar")).toBe("foo\\_bar");
  });

  it("escapes both % and _ in the same string", () => {
    expect(escapeIlike("a_b%c")).toBe("a\\_b\\%c");
  });

  it("returns empty string for empty input", () => {
    expect(escapeIlike("")).toBe("");
  });

  it("returns unchanged string when no special chars present", () => {
    expect(escapeIlike("plain text")).toBe("plain text");
  });

  it("escapes multiple consecutive special characters", () => {
    expect(escapeIlike("%%__")).toBe("\\%\\%\\_\\_");
  });

  it("handles already-backslashed input by escaping only % and _", () => {
    // Function does NOT escape backslashes, only % and _
    expect(escapeIlike("\\%")).toBe("\\\\%");
  });
});

describe("TransactionsDB", () => {
  let db: TransactionsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new TransactionsDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // =========================================================================
  // getByHousehold — single-phase method: expectQuery for full chain
  // =========================================================================

  describe("getByHousehold", () => {
    it("returns transactions + total on happy path with default pagination (range 0..49)", async () => {
      const rows = [{ id: "t1" }, { id: "t2" }];
      mockSupabaseClient.setMockResponse(rows, null, 2);

      const result = await db.getByHousehold("hh-1");

      expect(result).toEqual({ transactions: rows, total: 2 });

      // Full chain assertion via expectQuery — single phase so this is sufficient.
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "from",
        args: ["transactions"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "select",
        args: ["*", { count: "exact" }],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["household_id", "hh-1"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "order",
        args: ["transaction_date", { ascending: false }],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "order",
        args: ["created_at", { ascending: false }],
      });
      // default pagination: limit=50, offset=0 → range(0, 49)
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "range",
        args: [0, 49],
      });
    });

    it("returns empty transactions array when data is null (count also null)", async () => {
      mockSupabaseClient.setMockResponse(null, null, null);
      const result = await db.getByHousehold("hh-1");
      expect(result).toEqual({ transactions: [], total: 0 });
    });

    it("uses count=0 when count is missing but data is present", async () => {
      // Tests the `count ?? 0` branch specifically.
      mockSupabaseClient.setMockResponse([{ id: "t1" }], null, null);
      const result = await db.getByHousehold("hh-1");
      expect(result).toEqual({ transactions: [{ id: "t1" }], total: 0 });
    });

    it("throws when error is present", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });
      await expect(db.getByHousehold("hh-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });

    it("does NOT apply any optional filters when options is undefined", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1");

      // The only .eq() call should be the required household_id filter.
      const eqCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "eq",
      );
      expect(eqCalls).toEqual([
        { table: "transactions", method: "eq", args: ["household_id", "hh-1"] },
      ]);
      // No gte/lte/or calls.
      expect(
        mockSupabaseClient.queryLog.some((e) => e.method === "gte"),
      ).toBe(false);
      expect(
        mockSupabaseClient.queryLog.some((e) => e.method === "lte"),
      ).toBe(false);
      expect(
        mockSupabaseClient.queryLog.some((e) => e.method === "or"),
      ).toBe(false);
    });

    it("applies accountId filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { accountId: "acc-1" });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["account_id", "acc-1"],
      });
    });

    it("applies source filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { source: "plaid" });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["source", "plaid"],
      });
    });

    it("applies dateFrom filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { dateFrom: "2026-01-01" });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "gte",
        args: ["transaction_date", "2026-01-01"],
      });
    });

    it("applies dateTo filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { dateTo: "2026-01-31" });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "lte",
        args: ["transaction_date", "2026-01-31"],
      });
    });

    it("applies category filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { category: "Food" });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["category", "Food"],
      });
    });

    it("applies categoryId filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { categoryId: "cat-1" });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["category_id", "cat-1"],
      });
    });

    it("applies search filter with escaped characters", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { search: "50% off_deal" });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "or",
        args: [
          "description.ilike.%50\\% off\\_deal%,merchant_name.ilike.%50\\% off\\_deal%",
        ],
      });
    });

    it("applies amountMin filter including 0 (explicit undefined check)", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { amountMin: 0 });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "gte",
        args: ["amount_cents", 0],
      });
    });

    it("applies amountMax filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { amountMax: 5000 });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "lte",
        args: ["amount_cents", 5000],
      });
    });

    it("applies custom limit and offset: range(offset, offset+limit-1)", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { limit: 10, offset: 20 });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "range",
        args: [20, 29],
      });
    });

    it("applies offset=0 with custom limit: range(0, limit-1)", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { limit: 25 });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "range",
        args: [0, 24],
      });
    });

    it("applies options={} as no-op (all filters skipped, default pagination)", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", {});

      const eqCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "eq",
      );
      expect(eqCalls).toEqual([
        { table: "transactions", method: "eq", args: ["household_id", "hh-1"] },
      ]);
      // Default pagination still applied.
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "range",
        args: [0, 49],
      });
    });
  });

  // =========================================================================
  // getById — single-phase
  // =========================================================================

  describe("getById", () => {
    it("returns transaction on happy path with full chain", async () => {
      const row = { id: "t1", amount_cents: 100 };
      mockSupabaseClient.setMockResponse(row);

      const result = await db.getById("t1");

      expect(result).toEqual(row);
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "from",
        args: ["transactions"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["id", "t1"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "single",
        args: [],
      });
    });

    it("returns null on PGRST116 not-found (exact code match)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });
      const result = await db.getById("missing");
      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });
      await expect(db.getById("t1")).rejects.toEqual({
        code: "500",
        message: "boom",
      });
    });

    it("throws (does NOT return null) when error code is similar but NOT exactly PGRST116", async () => {
      // Kills the `error.code === "PGRST116"` StringLiteral mutant — if the
      // check flipped to a different value, the branch would still be entered
      // for the wrong code.
      mockSupabaseClient.setMockResponse(null, { code: "PGRST117" });
      await expect(db.getById("missing")).rejects.toEqual({
        code: "PGRST117",
      });
    });
  });

  // =========================================================================
  // create — single-phase
  // =========================================================================

  describe("create", () => {
    it("creates and returns the inserted transaction with full chain", async () => {
      const inserted = { id: "t1", amount_cents: 200 };
      mockSupabaseClient.setMockResponse(inserted);
      const data = {
        household_id: "hh-1",
        amount_cents: 200,
      } as unknown as TransactionInsert;

      const result = await db.create(data);

      expect(result).toEqual(inserted);
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "from",
        args: ["transactions"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "insert",
        args: [data],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "single",
        args: [],
      });
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "23505" });
      await expect(
        db.create({} as unknown as TransactionInsert),
      ).rejects.toEqual({ code: "23505" });
    });
  });

  // =========================================================================
  // createBatch — multi-phase (loop) ⇒ queryLog assertion
  // =========================================================================

  describe("createBatch", () => {
    it("returns 0 without calling insert when input is empty", async () => {
      const result = await db.createBatch([]);
      expect(result).toBe(0);
      // No DB calls at all.
      expect(mockSupabaseClient.queryLog).toEqual([]);
    });

    it("inserts a single chunk when length < 200, returning exact count", async () => {
      mockSupabaseClient.setMockResponse(null, null);
      const txns = Array.from(
        { length: 5 },
        (_, i) => ({ id: `t${i}` }) as unknown as TransactionInsert,
      );

      const result = await db.createBatch(txns);

      expect(result).toBe(5);
      // Full queryLog: one from+insert pair, no extra calls.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "transactions", method: "from", args: ["transactions"] },
        { table: "transactions", method: "insert", args: [txns] },
      ]);
    });

    it("inserts exactly-200-row input in a single chunk (boundary: i += 200)", async () => {
      // Kills the ConditionalExpression mutant on `i < transactions.length`
      // when input size equals chunk size.
      mockSupabaseClient.setMockResponse(null, null);
      const txns = Array.from(
        { length: 200 },
        (_, i) => ({ id: `t${i}` }) as unknown as TransactionInsert,
      );

      const result = await db.createBatch(txns);

      expect(result).toBe(200);
      const insertCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "insert",
      );
      expect(insertCalls).toHaveLength(1);
    });

    it("inserts 450 in 3 chunks of sizes [200, 200, 50] and calls from() per chunk", async () => {
      mockSupabaseClient.setMockResponse(null, null);
      const txns = Array.from(
        { length: 450 },
        (_, i) => ({ id: `t${i}` }) as unknown as TransactionInsert,
      );

      const result = await db.createBatch(txns);

      expect(result).toBe(450);

      // Assert exact chunk boundaries: slice(0,200), slice(200,400), slice(400,450).
      const insertCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "insert",
      );
      expect(insertCalls).toHaveLength(3);
      expect((insertCalls[0].args[0] as unknown[]).length).toBe(200);
      expect((insertCalls[1].args[0] as unknown[]).length).toBe(200);
      expect((insertCalls[2].args[0] as unknown[]).length).toBe(50);
      // First id of chunk 2 should be t200 (offset 200).
      expect(
        (insertCalls[1].args[0] as Array<{ id: string }>)[0].id,
      ).toBe("t200");
      // First id of chunk 3 should be t400 (offset 400).
      expect(
        (insertCalls[2].args[0] as Array<{ id: string }>)[0].id,
      ).toBe("t400");
    });

    it("inserts 201 rows in 2 chunks of sizes [200, 1] (loop-increment correctness)", async () => {
      // Kills mutants on the `i += 200` stride — if stride were larger, chunk 2
      // wouldn't run; if smaller, we'd get >2 chunks or re-inserted rows.
      mockSupabaseClient.setMockResponse(null, null);
      const txns = Array.from(
        { length: 201 },
        (_, i) => ({ id: `t${i}` }) as unknown as TransactionInsert,
      );

      const result = await db.createBatch(txns);

      expect(result).toBe(201);
      const insertCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "insert",
      );
      expect(insertCalls).toHaveLength(2);
      expect((insertCalls[0].args[0] as unknown[]).length).toBe(200);
      expect((insertCalls[1].args[0] as unknown[]).length).toBe(1);
    });

    it("throws on insert error in the first chunk and stops further inserts", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      const txns = Array.from(
        { length: 300 },
        (_, i) => ({ id: `t${i}` }) as unknown as TransactionInsert,
      );
      await expect(db.createBatch(txns)).rejects.toEqual({ code: "500" });
      // Only the first chunk should have been attempted.
      const insertCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "insert",
      );
      expect(insertCalls).toHaveLength(1);
    });
  });

  // =========================================================================
  // upsertPlaidTransactions — single-phase
  // =========================================================================

  describe("upsertPlaidTransactions", () => {
    it("returns early without any DB call when empty", async () => {
      await db.upsertPlaidTransactions([]);
      expect(mockSupabaseClient.queryLog).toEqual([]);
    });

    it("calls upsert with exact onConflict key 'plaid_transaction_id'", async () => {
      mockSupabaseClient.setMockResponse(null, null);
      const txns = [
        { plaid_transaction_id: "p1" } as unknown as TransactionInsert,
      ];

      await db.upsertPlaidTransactions(txns);

      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "from",
        args: ["transactions"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "upsert",
        args: [txns, { onConflict: "plaid_transaction_id" }],
      });
    });

    it("throws on upsert error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(
        db.upsertPlaidTransactions([
          { plaid_transaction_id: "p1" } as unknown as TransactionInsert,
        ]),
      ).rejects.toEqual({ code: "500" });
    });
  });

  // =========================================================================
  // deleteByPlaidIds — single-phase
  // =========================================================================

  describe("deleteByPlaidIds", () => {
    it("returns early without any DB call when empty", async () => {
      await db.deleteByPlaidIds([]);
      expect(mockSupabaseClient.queryLog).toEqual([]);
    });

    it("calls delete().in() with the exact plaid_transaction_id column and IDs", async () => {
      mockSupabaseClient.setMockResponse(null, null);
      await db.deleteByPlaidIds(["p1", "p2"]);

      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "from",
        args: ["transactions"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "delete",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "in",
        args: ["plaid_transaction_id", ["p1", "p2"]],
      });
    });

    it("throws on delete error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(db.deleteByPlaidIds(["p1"])).rejects.toEqual({
        code: "500",
      });
    });
  });

  // =========================================================================
  // update — single-phase
  // =========================================================================

  describe("update", () => {
    it("updates and returns the row with full chain", async () => {
      const updated = { id: "t1", notes: "new" };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.update("t1", { notes: "new" });

      expect(result).toEqual(updated);
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "from",
        args: ["transactions"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "update",
        args: [{ notes: "new" }],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["id", "t1"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "single",
        args: [],
      });
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(db.update("t1", { notes: "x" })).rejects.toEqual({
        code: "500",
      });
    });
  });

  // =========================================================================
  // updateHouseholdVisibility — single-phase
  // =========================================================================

  describe("updateHouseholdVisibility", () => {
    it("updates visibility flags and returns the row with full chain", async () => {
      const updated = { id: "t1", is_hidden_from_household: true };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateHouseholdVisibility("t1", {
        is_hidden_from_household: true,
      });

      expect(result).toEqual(updated);
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "from",
        args: ["transactions"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "update",
        args: [{ is_hidden_from_household: true }],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["id", "t1"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "single",
        args: [],
      });
    });

    it("supports shared-to-household flag independently", async () => {
      mockSupabaseClient.setMockResponse({ id: "t1" });
      await db.updateHouseholdVisibility("t1", {
        is_shared_to_household: true,
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "update",
        args: [{ is_shared_to_household: true }],
      });
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(
        db.updateHouseholdVisibility("t1", { is_shared_to_household: true }),
      ).rejects.toEqual({ code: "500" });
    });
  });

  // =========================================================================
  // getByHouseholdFiltered — 'mine' view (multi-phase) ⇒ queryLog assertion
  // =========================================================================

  describe("getByHouseholdFiltered (mine view)", () => {
    it("returns empty when user owns no accounts; only runs the accounts SELECT", async () => {
      // First awaited call: accounts lookup returns []. queueThenResponses
      // feeds the exact shape the thenable destructures.
      queueThenResponses([{ data: [], error: null, count: null }]);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "mine",
      );

      expect(result).toEqual({ transactions: [], total: 0 });
      // Full ordered queryLog for the mine-empty branch. Catches mutations
      // to `.from("accounts")`, `.select("id")`, or either `.eq` arg.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["owner_id", "user-1"] },
      ]);
    });

    it("treats null accounts data as empty (|| [] fallback in mine branch)", async () => {
      // Kills the ArrayDeclaration mutant on `(accounts || [])` at line 232.
      // If the fallback mutated to a non-empty placeholder array, accountIds
      // would be non-empty and the method would proceed to query transactions
      // — but the queryLog only shows the accounts SELECT, proving the
      // fallback produced an empty array and the short-circuit fired.
      queueThenResponses([{ data: null, error: null, count: null }]);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "mine",
      );

      expect(result).toEqual({ transactions: [], total: 0 });
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["owner_id", "user-1"] },
      ]);
    });

    it("throws when accounts query errors", async () => {
      queueThenResponses([
        { data: null, error: { code: "500", message: "acc fail" }, count: null },
      ]);
      await expect(
        db.getByHouseholdFiltered("hh-1", "user-1", "mine"),
      ).rejects.toEqual({ code: "500", message: "acc fail" });
    });

    it("queries transactions filtered by account IDs on happy path (full ordered queryLog)", async () => {
      // Two awaited queries in this branch:
      //   1. SELECT accounts → returns [{id:acc-1},{id:acc-2}]
      //   2. SELECT transactions (thenable) → returns rows + count
      const accounts = [{ id: "acc-1" }, { id: "acc-2" }];
      const txRows = [{ id: "tx-1" }, { id: "tx-2" }];
      queueThenResponses([
        { data: accounts, error: null, count: null },
        { data: txRows, error: null, count: 7 },
      ]);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "mine",
      );

      expect(result).toEqual({ transactions: txRows, total: 7 });

      // Full ordered queryLog — critical because `.from(...)` appears twice
      // (once for "accounts", once for "transactions"), and `.eq("household_id", ...)`
      // is repeated. Non-positional expectQuery would miss single-phase mutants.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: accounts lookup
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["owner_id", "user-1"] },
        // Phase 2: transactions query
        { table: "transactions", method: "from", args: ["transactions"] },
        {
          table: "transactions",
          method: "select",
          args: ["*", { count: "exact" }],
        },
        {
          table: "transactions",
          method: "eq",
          args: ["household_id", "hh-1"],
        },
        {
          table: "transactions",
          method: "in",
          args: ["account_id", ["acc-1", "acc-2"]],
        },
        {
          table: "transactions",
          method: "order",
          args: ["transaction_date", { ascending: false }],
        },
        {
          table: "transactions",
          method: "order",
          args: ["created_at", { ascending: false }],
        },
      ]);
    });

    it("falls back to total=0 when count is null on the transactions query", async () => {
      queueThenResponses([
        { data: [{ id: "acc-1" }], error: null, count: null },
        { data: [{ id: "tx-1" }], error: null, count: null },
      ]);
      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "mine",
      );
      expect(result.total).toBe(0);
    });

    it("returns empty transactions array when tx data is null", async () => {
      queueThenResponses([
        { data: [{ id: "acc-1" }], error: null, count: null },
        { data: null, error: null, count: null },
      ]);
      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "mine",
      );
      expect(result.transactions).toEqual([]);
    });

    it("throws when the transactions query errors (mine branch)", async () => {
      queueThenResponses([
        { data: [{ id: "acc-1" }], error: null, count: null },
        { data: null, error: { code: "500", message: "tx fail" }, count: null },
      ]);
      await expect(
        db.getByHouseholdFiltered("hh-1", "user-1", "mine"),
      ).rejects.toEqual({ code: "500", message: "tx fail" });
    });

    it("applies ALL query options via applyQueryOptions in mine view (custom pagination)", async () => {
      queueThenResponses([
        { data: [{ id: "acc-1" }], error: null, count: null },
        { data: [], error: null, count: 0 },
      ]);

      await db.getByHouseholdFiltered("hh-1", "user-1", "mine", {
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
        search: "coffee",
        amountMin: 100,
        amountMax: 10000,
        limit: 5,
        offset: 10,
        source: "manual",
        accountId: "acc-9",
        category: "Food",
        categoryId: "cat-1",
      });

      // Each filter asserted with explicit table + args to kill mutations in applyQueryOptions.
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "gte",
        args: ["transaction_date", "2026-01-01"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "lte",
        args: ["transaction_date", "2026-01-31"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "or",
        args: ["description.ilike.%coffee%,merchant_name.ilike.%coffee%"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "gte",
        args: ["amount_cents", 100],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "lte",
        args: ["amount_cents", 10000],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "range",
        args: [10, 14],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["source", "manual"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["account_id", "acc-9"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["category", "Food"],
      });
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "eq",
        args: ["category_id", "cat-1"],
      });
    });

    it("skips ALL optional filters in applyQueryOptions when options={} (default pagination applied)", async () => {
      // Kills the ConditionalExpression mutants on each `if (options.X)` guard
      // in applyQueryOptions — if any guard flipped to `if (true)` on an empty
      // options object, the corresponding query method would be invoked with
      // undefined args and show up in the log.
      queueThenResponses([
        { data: [{ id: "acc-1" }], error: null, count: null },
        { data: [], error: null, count: 0 },
      ]);

      await db.getByHouseholdFiltered("hh-1", "user-1", "mine", {});

      // Assert NO filter-specific calls were made on the transactions table.
      const txCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.table === "transactions",
      );
      // No gte/lte/or for optional filters.
      expect(
        txCalls.some(
          (e) =>
            e.method === "gte" &&
            (e.args as unknown[])[0] === "transaction_date",
        ),
      ).toBe(false);
      expect(
        txCalls.some(
          (e) =>
            e.method === "lte" &&
            (e.args as unknown[])[0] === "transaction_date",
        ),
      ).toBe(false);
      expect(
        txCalls.some(
          (e) =>
            e.method === "gte" && (e.args as unknown[])[0] === "amount_cents",
        ),
      ).toBe(false);
      expect(
        txCalls.some(
          (e) =>
            e.method === "lte" && (e.args as unknown[])[0] === "amount_cents",
        ),
      ).toBe(false);
      expect(txCalls.some((e) => e.method === "or")).toBe(false);
      // No eq() calls for optional text filters — only required household_id and `in` for account_id.
      const eqFieldsOnTx = txCalls
        .filter((e) => e.method === "eq")
        .map((e) => (e.args as unknown[])[0]);
      expect(eqFieldsOnTx).toEqual(["household_id"]);

      // Default pagination SHOULD be applied: limit=50, offset=0 → range(0, 49).
      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "range",
        args: [0, 49],
      });
    });
  });

  // =========================================================================
  // getByHouseholdFiltered — 'household' view (multi-phase)
  // =========================================================================

  describe("getByHouseholdFiltered (household view)", () => {
    it("returns empty (short-circuit) when both ours AND mine accounts are empty", async () => {
      queueThenResponses([
        { data: [], error: null, count: null }, // ours → []
        { data: [], error: null, count: null }, // mine → []
      ]);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "household",
      );

      expect(result).toEqual({ transactions: [], total: 0 });

      // Full ordered queryLog: only the two accounts SELECTs, no transactions query.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: ours accounts
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["visibility", "ours"] },
        // Phase 2: mine accounts
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["visibility", "mine"] },
      ]);
    });

    it("throws when ours accounts query errors", async () => {
      queueThenResponses([
        { data: null, error: { code: "500", message: "ours fail" }, count: null },
      ]);
      await expect(
        db.getByHouseholdFiltered("hh-1", "user-1", "household"),
      ).rejects.toEqual({ code: "500", message: "ours fail" });
    });

    it("throws when mine accounts query errors (after ours succeeds)", async () => {
      queueThenResponses([
        { data: [{ id: "o1" }], error: null, count: null },
        { data: null, error: { code: "500", message: "mine fail" }, count: null },
      ]);
      await expect(
        db.getByHouseholdFiltered("hh-1", "user-1", "household"),
      ).rejects.toEqual({ code: "500", message: "mine fail" });
    });

    it("treats null ours-accounts data as empty (|| [] fallback): short-circuits without tx query", async () => {
      // Kills ArrayDeclaration mutants on `(oursAccounts || [])` and
      // `(mineAccounts || [])` — if the fallback were a non-empty array,
      // oursIds/mineIds would be non-empty and the method would proceed
      // to the transactions query. Asserting the full queryLog shows that
      // no transactions query happened, which can only be true if both
      // fallbacks produce empty arrays.
      queueThenResponses([
        { data: null, error: null, count: null },
        { data: null, error: null, count: null },
      ]);
      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "household",
      );
      expect(result).toEqual({ transactions: [], total: 0 });

      // Full log: only the two accounts SELECTs — no `.from("transactions")`
      // and no `.or()`. If `|| []` mutated to a non-empty placeholder array,
      // we'd see a 3rd phase that queries transactions.
      expect(mockSupabaseClient.queryLog).toEqual([
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["visibility", "ours"] },
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["visibility", "mine"] },
      ]);
    });

    it("builds or-conditions with BOTH ours and mine when both exist (full ordered queryLog)", async () => {
      queueThenResponses([
        { data: [{ id: "o1" }, { id: "o2" }], error: null, count: null },
        { data: [{ id: "m1" }], error: null, count: null },
        { data: [{ id: "tx-1" }], error: null, count: 3 },
      ]);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "household",
      );

      expect(result).toEqual({ transactions: [{ id: "tx-1" }], total: 3 });

      // Full ordered queryLog assertion — catches mutations in table names,
      // visibility literals "ours"/"mine", and the OR filter construction.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: ours accounts
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["visibility", "ours"] },
        // Phase 2: mine accounts
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["visibility", "mine"] },
        // Phase 3: transactions
        { table: "transactions", method: "from", args: ["transactions"] },
        {
          table: "transactions",
          method: "select",
          args: ["*", { count: "exact" }],
        },
        {
          table: "transactions",
          method: "eq",
          args: ["household_id", "hh-1"],
        },
        {
          table: "transactions",
          method: "or",
          args: [
            "and(account_id.in.(o1,o2),is_hidden_from_household.eq.false)," +
              "and(account_id.in.(m1),is_shared_to_household.eq.true)",
          ],
        },
        {
          table: "transactions",
          method: "order",
          args: ["transaction_date", { ascending: false }],
        },
        {
          table: "transactions",
          method: "order",
          args: ["created_at", { ascending: false }],
        },
      ]);
    });

    it("builds or with ONLY the ours-condition when mine is empty", async () => {
      // Kills the `if (mineIds.length > 0)` mutant — if the guard flipped to
      // always-true, an empty mine condition would still be appended.
      queueThenResponses([
        { data: [{ id: "o1" }], error: null, count: null }, // ours
        { data: [], error: null, count: null }, // mine empty
        { data: [], error: null, count: 0 },
      ]);

      await db.getByHouseholdFiltered("hh-1", "user-1", "household");

      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "or",
        args: ["and(account_id.in.(o1),is_hidden_from_household.eq.false)"],
      });
    });

    it("builds or with ONLY the mine-condition when ours is empty", async () => {
      // Kills the `if (oursIds.length > 0)` mutant.
      queueThenResponses([
        { data: [], error: null, count: null }, // ours empty
        { data: [{ id: "m1" }], error: null, count: null }, // mine
        { data: [], error: null, count: 0 },
      ]);

      await db.getByHouseholdFiltered("hh-1", "user-1", "household");

      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "or",
        args: ["and(account_id.in.(m1),is_shared_to_household.eq.true)"],
      });
    });

    it("joins multiple mineIds with ',' (not '') in the mine-only or-condition", async () => {
      // Kills the StringLiteral mutant on `mineIds.join(",")` → `mineIds.join("")`.
      // With a single-element mineIds array, any separator yields the same
      // joined string, so the mutant survives. We need ≥2 ids AND ours=[]
      // so the mine-only branch (not both) is exercised — the ours branch is
      // already covered by the "both exist" test above for its own `join(",")`.
      queueThenResponses([
        { data: [], error: null, count: null }, // ours empty
        {
          data: [{ id: "m1" }, { id: "m2" }, { id: "m3" }],
          error: null,
          count: null,
        },
        { data: [], error: null, count: 0 },
      ]);

      await db.getByHouseholdFiltered("hh-1", "user-1", "household");

      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "or",
        args: [
          "and(account_id.in.(m1,m2,m3),is_shared_to_household.eq.true)",
        ],
      });
    });

    it("throws when transactions query errors (household branch)", async () => {
      queueThenResponses([
        { data: [{ id: "o1" }], error: null, count: null },
        { data: [{ id: "m1" }], error: null, count: null },
        {
          data: null,
          error: { code: "500", message: "tx fail" },
          count: null,
        },
      ]);
      await expect(
        db.getByHouseholdFiltered("hh-1", "user-1", "household"),
      ).rejects.toEqual({ code: "500", message: "tx fail" });
    });

    it("returns empty transactions array and total=0 when tx data is null (|| [] and ?? 0 fallbacks)", async () => {
      queueThenResponses([
        { data: [{ id: "o1" }], error: null, count: null },
        { data: [{ id: "m1" }], error: null, count: null },
        { data: null, error: null, count: null },
      ]);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "household",
      );

      expect(result).toEqual({ transactions: [], total: 0 });
    });

    it("applies custom pagination in household view (range(offset, offset+limit-1))", async () => {
      queueThenResponses([
        { data: [{ id: "o1" }], error: null, count: null },
        { data: [{ id: "m1" }], error: null, count: null },
        { data: [], error: null, count: 0 },
      ]);

      await db.getByHouseholdFiltered("hh-1", "user-1", "household", {
        limit: 25,
        offset: 50,
      });

      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "range",
        args: [50, 74],
      });
    });

    it("applies default pagination (range 0..49) in household view when options={}", async () => {
      queueThenResponses([
        { data: [{ id: "o1" }], error: null, count: null },
        { data: [{ id: "m1" }], error: null, count: null },
        { data: [], error: null, count: 0 },
      ]);

      await db.getByHouseholdFiltered("hh-1", "user-1", "household", {});

      mockSupabaseClient.expectQuery({
        table: "transactions",
        method: "range",
        args: [0, 49],
      });
    });
  });
});
