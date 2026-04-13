import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecurringBillsDB } from "@/lib/db/recurring-bills";
import { mockSupabaseClient } from "../../setup";

describe("RecurringBillsDB", () => {
  let db: RecurringBillsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new RecurringBillsDB(mockSupabaseClient as any);
  });

  // =========================================================================
  // getByHousehold
  // =========================================================================

  describe("getByHousehold", () => {
    it("returns bills ordered by next_due_date ascending (nullsFirst: false)", async () => {
      const bills = [
        { id: "b-1", household_id: "hh-1", name: "Netflix", next_due_date: "2026-04-15" },
        { id: "b-2", household_id: "hh-1", name: "Spotify", next_due_date: "2026-04-20" },
      ];
      mockSupabaseClient.setMockResponse(bills);

      const result = await db.getByHousehold("hh-1");

      expect(result).toEqual(bills);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("recurring_bills");
      expect(mockSupabaseClient.select).toHaveBeenCalledWith("*");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("next_due_date", {
        ascending: true,
        nullsFirst: false,
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
  // create
  // =========================================================================

  describe("create", () => {
    it("inserts a bill and returns the new row", async () => {
      const insert = {
        household_id: "hh-1",
        name: "Gym",
        amount_cents: 4999,
        frequency: "monthly",
        next_due_date: "2026-05-01",
      } as any;
      const created = { id: "b-new", ...insert };
      mockSupabaseClient.setMockResponse(created);

      const result = await db.create(insert);

      expect(result).toEqual(created);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("recurring_bills");
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(insert);
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on error", async () => {
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
  // update
  // =========================================================================

  describe("update", () => {
    it("updates fields by id and returns the updated row", async () => {
      const updates = { amount_cents: 5999, user_status: "active" } as any;
      const updated = { id: "b-1", ...updates };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.update("b-1", updates);

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("recurring_bills");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "b-1");
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500", message: "fail" });

      await expect(db.update("b-1", {} as any)).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // upsertFromPlaid
  // =========================================================================

  describe("upsertFromPlaid", () => {
    it("returns early when bills array is empty (no calls)", async () => {
      await db.upsertFromPlaid("hh-1", []);

      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
      expect(mockSupabaseClient.upsert).not.toHaveBeenCalled();
    });

    it("upserts new bills with default shape (no previous_amount_cents) and uses household_id,plaid_stream_id onConflict", async () => {
      // First call: fetch existing -> empty
      // Second call: upsert -> ok
      const thenSpy = vi
        .fn()
        // fetch existing: data=[]
        .mockImplementationOnce((onFulfilled: any) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled)
        )
        // upsert: data=null
        .mockImplementationOnce((onFulfilled: any) =>
          Promise.resolve({ data: null, error: null }).then(onFulfilled)
        );
      (mockSupabaseClient as { then?: unknown }).then = thenSpy;

      const detected = [
        {
          plaid_stream_id: "stream-1",
          account_id: "acc-1",
          merchant_name: "Netflix",
          description: "NETFLIX.COM",
          amount_cents: 1599,
          frequency: "monthly",
          predicted_next_date: "2026-05-01",
          is_active: true,
          status: "MATURE",
          category_primary: "ENTERTAINMENT",
        },
      ];

      await db.upsertFromPlaid("hh-1", detected as any);

      // fetch existing query
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("recurring_bills");
      expect(mockSupabaseClient.select).toHaveBeenCalledWith(
        "id, plaid_stream_id, amount_cents"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("household_id", "hh-1");
      expect(mockSupabaseClient.in).toHaveBeenCalledWith("plaid_stream_id", [
        "stream-1",
      ]);

      // upsert rows
      expect(mockSupabaseClient.upsert).toHaveBeenCalledTimes(1);
      const [rows, opts] = mockSupabaseClient.upsert.mock.calls[0];
      expect(opts).toEqual({ onConflict: "household_id,plaid_stream_id" });
      expect(rows).toEqual([
        {
          household_id: "hh-1",
          plaid_stream_id: "stream-1",
          account_id: "acc-1",
          name: "Netflix",
          description: "NETFLIX.COM",
          amount_cents: 1599,
          frequency: "monthly",
          next_due_date: "2026-05-01",
          is_active: true,
          plaid_status: "MATURE",
          category_primary: "ENTERTAINMENT",
          source: "plaid",
        },
      ]);
      expect(rows[0]).not.toHaveProperty("previous_amount_cents");

      delete (mockSupabaseClient as { then?: unknown }).then;
    });

    it("falls back to description when merchant_name is missing", async () => {
      const thenSpy = vi
        .fn()
        .mockImplementationOnce((onFulfilled: any) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled)
        )
        .mockImplementationOnce((onFulfilled: any) =>
          Promise.resolve({ data: null, error: null }).then(onFulfilled)
        );
      (mockSupabaseClient as { then?: unknown }).then = thenSpy;

      await db.upsertFromPlaid("hh-1", [
        {
          plaid_stream_id: "s-2",
          account_id: "a",
          merchant_name: null,
          description: "UNKNOWN VENDOR",
          amount_cents: 100,
          frequency: "monthly",
          predicted_next_date: "2026-05-01",
          is_active: true,
          status: "MATURE",
          category_primary: null,
        } as any,
      ]);

      const [rows] = mockSupabaseClient.upsert.mock.calls[0];
      expect(rows[0].name).toBe("UNKNOWN VENDOR");

      delete (mockSupabaseClient as { then?: unknown }).then;
    });

    it("sets previous_amount_cents when amount changed on existing bill", async () => {
      const thenSpy = vi
        .fn()
        .mockImplementationOnce((onFulfilled: any) =>
          Promise.resolve({
            data: [
              { id: "b-1", plaid_stream_id: "stream-1", amount_cents: 1599 },
            ],
            error: null,
          }).then(onFulfilled)
        )
        .mockImplementationOnce((onFulfilled: any) =>
          Promise.resolve({ data: null, error: null }).then(onFulfilled)
        );
      (mockSupabaseClient as { then?: unknown }).then = thenSpy;

      await db.upsertFromPlaid("hh-1", [
        {
          plaid_stream_id: "stream-1",
          account_id: "acc-1",
          merchant_name: "Netflix",
          description: "NETFLIX.COM",
          amount_cents: 1799, // changed
          frequency: "monthly",
          predicted_next_date: "2026-05-01",
          is_active: true,
          status: "MATURE",
          category_primary: "ENTERTAINMENT",
        } as any,
      ]);

      const [rows] = mockSupabaseClient.upsert.mock.calls[0];
      expect(rows[0].previous_amount_cents).toBe(1599);
      expect(rows[0].amount_cents).toBe(1799);

      delete (mockSupabaseClient as { then?: unknown }).then;
    });

    it("does not set previous_amount_cents when amount unchanged", async () => {
      const thenSpy = vi
        .fn()
        .mockImplementationOnce((onFulfilled: any) =>
          Promise.resolve({
            data: [
              { id: "b-1", plaid_stream_id: "stream-1", amount_cents: 1599 },
            ],
            error: null,
          }).then(onFulfilled)
        )
        .mockImplementationOnce((onFulfilled: any) =>
          Promise.resolve({ data: null, error: null }).then(onFulfilled)
        );
      (mockSupabaseClient as { then?: unknown }).then = thenSpy;

      await db.upsertFromPlaid("hh-1", [
        {
          plaid_stream_id: "stream-1",
          account_id: "acc-1",
          merchant_name: "Netflix",
          description: "NETFLIX.COM",
          amount_cents: 1599, // unchanged
          frequency: "monthly",
          predicted_next_date: "2026-05-01",
          is_active: true,
          status: "MATURE",
          category_primary: "ENTERTAINMENT",
        } as any,
      ]);

      const [rows] = mockSupabaseClient.upsert.mock.calls[0];
      expect(rows[0]).not.toHaveProperty("previous_amount_cents");

      delete (mockSupabaseClient as { then?: unknown }).then;
    });

    it("throws when fetch existing fails", async () => {
      const thenSpy = vi.fn().mockImplementationOnce((onFulfilled: any) =>
        Promise.resolve({
          data: null,
          error: { code: "500", message: "fetch fail" },
        }).then(onFulfilled)
      );
      (mockSupabaseClient as { then?: unknown }).then = thenSpy;

      await expect(
        db.upsertFromPlaid("hh-1", [
          {
            plaid_stream_id: "s-1",
            account_id: "a",
            merchant_name: "M",
            description: "D",
            amount_cents: 1,
            frequency: "monthly",
            predicted_next_date: "2026-05-01",
            is_active: true,
            status: "MATURE",
            category_primary: null,
          } as any,
        ])
      ).rejects.toEqual({ code: "500", message: "fetch fail" });

      delete (mockSupabaseClient as { then?: unknown }).then;
    });

    it("throws when upsert fails", async () => {
      const thenSpy = vi
        .fn()
        .mockImplementationOnce((onFulfilled: any) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled)
        )
        .mockImplementationOnce((onFulfilled: any) =>
          Promise.resolve({
            data: null,
            error: { code: "23000", message: "upsert fail" },
          }).then(onFulfilled)
        );
      (mockSupabaseClient as { then?: unknown }).then = thenSpy;

      await expect(
        db.upsertFromPlaid("hh-1", [
          {
            plaid_stream_id: "s-1",
            account_id: "a",
            merchant_name: "M",
            description: "D",
            amount_cents: 1,
            frequency: "monthly",
            predicted_next_date: "2026-05-01",
            is_active: true,
            status: "MATURE",
            category_primary: null,
          } as any,
        ])
      ).rejects.toEqual({ code: "23000", message: "upsert fail" });

      delete (mockSupabaseClient as { then?: unknown }).then;
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe("delete", () => {
    it("deletes by id", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.delete("b-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith("recurring_bills");
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "b-1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "500", message: "fail" });

      await expect(db.delete("b-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });
});
