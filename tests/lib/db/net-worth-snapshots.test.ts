import { describe, it, expect, vi, beforeEach } from "vitest";
import { NetWorthSnapshotsDB } from "@/lib/db/net-worth-snapshots";
import { mockSupabaseClient } from "../../setup";

describe("NetWorthSnapshotsDB", () => {
  let db: NetWorthSnapshotsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new NetWorthSnapshotsDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // upsert
  // =========================================================================

  describe("upsert", () => {
    it("upserts a snapshot with correct payload and conflict target", async () => {
      const snapshot = {
        id: "s-1",
        household_id: "hh-1",
        snapshot_date: "2026-04-12",
        total_cents: 100,
        assets_cents: 150,
        liabilities_cents: 50,
      };
      mockSupabaseClient.setMockResponse(snapshot);

      const result = await db.upsert("hh-1", "2026-04-12", 100, 150, 50);

      expect(result).toEqual(snapshot);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "net_worth_snapshots"
      );
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
        {
          household_id: "hh-1",
          snapshot_date: "2026-04-12",
          total_cents: 100,
          assets_cents: 150,
          liabilities_cents: 50,
        },
        { onConflict: "household_id,snapshot_date" }
      );
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.upsert("hh-1", "2026-04-12", 0, 0, 0)
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // getHistory
  // =========================================================================

  describe("getHistory", () => {
    it("returns snapshots within date range ordered ASC", async () => {
      const snapshots = [
        { id: "s-1", snapshot_date: "2026-04-01", total_cents: 100 },
        { id: "s-2", snapshot_date: "2026-04-05", total_cents: 200 },
      ];
      mockSupabaseClient.setMockResponse(snapshots);

      const result = await db.getHistory("hh-1", "2026-04-01", "2026-04-30");

      expect(result).toEqual(snapshots);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "net_worth_snapshots"
      );
      expect(mockSupabaseClient.select).toHaveBeenCalledWith("*");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith(
        "snapshot_date",
        "2026-04-01"
      );
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith(
        "snapshot_date",
        "2026-04-30"
      );
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("snapshot_date", {
        ascending: true,
      });
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getHistory("hh-1", "2026-01-01", "2026-12-31");

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "oops",
      });

      await expect(
        db.getHistory("hh-1", "2026-01-01", "2026-12-31")
      ).rejects.toEqual({ code: "500", message: "oops" });
    });
  });

  // =========================================================================
  // getLatest
  // =========================================================================

  describe("getLatest", () => {
    it("returns most recent snapshot", async () => {
      const snap = {
        id: "s-latest",
        household_id: "hh-1",
        snapshot_date: "2026-04-10",
        total_cents: 999,
      };
      mockSupabaseClient.setMockResponse(snap);

      const result = await db.getLatest("hh-1");

      expect(result).toEqual(snap);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "net_worth_snapshots"
      );
      expect(mockSupabaseClient.select).toHaveBeenCalledWith("*");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("snapshot_date", {
        ascending: false,
      });
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(1);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("returns null when not found (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getLatest("hh-1");

      expect(result).toBeNull();
    });

    it("throws on non-PGRST116 error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "bad",
      });

      await expect(db.getLatest("hh-1")).rejects.toEqual({
        code: "500",
        message: "bad",
      });
    });
  });
});
