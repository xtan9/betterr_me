import { describe, it, expect, vi, beforeEach } from "vitest";
import { BankConnectionsDB } from "@/lib/db/bank-connections";
import { mockSupabaseClient } from "../../setup";

describe("BankConnectionsDB", () => {
  let db: BankConnectionsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new BankConnectionsDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getByHousehold
  // =========================================================================

  describe("getByHousehold", () => {
    it("returns connections ordered by created_at desc", async () => {
      const conns = [
        { id: "bc-1", household_id: "hh-1", status: "active" },
        { id: "bc-2", household_id: "hh-1", status: "disconnected" },
      ];
      mockSupabaseClient.setMockResponse(conns);

      const result = await db.getByHousehold("hh-1");

      expect(result).toEqual(conns);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("bank_connections");
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
        message: "fail",
      });

      await expect(db.getByHousehold("hh-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // getById
  // =========================================================================

  describe("getById", () => {
    it("returns a connection by id", async () => {
      const conn = { id: "bc-1", status: "active" };
      mockSupabaseClient.setMockResponse(conn);

      const result = await db.getById("bc-1");

      expect(result).toEqual(conn);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("bank_connections");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "bc-1");
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("returns null on PGRST116", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getById("missing");

      expect(result).toBeNull();
    });

    it("throws on other errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.getById("bc-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("inserts and returns the new connection", async () => {
      const inserted = {
        id: "bc-new",
        household_id: "hh-1",
        provider: "plaid",
        status: "active",
      };
      mockSupabaseClient.setMockResponse(inserted);

      const payload = {
        household_id: "hh-1",
        provider: "plaid",
        access_token: "token",
      } as any;

      const result = await db.create(payload);

      expect(result).toEqual(inserted);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("bank_connections");
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(payload);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "23505",
        message: "duplicate",
      });

      await expect(db.create({ household_id: "hh-1" } as any)).rejects.toEqual({
        code: "23505",
        message: "duplicate",
      });
    });
  });

  // =========================================================================
  // updateStatus
  // =========================================================================

  describe("updateStatus", () => {
    it("updates status with provided error info", async () => {
      const updated = {
        id: "bc-1",
        status: "error",
        error_code: "ITEM_LOGIN_REQUIRED",
        error_message: "Re-auth needed",
      };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateStatus(
        "bc-1",
        "error",
        "ITEM_LOGIN_REQUIRED",
        "Re-auth needed"
      );

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("bank_connections");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "error",
        error_code: "ITEM_LOGIN_REQUIRED",
        error_message: "Re-auth needed",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "bc-1");
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("defaults error_code and error_message to null when omitted", async () => {
      mockSupabaseClient.setMockResponse({ id: "bc-1", status: "active" });

      await db.updateStatus("bc-1", "active");

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "active",
        error_code: null,
        error_message: null,
      });
    });

    it("coerces undefined error args to null", async () => {
      mockSupabaseClient.setMockResponse({ id: "bc-1", status: "active" });

      await db.updateStatus("bc-1", "active", undefined, undefined);

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "active",
        error_code: null,
        error_message: null,
      });
    });

    it("preserves explicit null args", async () => {
      mockSupabaseClient.setMockResponse({ id: "bc-1", status: "active" });

      await db.updateStatus("bc-1", "active", null, null);

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "active",
        error_code: null,
        error_message: null,
      });
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.updateStatus("bc-1", "error", "CODE", "msg")
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // updateSyncCursor
  // =========================================================================

  describe("updateSyncCursor", () => {
    it("updates sync_cursor and last_synced_at", async () => {
      const updated = {
        id: "bc-1",
        sync_cursor: "cursor-xyz",
        last_synced_at: "2026-04-12T10:00:00Z",
      };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateSyncCursor(
        "bc-1",
        "cursor-xyz",
        "2026-04-12T10:00:00Z"
      );

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("bank_connections");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        sync_cursor: "cursor-xyz",
        last_synced_at: "2026-04-12T10:00:00Z",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "bc-1");
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.updateSyncCursor("bc-1", "c", "2026-04-12T10:00:00Z")
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // disconnect
  // =========================================================================

  describe("disconnect", () => {
    it("delegates to updateStatus with 'disconnected'", async () => {
      const updated = {
        id: "bc-1",
        status: "disconnected",
        error_code: null,
        error_message: null,
      };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.disconnect("bc-1");

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "disconnected",
        error_code: null,
        error_message: null,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "bc-1");
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.disconnect("bc-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });
});
