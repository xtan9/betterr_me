import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransactionsDB, escapeIlike } from "@/lib/db/transactions";
import { mockSupabaseClient } from "../../setup";

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
    // Note: function does NOT escape backslashes, only % and _
    expect(escapeIlike("\\%")).toBe("\\\\%");
  });
});

describe("TransactionsDB", () => {
  let db: TransactionsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new TransactionsDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getByHousehold
  // =========================================================================

  describe("getByHousehold", () => {
    it("returns transactions and count on happy path", async () => {
      const rows = [{ id: "t1" }, { id: "t2" }];
      mockSupabaseClient.setMockResponse(rows, null, 2);

      const result = await db.getByHousehold("hh-1");

      expect(result).toEqual({ transactions: rows, total: 2 });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("transactions");
      expect(mockSupabaseClient.select).toHaveBeenCalledWith("*", {
        count: "exact",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "household_id",
        "hh-1"
      );
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("transaction_date", {
        ascending: false,
      });
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      // default pagination range 0..49
      expect(mockSupabaseClient.range).toHaveBeenCalledWith(0, 49);
    });

    it("returns empty array and total=0 when data null", async () => {
      mockSupabaseClient.setMockResponse(null, null, null);
      const result = await db.getByHousehold("hh-1");
      expect(result).toEqual({ transactions: [], total: 0 });
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

    it("applies accountId filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { accountId: "acc-1" });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("account_id", "acc-1");
    });

    it("applies source filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { source: "plaid" });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("source", "plaid");
    });

    it("applies dateFrom filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { dateFrom: "2026-01-01" });
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith(
        "transaction_date",
        "2026-01-01"
      );
    });

    it("applies dateTo filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { dateTo: "2026-01-31" });
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith(
        "transaction_date",
        "2026-01-31"
      );
    });

    it("applies category filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { category: "Food" });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("category", "Food");
    });

    it("applies categoryId filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { categoryId: "cat-1" });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("category_id", "cat-1");
    });

    it("applies search filter with escaped characters", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { search: "50% off_deal" });
      expect(mockSupabaseClient.or).toHaveBeenCalledWith(
        "description.ilike.%50\\% off\\_deal%,merchant_name.ilike.%50\\% off\\_deal%"
      );
    });

    it("applies amountMin filter including 0", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { amountMin: 0 });
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith("amount_cents", 0);
    });

    it("applies amountMax filter", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { amountMax: 5000 });
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith("amount_cents", 5000);
    });

    it("applies custom limit and offset pagination", async () => {
      mockSupabaseClient.setMockResponse([], null, 0);
      await db.getByHousehold("hh-1", { limit: 10, offset: 20 });
      expect(mockSupabaseClient.range).toHaveBeenCalledWith(20, 29);
    });
  });

  // =========================================================================
  // getById
  // =========================================================================

  describe("getById", () => {
    it("returns transaction on happy path", async () => {
      const row = { id: "t1", amount_cents: 100 };
      mockSupabaseClient.setMockResponse(row);
      const result = await db.getById("t1");
      expect(result).toEqual(row);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("transactions");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "t1");
    });

    it("returns null on PGRST116 not-found", async () => {
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
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("creates and returns the inserted transaction", async () => {
      const inserted = { id: "t1", amount_cents: 200 };
      mockSupabaseClient.setMockResponse(inserted);
      const data = { household_id: "hh-1", amount_cents: 200 } as any;

      const result = await db.create(data);

      expect(result).toEqual(inserted);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(data);
      expect(mockSupabaseClient.select).toHaveBeenCalled();
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "23505" });
      await expect(db.create({} as any)).rejects.toEqual({ code: "23505" });
    });
  });

  // =========================================================================
  // createBatch
  // =========================================================================

  describe("createBatch", () => {
    it("returns 0 without calling insert when input is empty", async () => {
      const result = await db.createBatch([]);
      expect(result).toBe(0);
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it("inserts a single chunk when length < 200", async () => {
      mockSupabaseClient.setMockResponse(null, null);
      const txns = Array.from({ length: 5 }, (_, i) => ({ id: `t${i}` }) as any);
      const result = await db.createBatch(txns);
      expect(result).toBe(5);
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(1);
    });

    it("inserts in multiple chunks of 200", async () => {
      mockSupabaseClient.setMockResponse(null, null);
      const txns = Array.from({ length: 450 }, (_, i) => ({ id: `t${i}` }) as any);
      const result = await db.createBatch(txns);
      expect(result).toBe(450);
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(3); // 200+200+50
    });

    it("throws on insert error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(
        db.createBatch([{ id: "t1" } as any])
      ).rejects.toEqual({ code: "500" });
    });
  });

  // =========================================================================
  // upsertPlaidTransactions
  // =========================================================================

  describe("upsertPlaidTransactions", () => {
    it("returns early without calling upsert when empty", async () => {
      await db.upsertPlaidTransactions([]);
      expect(mockSupabaseClient.upsert).not.toHaveBeenCalled();
    });

    it("calls upsert with onConflict on plaid_transaction_id", async () => {
      mockSupabaseClient.setMockResponse(null, null);
      const txns = [{ plaid_transaction_id: "p1" } as any];
      await db.upsertPlaidTransactions(txns);
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(txns, {
        onConflict: "plaid_transaction_id",
      });
    });

    it("throws on upsert error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(
        db.upsertPlaidTransactions([{ plaid_transaction_id: "p1" } as any])
      ).rejects.toEqual({ code: "500" });
    });
  });

  // =========================================================================
  // deleteByPlaidIds
  // =========================================================================

  describe("deleteByPlaidIds", () => {
    it("returns early without calling delete when empty", async () => {
      await db.deleteByPlaidIds([]);
      expect(mockSupabaseClient.delete).not.toHaveBeenCalled();
    });

    it("calls delete().in() with plaid IDs", async () => {
      mockSupabaseClient.setMockResponse(null, null);
      await db.deleteByPlaidIds(["p1", "p2"]);
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.in).toHaveBeenCalledWith(
        "plaid_transaction_id",
        ["p1", "p2"]
      );
    });

    it("throws on delete error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(db.deleteByPlaidIds(["p1"])).rejects.toEqual({ code: "500" });
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe("update", () => {
    it("updates and returns the row", async () => {
      const updated = { id: "t1", notes: "new" };
      mockSupabaseClient.setMockResponse(updated);
      const result = await db.update("t1", { notes: "new" });
      expect(result).toEqual(updated);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ notes: "new" });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "t1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(db.update("t1", { notes: "x" })).rejects.toEqual({
        code: "500",
      });
    });
  });

  // =========================================================================
  // updateHouseholdVisibility
  // =========================================================================

  describe("updateHouseholdVisibility", () => {
    it("updates visibility flags and returns the row", async () => {
      const updated = { id: "t1", is_hidden_from_household: true };
      mockSupabaseClient.setMockResponse(updated);
      const result = await db.updateHouseholdVisibility("t1", {
        is_hidden_from_household: true,
      });
      expect(result).toEqual(updated);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        is_hidden_from_household: true,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "t1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(
        db.updateHouseholdVisibility("t1", { is_shared_to_household: true })
      ).rejects.toEqual({ code: "500" });
    });
  });

  // =========================================================================
  // getByHouseholdFiltered — 'mine' view
  // =========================================================================

  describe("getByHouseholdFiltered (mine view)", () => {
    it("returns empty when user owns no accounts", async () => {
      mockSupabaseClient.setMockResponse([], null, null);
      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "mine"
      );
      expect(result).toEqual({ transactions: [], total: 0 });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("accounts");
    });

    it("throws when accounts query errors", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(
        db.getByHouseholdFiltered("hh-1", "user-1", "mine")
      ).rejects.toEqual({ code: "500" });
    });

    it("queries transactions filtered by account IDs on happy path", async () => {
      // First call: accounts query -> returns 2 accounts
      // Second call (thenable): transactions -> returns 1 row with count 1
      mockSupabaseClient.setMockResponse(
        [{ id: "acc-1" }, { id: "acc-2" }],
        null,
        null
      );
      // The thenable returns { data, error, count } based on mockData/mockError/mockCount.
      // After the first await in mine branch, both queries use the same mock state,
      // so data=[acc-1, acc-2] will also be returned for the tx query.
      const result = await db.getByHouseholdFiltered("hh-1", "user-1", "mine");

      expect(mockSupabaseClient.in).toHaveBeenCalledWith("account_id", [
        "acc-1",
        "acc-2",
      ]);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "household_id",
        "hh-1"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("owner_id", "user-1");
      // applyQueryOptions short-circuits when options is undefined, so no range()
      expect(mockSupabaseClient.range).not.toHaveBeenCalled();
      expect(result.transactions).toEqual([
        { id: "acc-1" },
        { id: "acc-2" },
      ]);
    });

    it("applies query options via applyQueryOptions in mine view", async () => {
      mockSupabaseClient.setMockResponse([{ id: "acc-1" }], null, null);
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

      expect(mockSupabaseClient.gte).toHaveBeenCalledWith(
        "transaction_date",
        "2026-01-01"
      );
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith(
        "transaction_date",
        "2026-01-31"
      );
      expect(mockSupabaseClient.or).toHaveBeenCalledWith(
        "description.ilike.%coffee%,merchant_name.ilike.%coffee%"
      );
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith("amount_cents", 100);
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith(
        "amount_cents",
        10000
      );
      expect(mockSupabaseClient.range).toHaveBeenCalledWith(10, 14);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("source", "manual");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("account_id", "acc-9");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("category", "Food");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "category_id",
        "cat-1"
      );
    });
  });

  // =========================================================================
  // getByHouseholdFiltered — 'household' view
  // =========================================================================

  describe("getByHouseholdFiltered (household view)", () => {
    it("returns empty when no ours and no mine accounts exist", async () => {
      // Both account queries return [] -> orConditions empty -> short-circuit
      mockSupabaseClient.setMockResponse([], null, null);
      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "household"
      );
      expect(result).toEqual({ transactions: [], total: 0 });
      // We never got to the tx query's .or() for this case
      expect(mockSupabaseClient.or).not.toHaveBeenCalled();
    });

    it("throws when ours accounts query errors", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500" });
      await expect(
        db.getByHouseholdFiltered("hh-1", "user-1", "household")
      ).rejects.toEqual({ code: "500" });
    });

    it("builds or-conditions and queries transactions when accounts exist", async () => {
      // Both account queries will see the same shared mock state, returning the same
      // array for ours and mine. Both branches contribute to orConditions.
      mockSupabaseClient.setMockResponse(
        [{ id: "a1" }, { id: "a2" }],
        null,
        null
      );

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "household"
      );

      expect(mockSupabaseClient.or).toHaveBeenCalledWith(
        "and(account_id.in.(a1,a2),is_hidden_from_household.eq.false)," +
          "and(account_id.in.(a1,a2),is_shared_to_household.eq.true)"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "household_id",
        "hh-1"
      );
      // applyQueryOptions short-circuits when options is undefined
      expect(mockSupabaseClient.range).not.toHaveBeenCalled();
      expect(result.transactions).toEqual([{ id: "a1" }, { id: "a2" }]);
    });

    it("applies query options in household view", async () => {
      mockSupabaseClient.setMockResponse([{ id: "a1" }], null, null);
      await db.getByHouseholdFiltered("hh-1", "user-1", "household", {
        limit: 25,
        offset: 50,
      });
      expect(mockSupabaseClient.range).toHaveBeenCalledWith(50, 74);
    });
  });
});
