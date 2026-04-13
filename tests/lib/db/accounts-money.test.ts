import { describe, it, expect, vi, beforeEach } from "vitest";
import { MoneyAccountsDB } from "@/lib/db/accounts-money";
import { mockSupabaseClient } from "../../setup";

describe("MoneyAccountsDB", () => {
  let db: MoneyAccountsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new MoneyAccountsDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getByHousehold
  // =========================================================================

  describe("getByHousehold", () => {
    it("returns accounts for household ordered correctly", async () => {
      const mockAccounts = [
        { id: "acc-1", household_id: "hh-1", name: "Checking" },
        { id: "acc-2", household_id: "hh-1", name: "Savings" },
      ];
      mockSupabaseClient.setMockResponse(mockAccounts);

      const result = await db.getByHousehold("hh-1");

      expect(result).toEqual(mockAccounts);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("accounts");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith(
        "bank_connection_id",
        { ascending: true, nullsFirst: false }
      );
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("name", {
        ascending: true,
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getByHousehold("hh-1");

      expect(result).toEqual([]);
    });

    it("throws on database error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "db error",
      });

      await expect(db.getByHousehold("hh-1")).rejects.toEqual({
        code: "500",
        message: "db error",
      });
    });
  });

  // =========================================================================
  // getByBankConnection
  // =========================================================================

  describe("getByBankConnection", () => {
    it("returns accounts for bank connection", async () => {
      const mockAccounts = [{ id: "acc-1", bank_connection_id: "bc-1" }];
      mockSupabaseClient.setMockResponse(mockAccounts);

      const result = await db.getByBankConnection("bc-1");

      expect(result).toEqual(mockAccounts);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("accounts");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "bank_connection_id",
        "bc-1"
      );
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("name", {
        ascending: true,
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getByBankConnection("bc-1");

      expect(result).toEqual([]);
    });

    it("throws on database error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });

      await expect(db.getByBankConnection("bc-1")).rejects.toEqual({
        code: "500",
        message: "boom",
      });
    });
  });

  // =========================================================================
  // getById
  // =========================================================================

  describe("getById", () => {
    it("returns account by id", async () => {
      const mockAccount = { id: "acc-1", name: "Checking" };
      mockSupabaseClient.setMockResponse(mockAccount);

      const result = await db.getById("acc-1");

      expect(result).toEqual(mockAccount);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("accounts");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "acc-1");
    });

    it("returns null when not found (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getById("missing");

      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.getById("acc-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("creates and returns account", async () => {
      const insertData = {
        household_id: "hh-1",
        bank_connection_id: null,
        owner_id: null,
        visibility: "ours" as const,
        shared_since: null,
        name: "New Account",
        account_type: "checking" as const,
        balance_cents: 1000,
        currency: "USD",
        is_hidden: false,
        plaid_account_id: null,
        official_name: null,
        mask: null,
        subtype: null,
      };
      const mockResult = { id: "acc-new", ...insertData };
      mockSupabaseClient.setMockResponse(mockResult);

      const result = await db.create(insertData as any);

      expect(result).toEqual(mockResult);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("accounts");
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(insertData);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "23505",
        message: "dup",
      });

      await expect(db.create({ name: "x" } as any)).rejects.toEqual({
        code: "23505",
        message: "dup",
      });
    });
  });

  // =========================================================================
  // updateBalance
  // =========================================================================

  describe("updateBalance", () => {
    it("updates balance and returns account", async () => {
      const mockResult = { id: "acc-1", balance_cents: 5000 };
      mockSupabaseClient.setMockResponse(mockResult);

      const result = await db.updateBalance("acc-1", 5000);

      expect(result).toEqual(mockResult);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("accounts");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        balance_cents: 5000,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "acc-1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.updateBalance("acc-1", 100)).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // getCashAccount
  // =========================================================================

  describe("getCashAccount", () => {
    it("returns cash account when it exists", async () => {
      const mockCash = {
        id: "acc-cash",
        name: "Cash",
        bank_connection_id: null,
      };
      mockSupabaseClient.setMockResponse(mockCash);

      const result = await db.getCashAccount("hh-1");

      expect(result).toEqual(mockCash);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("accounts");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      expect(mockSupabaseClient.is).toHaveBeenCalledWith(
        "bank_connection_id",
        null
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("name", "Cash");
    });

    it("returns null when not found (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getCashAccount("hh-1");

      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.getCashAccount("hh-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // findOrCreateCash
  // =========================================================================

  describe("findOrCreateCash", () => {
    it("returns existing cash account when found", async () => {
      const mockCash = { id: "acc-cash", name: "Cash" };
      mockSupabaseClient.setMockResponse(mockCash);

      const result = await db.findOrCreateCash("hh-1");

      expect(result).toEqual(mockCash);
      // Should not call insert when existing is returned
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    it("creates cash account when none exists", async () => {
      const createdCash = {
        id: "acc-new-cash",
        household_id: "hh-1",
        name: "Cash",
        bank_connection_id: null,
        owner_id: null,
        visibility: "ours",
        balance_cents: 0,
        currency: "USD",
      };
      // First call (getCashAccount) returns PGRST116, second call (create) returns the new account
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
        .mockResolvedValueOnce({ data: createdCash, error: null });

      const result = await db.findOrCreateCash("hh-1");

      expect(result).toEqual(createdCash);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          household_id: "hh-1",
          bank_connection_id: null,
          name: "Cash",
          visibility: "ours",
          balance_cents: 0,
          currency: "USD",
          account_type: "other",
        })
      );
    });
  });

  // =========================================================================
  // getByHouseholdFiltered
  // =========================================================================

  describe("getByHouseholdFiltered", () => {
    it("filters by owner_id when view is 'mine'", async () => {
      const mockAccounts = [{ id: "acc-1", owner_id: "user-1" }];
      mockSupabaseClient.setMockResponse(mockAccounts);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "mine"
      );

      expect(result).toEqual(mockAccounts);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("accounts");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("owner_id", "user-1");
      expect(mockSupabaseClient.in).not.toHaveBeenCalled();
    });

    it("filters by visibility in/ours/hidden when view is 'household'", async () => {
      const mockAccounts = [{ id: "acc-1", visibility: "ours" }];
      mockSupabaseClient.setMockResponse(mockAccounts);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "household"
      );

      expect(result).toEqual(mockAccounts);
      expect(mockSupabaseClient.in).toHaveBeenCalledWith("visibility", [
        "ours",
        "hidden",
      ]);
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "mine"
      );

      expect(result).toEqual([]);
    });

    it("throws on database error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.getByHouseholdFiltered("hh-1", "user-1", "mine")
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // updateVisibility
  // =========================================================================

  describe("updateVisibility", () => {
    it("transitions mine -> ours: sets shared_since and bulk-hides transactions", async () => {
      const current = { id: "acc-1", visibility: "mine" };
      const updated = { id: "acc-1", visibility: "ours" };
      // 1) getById -> returns current
      // 2) transactions update (awaited thenable, no .single) — skip
      // 3) accounts update .single() -> updated
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: current, error: null })
        .mockResolvedValueOnce({ data: updated, error: null });

      const result = await db.updateVisibility("acc-1", "ours", "hh-1");

      expect(result).toEqual(updated);
      // Transactions bulk-hide should have been called
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("transactions");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        is_hidden_from_household: true,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("account_id", "acc-1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      // Accounts update should include shared_since
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: "ours",
          shared_since: expect.any(String),
        })
      );
    });

    it("transitions ours -> mine: clears shared_since", async () => {
      const current = {
        id: "acc-1",
        visibility: "ours",
        shared_since: "2026-01-01",
      };
      const updated = { id: "acc-1", visibility: "mine" };
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: current, error: null })
        .mockResolvedValueOnce({ data: updated, error: null });

      const result = await db.updateVisibility("acc-1", "mine", "hh-1");

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        visibility: "mine",
        shared_since: null,
      });
    });

    it("transitions hidden -> mine: clears shared_since", async () => {
      const current = { id: "acc-1", visibility: "hidden" };
      const updated = { id: "acc-1", visibility: "mine" };
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: current, error: null })
        .mockResolvedValueOnce({ data: updated, error: null });

      const result = await db.updateVisibility("acc-1", "mine", "hh-1");

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        visibility: "mine",
        shared_since: null,
      });
    });

    it("other transitions (ours -> hidden): only visibility updated", async () => {
      const current = { id: "acc-1", visibility: "ours" };
      const updated = { id: "acc-1", visibility: "hidden" };
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: current, error: null })
        .mockResolvedValueOnce({ data: updated, error: null });

      const result = await db.updateVisibility("acc-1", "hidden", "hh-1");

      expect(result).toEqual(updated);
      // shared_since should NOT be in update payload
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        visibility: "hidden",
      });
    });

    it("throws when account not found", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });

      await expect(
        db.updateVisibility("missing", "ours", "hh-1")
      ).rejects.toThrow("Account not found");
    });

    it("throws on update error", async () => {
      const current = { id: "acc-1", visibility: "mine" };
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: current, error: null })
        // transactions bulk-hide is awaited as thenable (not single), so the next single() is the final update
        .mockResolvedValueOnce({
          data: null,
          error: { code: "500", message: "update failed" },
        });

      await expect(
        db.updateVisibility("acc-1", "ours", "hh-1")
      ).rejects.toEqual({ code: "500", message: "update failed" });
    });
  });
});
