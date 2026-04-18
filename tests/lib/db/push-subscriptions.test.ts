import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PushSubscriptionsDB,
  pushSubscriptionsDB,
} from "@/lib/db/push-subscriptions";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PushSubscription,
  PushSubscriptionInsert,
} from "@/lib/db/types";

const USER_ID = "user-123";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";

function makeSubscription(
  over: Partial<PushSubscription> = {},
): PushSubscription {
  return {
    id: "sub-123",
    user_id: USER_ID,
    endpoint: ENDPOINT,
    p256dh:
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWM8=",
    auth: "tBHItJI5svbpC7iq8Q==",
    user_agent: "Mozilla/5.0",
    created_at: "2026-03-25T10:00:00Z",
    ...over,
  };
}

describe("PushSubscriptionsDB", () => {
  let db: PushSubscriptionsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new PushSubscriptionsDB(
      mockSupabaseClient as unknown as SupabaseClient,
    );
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // ─── getSubscriptions ─────────────────────────────────────────────────────
  describe("getSubscriptions", () => {
    it("returns subscriptions ordered by created_at desc, full query chain", async () => {
      const rows = [
        makeSubscription({ id: "s-2", created_at: "2026-03-26T10:00:00Z" }),
        makeSubscription({ id: "s-1", created_at: "2026-03-25T10:00:00Z" }),
      ];
      queueThenResponses([{ data: rows, error: null }]);

      const result = await db.getSubscriptions(USER_ID);

      expect(result).toEqual(rows);

      // Full chain — asserting every call kills any single-position mutant.
      // `ascending: false` is the classic StrykerJS target (→ true flips).
      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "push_subscriptions",
          method: "from",
          args: ["push_subscriptions"],
        },
        {
          table: "push_subscriptions",
          method: "select",
          args: ["*"],
        },
        {
          table: "push_subscriptions",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "push_subscriptions",
          method: "order",
          args: ["created_at", { ascending: false }],
        },
      ]);
    });

    it("returns empty array when data is null", async () => {
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.getSubscriptions(USER_ID);

      expect(result).toEqual([]);
    });

    it("throws on database error", async () => {
      const err = { message: "DB error" };
      queueThenResponses([{ data: null, error: err }]);

      await expect(db.getSubscriptions(USER_ID)).rejects.toEqual(err);
    });
  });

  // ─── upsertSubscription ───────────────────────────────────────────────────
  describe("upsertSubscription", () => {
    const subscriptionInput: Omit<PushSubscriptionInsert, "user_id"> = {
      endpoint: ENDPOINT,
      p256dh:
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWM8=",
      auth: "tBHItJI5svbpC7iq8Q==",
      user_agent: "Mozilla/5.0",
    };

    it("upserts with user_id merged in and onConflict='user_id,endpoint'", async () => {
      const expected = makeSubscription();
      mockSupabaseClient.setMockResponse(expected);

      const result = await db.upsertSubscription(USER_ID, subscriptionInput);

      expect(result).toEqual(expected);

      // Assert the exact upsert payload + conflict opts. Source uses
      // `{ ...subscription, user_id: userId }` — a mutant that swaps the
      // spread order would clobber user_id; asserting user_id === USER_ID
      // in the emitted row catches it.
      mockSupabaseClient.expectQuery({
        table: "push_subscriptions",
        method: "from",
        args: ["push_subscriptions"],
      });
      mockSupabaseClient.expectQuery({
        table: "push_subscriptions",
        method: "upsert",
        args: [
          { ...subscriptionInput, user_id: USER_ID },
          { onConflict: "user_id,endpoint" },
        ],
      });
      mockSupabaseClient.expectQuery({
        table: "push_subscriptions",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "push_subscriptions",
        method: "single",
        args: [],
      });
    });

    it("throws on upsert error", async () => {
      const err = { message: "Upsert error" };
      mockSupabaseClient.setMockResponse(null, err);

      await expect(
        db.upsertSubscription(USER_ID, {
          endpoint: "https://example.com",
          p256dh: "key",
          auth: "auth",
          user_agent: null,
        }),
      ).rejects.toEqual(err);
    });
  });

  // ─── deleteSubscription ───────────────────────────────────────────────────
  describe("deleteSubscription", () => {
    it("deletes by (user_id, endpoint) with full query chain", async () => {
      queueThenResponses([{ data: null, error: null }]);

      await db.deleteSubscription(USER_ID, ENDPOINT);

      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "push_subscriptions",
          method: "from",
          args: ["push_subscriptions"],
        },
        { table: "push_subscriptions", method: "delete", args: [] },
        {
          table: "push_subscriptions",
          method: "eq",
          args: ["user_id", USER_ID],
        },
        {
          table: "push_subscriptions",
          method: "eq",
          args: ["endpoint", ENDPOINT],
        },
      ]);
    });

    it("throws on delete error", async () => {
      const err = { message: "Delete error" };
      queueThenResponses([{ data: null, error: err }]);

      await expect(
        db.deleteSubscription(USER_ID, "https://example.com"),
      ).rejects.toEqual(err);
    });
  });

  // ─── deleteAllSubscriptions ───────────────────────────────────────────────
  describe("deleteAllSubscriptions", () => {
    it("deletes all rows matching user_id with full query chain", async () => {
      queueThenResponses([{ data: null, error: null }]);

      await db.deleteAllSubscriptions(USER_ID);

      expect(mockSupabaseClient.queryLog).toEqual([
        {
          table: "push_subscriptions",
          method: "from",
          args: ["push_subscriptions"],
        },
        { table: "push_subscriptions", method: "delete", args: [] },
        {
          table: "push_subscriptions",
          method: "eq",
          args: ["user_id", USER_ID],
        },
      ]);

      // Prove NO endpoint filter is added — a mutation that adds an extra
      // `.eq('endpoint', ...)` here would dangerously scope the delete.
      const endpointCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "eq" && e.args[0] === "endpoint",
      );
      expect(endpointCalls).toHaveLength(0);
    });

    it("throws on delete error", async () => {
      const err = { message: "Delete error" };
      queueThenResponses([{ data: null, error: err }]);

      await expect(db.deleteAllSubscriptions(USER_ID)).rejects.toEqual(err);
    });
  });

  // ─── module-level singleton ───────────────────────────────────────────────
  describe("pushSubscriptionsDB singleton", () => {
    it("exports a PushSubscriptionsDB instance bound to the browser client", () => {
      expect(pushSubscriptionsDB).toBeInstanceOf(PushSubscriptionsDB);
    });
  });
});
