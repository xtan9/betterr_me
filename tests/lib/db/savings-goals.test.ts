import { describe, it, expect, vi, beforeEach } from "vitest";
import { SavingsGoalsDB } from "@/lib/db/savings-goals";
import { mockSupabaseClient } from "../../setup";

describe("SavingsGoalsDB", () => {
  let db: SavingsGoalsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new SavingsGoalsDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getByHousehold
  // =========================================================================

  describe("getByHousehold", () => {
    it("returns goals ordered by created_at desc", async () => {
      const goals = [
        { id: "g-1", household_id: "hh-1", target_cents: 100000 },
        { id: "g-2", household_id: "hh-1", target_cents: 200000 },
      ];
      mockSupabaseClient.setMockResponse(goals);

      const result = await db.getByHousehold("hh-1");

      expect(result).toEqual(goals);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("savings_goals");
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

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500", message: "fail" });

      await expect(db.getByHousehold("hh-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // getByHouseholdFiltered
  // =========================================================================

  describe("getByHouseholdFiltered", () => {
    it("filters by owner_id and is_shared=false when view='mine'", async () => {
      const goals = [{ id: "g-1", owner_id: "user-1", is_shared: false }];
      mockSupabaseClient.setMockResponse(goals);

      const result = await db.getByHouseholdFiltered("hh-1", "user-1", "mine");

      expect(result).toEqual(goals);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("savings_goals");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("owner_id", "user-1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_shared", false);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
    });

    it("filters by is_shared=true when view='household'", async () => {
      const goals = [{ id: "g-2", is_shared: true }];
      mockSupabaseClient.setMockResponse(goals);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "household" as any
      );

      expect(result).toEqual(goals);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_shared", true);
      // must NOT add owner_id filter in household view
      const calls = mockSupabaseClient.eq.mock.calls.map((c) => c[0]);
      expect(calls).not.toContain("owner_id");
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getByHouseholdFiltered(
        "hh-1",
        "user-1",
        "mine" as any
      );

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500", message: "fail" });

      await expect(
        db.getByHouseholdFiltered("hh-1", "user-1", "mine" as any)
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("inserts a goal and returns the new row", async () => {
      const insert = {
        household_id: "hh-1",
        owner_id: "user-1",
        name: "Vacation",
        target_cents: 500000,
      } as any;
      const created = { id: "g-new", ...insert };
      mockSupabaseClient.setMockResponse(created);

      const result = await db.create(insert);

      expect(result).toEqual(created);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("savings_goals");
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(insert);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500", message: "fail" });

      await expect(db.create({} as any)).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe("update", () => {
    it("updates by id and returns the updated row", async () => {
      const updates = { target_cents: 600000 } as any;
      const updated = { id: "g-1", ...updates };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.update("g-1", updates);

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("savings_goals");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "g-1");
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500", message: "fail" });

      await expect(db.update("g-1", {} as any)).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe("delete", () => {
    it("deletes by id from savings_goals", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.delete("g-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("savings_goals");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "g-1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500", message: "fail" });

      await expect(db.delete("g-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // addContribution
  // =========================================================================

  describe("addContribution", () => {
    it("inserts contribution with note and invokes RPC to increment goal", async () => {
      const contribution = {
        id: "c-1",
        goal_id: "g-1",
        amount_cents: 5000,
        note: "bonus",
      };
      // .single() call returns the contribution
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: contribution,
        error: null,
      });
      // rpc returns ok
      mockSupabaseClient.rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });

      const result = await db.addContribution("g-1", 5000, "bonus");

      expect(result).toEqual(contribution);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("goal_contributions");
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        goal_id: "g-1",
        amount_cents: 5000,
        note: "bonus",
      });
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        "increment_goal_current_cents",
        { p_goal_id: "g-1", p_amount_cents: 5000 }
      );
    });

    it("defaults note to null when omitted", async () => {
      const contribution = { id: "c-2", goal_id: "g-1", amount_cents: 100, note: null };
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: contribution,
        error: null,
      });
      mockSupabaseClient.rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: null });

      const result = await db.addContribution("g-1", 100);

      expect(result).toEqual(contribution);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        goal_id: "g-1",
        amount_cents: 100,
        note: null,
      });
    });

    it("throws when contribution insert fails and does not call RPC", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "insert fail" },
      });
      const rpcSpy = vi.fn();
      mockSupabaseClient.rpc = rpcSpy;

      await expect(db.addContribution("g-1", 100)).rejects.toEqual({
        code: "500",
        message: "insert fail",
      });
      expect(rpcSpy).not.toHaveBeenCalled();
    });

    it("throws when RPC increment fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "c-1", goal_id: "g-1", amount_cents: 100, note: null },
        error: null,
      });
      mockSupabaseClient.rpc = vi.fn().mockResolvedValueOnce({
        data: null,
        error: { code: "P0001", message: "rpc fail" },
      });

      await expect(db.addContribution("g-1", 100)).rejects.toEqual({
        code: "P0001",
        message: "rpc fail",
      });
    });
  });

  // =========================================================================
  // getContributions
  // =========================================================================

  describe("getContributions", () => {
    it("returns contributions ordered by contributed_at desc", async () => {
      const contribs = [
        { id: "c-1", goal_id: "g-1", amount_cents: 100 },
        { id: "c-2", goal_id: "g-1", amount_cents: 200 },
      ];
      mockSupabaseClient.setMockResponse(contribs);

      const result = await db.getContributions("g-1");

      expect(result).toEqual(contribs);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("goal_contributions");
      expect(mockSupabaseClient.select).toHaveBeenCalledWith("*");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("goal_id", "g-1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("contributed_at", {
        ascending: false,
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getContributions("g-1");

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500", message: "fail" });

      await expect(db.getContributions("g-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });
});
