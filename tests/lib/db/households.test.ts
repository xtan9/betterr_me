import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HouseholdsDB } from "@/lib/db/households";
import { mockSupabaseClient } from "../../setup";

// Helper: queue an ordered sequence of thenable responses for awaited query
// builders (destructured `{ data, error, count }`). Restores the prototype
// `then` automatically between tests via the top-level afterEach.
function queueThenResponses(
  responses: Array<{ data?: any; error?: any; count?: number | null }>
) {
  const origThen = mockSupabaseClient.then.bind(mockSupabaseClient);
  mockSupabaseClient.then = function (onFulfilled: any, onRejected?: any) {
    const next = responses.shift();
    if (next) return Promise.resolve(next).then(onFulfilled, onRejected);
    return origThen(onFulfilled, onRejected);
  };
}

describe("HouseholdsDB", () => {
  let db: HouseholdsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new HouseholdsDB(mockSupabaseClient as any);
  });

  afterEach(() => {
    delete (mockSupabaseClient as { then?: unknown }).then;
  });

  // =========================================================================
  // resolveHousehold
  // =========================================================================

  describe("resolveHousehold", () => {
    it("returns existing household_id when membership exists", async () => {
      mockSupabaseClient.setMockResponse({ household_id: "hh-existing" });

      const result = await db.resolveHousehold("user-1");

      expect(result).toBe("hh-existing");
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "household_members"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("throws on non-PGRST116 select error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "FATAL", message: "connection failed" },
      });

      await expect(db.resolveHousehold("user-1")).rejects.toEqual({
        code: "FATAL",
        message: "connection failed",
      });
    });

    it("creates household + membership when none exists", async () => {
      // 1. membership lookup -> PGRST116 (not found)
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      // 2. insert household -> returns new id
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      // 3. insert membership succeeds (awaited, not .single)
      queueThenResponses([{ data: null, error: null }]);

      const result = await db.resolveHousehold("user-1");

      expect(result).toBe("hh-new");
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        name: "My Household",
      });
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        household_id: "hh-new",
        user_id: "user-1",
        role: "owner",
      });
    });

    it("throws when household insert fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "insert fail" },
      });

      await expect(db.resolveHousehold("user-1")).rejects.toEqual({
        code: "500",
        message: "insert fail",
      });
    });

    it("recovers from 23505 race: cleans up orphan and returns retry result", async () => {
      // 1. membership lookup -> not found
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      // 2. household insert -> succeeds
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-orphan" },
        error: null,
      });
      // 4. retry membership lookup -> returns winning household_id
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { household_id: "hh-winner" },
        error: null,
      });
      // 3. member insert -> 23505 conflict, then delete orphan (awaited)
      queueThenResponses([
        { data: null, error: { code: "23505" } },
        { data: null, error: null }, // delete orphan household
      ]);

      const result = await db.resolveHousehold("user-1");

      expect(result).toBe("hh-winner");
    });

    it("throws when 23505 retry lookup fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-orphan" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "retry fail" },
      });
      queueThenResponses([
        { data: null, error: { code: "23505" } },
        { data: null, error: null }, // delete orphan
      ]);

      await expect(db.resolveHousehold("user-1")).rejects.toEqual({
        code: "500",
        message: "retry fail",
      });
    });

    it("throws memberError when non-23505 and non-race", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      queueThenResponses([
        { data: null, error: { code: "500", message: "member fail" } },
      ]);

      await expect(db.resolveHousehold("user-1")).rejects.toEqual({
        code: "500",
        message: "member fail",
      });
    });
  });

  // =========================================================================
  // resolveHousehold (module-level wrapper)
  // =========================================================================

  describe("resolveHousehold (wrapper export)", () => {
    it("delegates to HouseholdsDB.resolveHousehold", async () => {
      const { resolveHousehold } = await import("@/lib/db/households");
      mockSupabaseClient.setMockResponse({ household_id: "hh-wrap" });

      const result = await resolveHousehold(
        mockSupabaseClient as any,
        "user-x"
      );

      expect(result).toBe("hh-wrap");
    });
  });

  // =========================================================================
  // getMemberRole
  // =========================================================================

  describe("getMemberRole", () => {
    it("returns role for existing member", async () => {
      mockSupabaseClient.setMockResponse({ role: "owner" });

      const role = await db.getMemberRole("hh-1", "user-1");

      expect(role).toBe("owner");
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "household_members"
      );
    });

    it("returns null when not found (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const role = await db.getMemberRole("hh-1", "user-1");

      expect(role).toBeNull();
    });

    it("throws on other errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "Internal",
      });

      await expect(db.getMemberRole("hh-1", "user-1")).rejects.toEqual({
        code: "500",
        message: "Internal",
      });
    });
  });

  // =========================================================================
  // getMemberCount
  // =========================================================================

  describe("getMemberCount", () => {
    it("returns count", async () => {
      mockSupabaseClient.setMockResponse(null, null, 3);

      const count = await db.getMemberCount("hh-1");

      expect(count).toBe(3);
    });

    it("returns 0 when count is null", async () => {
      mockSupabaseClient.setMockResponse(null, null, null);

      const count = await db.getMemberCount("hh-1");

      expect(count).toBe(0);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      // getMemberCount destructures { count, error } from the thenable
      // When error is set, it should throw
      await expect(db.getMemberCount("hh-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // createInvite
  // =========================================================================

  describe("createInvite", () => {
    it("creates and returns invitation", async () => {
      const mockInvite = {
        id: "inv-1",
        household_id: "hh-1",
        invited_by: "user-1",
        email: "invitee@example.com",
        token: "abc123",
        status: "pending",
        expires_at: "2026-03-08T00:00:00Z",
        created_at: "2026-03-01T00:00:00Z",
      };
      mockSupabaseClient.setMockResponse(mockInvite);

      const result = await db.createInvite(
        "hh-1",
        "user-1",
        "invitee@example.com"
      );

      expect(result).toEqual(mockInvite);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "household_invitations"
      );
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        household_id: "hh-1",
        invited_by: "user-1",
        email: "invitee@example.com",
      });
    });

    it("throws friendly error on duplicate (23505)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "23505" });

      await expect(
        db.createInvite("hh-1", "user-1", "dup@example.com")
      ).rejects.toThrow("An invitation has already been sent to this email");
    });

    it("rethrows non-23505 errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });

      await expect(
        db.createInvite("hh-1", "user-1", "x@example.com")
      ).rejects.toEqual({ code: "500", message: "boom" });
    });
  });

  // =========================================================================
  // getInvitations
  // =========================================================================

  describe("getInvitations", () => {
    it("returns pending invitations", async () => {
      const mockInvites = [
        { id: "inv-1", status: "pending" },
        { id: "inv-2", status: "pending" },
      ];
      mockSupabaseClient.setMockResponse(mockInvites);

      const result = await db.getInvitations("hh-1");

      expect(result).toEqual(mockInvites);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("status", "pending");
    });

    it("returns empty array when no invitations", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getInvitations("hh-1");

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getInvitationByToken
  // =========================================================================

  describe("getInvitationByToken", () => {
    it("returns invitation for valid token", async () => {
      const mockInvite = { id: "inv-1", token: "abc123", status: "pending" };
      mockSupabaseClient.setMockResponse(mockInvite);

      const result = await db.getInvitationByToken("abc123");

      expect(result).toEqual(mockInvite);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("token", "abc123");
    });

    it("returns null when not found (PGRST116)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getInvitationByToken("expired-token");

      expect(result).toBeNull();
    });

    it("throws on other errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(
        db.getInvitationByToken("some-token")
      ).rejects.toEqual({ code: "500", message: "fail" });
    });
  });

  // =========================================================================
  // revokeInvite
  // =========================================================================

  describe("revokeInvite", () => {
    it("revokes invitation", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.revokeInvite("inv-1");

      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "household_invitations"
      );
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "revoked",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "inv-1");
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

      await expect(db.revokeInvite("inv-1")).rejects.toEqual({
        code: "500",
        message: "fail",
      });
    });
  });

  // =========================================================================
  // getMembers
  // =========================================================================

  describe("getMembers", () => {
    it("returns flattened member list with profile fields", async () => {
      const rows = [
        {
          id: "m-1",
          household_id: "hh-1",
          user_id: "u-1",
          role: "owner",
          created_at: "2026-01-01T00:00:00Z",
          profile: {
            email: "a@example.com",
            full_name: "Alice",
            avatar_url: "https://img/a.png",
          },
        },
        {
          id: "m-2",
          household_id: "hh-1",
          user_id: "u-2",
          role: "member",
          created_at: "2026-01-02T00:00:00Z",
          profile: { email: "b@example.com", full_name: null, avatar_url: null },
        },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getMembers("hh-1");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "m-1",
        household_id: "hh-1",
        user_id: "u-1",
        role: "owner",
        created_at: "2026-01-01T00:00:00Z",
        email: "a@example.com",
        full_name: "Alice",
        avatar_url: "https://img/a.png",
      });
      expect(result[1].full_name).toBeNull();
      expect(result[1].avatar_url).toBeNull();
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("household_members");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "household_id",
        "hh-1"
      );
    });

    it("defaults missing profile fields safely", async () => {
      const rows = [
        {
          id: "m-3",
          household_id: "hh-1",
          user_id: "u-3",
          role: "member",
          created_at: "2026-01-03T00:00:00Z",
          profile: null,
        },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getMembers("hh-1");

      expect(result[0].email).toBe("");
      expect(result[0].full_name).toBeNull();
      expect(result[0].avatar_url).toBeNull();
    });

    it("returns empty array when data is null", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getMembers("hh-1");

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "boom",
      });

      await expect(db.getMembers("hh-1")).rejects.toEqual({
        code: "500",
        message: "boom",
      });
    });
  });

  // =========================================================================
  // getPendingInvitesForEmail
  // =========================================================================

  describe("getPendingInvitesForEmail", () => {
    it("returns pending invitations for email using adminClient", async () => {
      const invites = [
        { id: "inv-a", email: "x@example.com", status: "pending" },
        { id: "inv-b", email: "x@example.com", status: "pending" },
      ];
      mockSupabaseClient.setMockResponse(invites);

      const result = await db.getPendingInvitesForEmail(
        "x@example.com",
        mockSupabaseClient as any
      );

      expect(result).toEqual(invites);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        "household_invitations"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "email",
        "x@example.com"
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("status", "pending");
      expect(mockSupabaseClient.gt).toHaveBeenCalledWith(
        "expires_at",
        expect.any(String)
      );
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
    });

    it("returns empty array when no invites", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getPendingInvitesForEmail(
        "none@example.com",
        mockSupabaseClient as any
      );

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "nope",
      });

      await expect(
        db.getPendingInvitesForEmail("x@example.com", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "nope" });
    });
  });

  // =========================================================================
  // acceptInvite
  // =========================================================================

  describe("acceptInvite", () => {
    it("throws when token is invalid/expired (single returns error)", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });

      await expect(
        db.acceptInvite("bad-token", "user-1", mockSupabaseClient as any)
      ).rejects.toThrow("Invalid or expired invitation");
    });

    it("throws when invitation row is null even without error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).rejects.toThrow("Invalid or expired invitation");
    });

    it("enforces MAX_HOUSEHOLD_MEMBERS cap", async () => {
      // 1. invitation lookup -> valid invite
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      // 2. count of target household (destructured await) -> at cap (5)
      queueThenResponses([{ data: null, error: null, count: 5 }]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).rejects.toThrow(/maximum of 5 members/);
    });

    it("propagates target count DB error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      queueThenResponses([
        { data: null, error: { code: "500", message: "count fail" }, count: null },
      ]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "count fail" });
    });

    it("inserts membership when user has no existing household", async () => {
      // 1. invitation lookup
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      // 3. current-membership lookup -> PGRST116
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      // 2. target count (1), 4. insert member (ok), 5. update invitation (ok)
      queueThenResponses([
        { data: null, error: null, count: 1 },
        { data: null, error: null },
        { data: null, error: null },
      ]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "accepted",
      });
    });

    it("throws when current-membership lookup fails with non-PGRST116 error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "mem fail" },
      });
      queueThenResponses([{ data: null, error: null, count: 0 }]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "mem fail" });
    });

    it("moves membership when user is in a multi-member household", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { household_id: "hh-source", role: "member" },
        error: null,
      });
      queueThenResponses([
        { data: null, error: null, count: 2 }, // target count
        { data: null, error: null, count: 3 }, // source count (>1)
        { data: null, error: null }, // update membership
        { data: null, error: null }, // update invitation
      ]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();
    });

    it("throws when source-count query errors", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { household_id: "hh-source", role: "owner" },
        error: null,
      });
      queueThenResponses([
        { data: null, error: null, count: 1 }, // target
        {
          data: null,
          error: { code: "500", message: "src count fail" },
          count: null,
        },
      ]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "src count fail" });
    });

    it("propagates insertError when inserting new membership fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      queueThenResponses([
        { data: null, error: null, count: 0 },
        { data: null, error: { code: "500", message: "insert fail" } },
      ]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "insert fail" });
    });

    it("propagates move-membership error in multi-member branch", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { household_id: "hh-source", role: "member" },
        error: null,
      });
      queueThenResponses([
        { data: null, error: null, count: 2 },
        { data: null, error: null, count: 3 },
        { data: null, error: { code: "500", message: "move fail" } },
      ]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "move fail" });
    });

    it("merges solo household data into target when user is sole owner", async () => {
      // 1. invitation
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      // 3. current membership (solo)
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { household_id: "hh-source", role: "owner" },
        error: null,
      });
      // Full merge sequence of awaited queries in order:
      queueThenResponses([
        { data: null, error: null, count: 1 }, // target count
        { data: null, error: null, count: 1 }, // source count (solo)
        { data: null, error: null }, // accounts update
        { data: null, error: null }, // transactions update
        { data: null, error: null }, // budgets update
        { data: null, error: null }, // savings_goals update
        { data: null, error: null }, // recurring_bills update
        { data: null, error: null }, // manual_assets update
        { data: null, error: null }, // merchant_category_rules update
        { data: null, error: null }, // bank_connections update
        // mergeCategories:
        {
          data: [
            { id: "sc-1", name: "Food" }, // duplicate in target
            { id: "sc-2", name: "Travel" }, // unique to source
          ],
          error: null,
        }, // source categories
        {
          data: [{ id: "tc-1", name: "Food" }],
          error: null,
        }, // target categories
        { data: null, error: null }, // transactions remap (sc-1)
        { data: null, error: null }, // budget_categories remap
        { data: null, error: null }, // merchant_category_rules remap
        { data: null, error: null }, // transaction_splits remap
        { data: null, error: null }, // delete source category sc-1
        { data: null, error: null }, // move sc-2 to target
        // Back in mergeHouseholdData:
        { data: null, error: null }, // net_worth_snapshots delete
        { data: null, error: null }, // household_members update
        { data: null, error: null }, // households delete
        // acceptInvite tail:
        { data: null, error: null }, // invitation update -> accepted
      ]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();
    });

    // Parametrized merge-error tests -- each stops the merge at a different
    // step to hit every "if (error) throw error" guard inside
    // mergeHouseholdData + mergeCategories.
    const mergeBase = () => {
      // 1. invitation
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      // 3. current membership (solo owner)
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { household_id: "hh-source", role: "owner" },
        error: null,
      });
    };
    const err = { code: "500", message: "step fail" };

    it.each([
      ["accounts update", 2],
      ["transactions update", 3],
      ["budgets update", 4],
      ["savings_goals update", 5],
      ["recurring_bills update", 6],
      ["manual_assets update", 7],
      ["merchant_category_rules update", 8],
      ["bank_connections update", 9],
    ])("propagates %s error during merge", async (_name, failIdx) => {
      mergeBase();
      const seq: Array<{ data?: any; error?: any; count?: number | null }> = [
        { data: null, error: null, count: 1 }, // target count (0)
        { data: null, error: null, count: 1 }, // source count (1, solo)
      ];
      // indices 2..9 are the 8 merge steps
      for (let i = 2; i <= 9; i++) {
        seq.push(i === failIdx ? { data: null, error: err } : { data: null, error: null });
        if (i === failIdx) break;
      }
      queueThenResponses(seq);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual(err);
    });

    it("propagates mergeCategories source-fetch error", async () => {
      mergeBase();
      queueThenResponses([
        { data: null, error: null, count: 1 },
        { data: null, error: null, count: 1 },
        { data: null, error: null }, // accounts
        { data: null, error: null }, // txns
        { data: null, error: null }, // budgets
        { data: null, error: null }, // goals
        { data: null, error: null }, // bills
        { data: null, error: null }, // assets
        { data: null, error: null }, // rules
        { data: null, error: null }, // bank
        { data: null, error: err }, // source categories fetch fails
      ]);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual(err);
    });

    it("propagates mergeCategories target-fetch error", async () => {
      mergeBase();
      queueThenResponses([
        { data: null, error: null, count: 1 },
        { data: null, error: null, count: 1 },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: [{ id: "sc-1", name: "Food" }], error: null }, // source categories
        { data: null, error: err }, // target categories fetch fails
      ]);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual(err);
    });

    it("returns early from mergeCategories when source has no categories (and continues merge)", async () => {
      mergeBase();
      queueThenResponses([
        { data: null, error: null, count: 1 },
        { data: null, error: null, count: 1 },
        { data: null, error: null }, // accounts..bank (8)
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: [], error: null }, // source categories empty -> early return
        // continues mergeHouseholdData:
        { data: null, error: null }, // snapshots delete
        { data: null, error: null }, // membership update
        { data: null, error: null }, // households delete
        { data: null, error: null }, // invitation update
      ]);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();
    });

    it.each([
      ["transactions remap", 0],
      ["budget_categories remap", 1],
      ["merchant_category_rules remap", 2],
      ["transaction_splits remap", 3],
      ["delete source category", 4],
    ])("propagates duplicate-category %s error", async (_name, step) => {
      mergeBase();
      const seq: Array<{ data?: any; error?: any; count?: number | null }> = [
        { data: null, error: null, count: 1 },
        { data: null, error: null, count: 1 },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: [{ id: "sc-1", name: "Food" }], error: null }, // source
        { data: [{ id: "tc-1", name: "Food" }], error: null }, // target (match)
      ];
      for (let i = 0; i <= 4; i++) {
        seq.push(i === step ? { data: null, error: err } : { data: null, error: null });
        if (i === step) break;
      }
      queueThenResponses(seq);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual(err);
    });

    it("propagates unique-category move error", async () => {
      mergeBase();
      queueThenResponses([
        { data: null, error: null, count: 1 },
        { data: null, error: null, count: 1 },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: [{ id: "sc-1", name: "Travel" }], error: null }, // source
        { data: [], error: null }, // target (no match)
        { data: null, error: err }, // move unique category fails
      ]);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual(err);
    });

    it.each([
      ["net_worth_snapshots delete", 0],
      ["membership update", 1],
      ["households delete", 2],
    ])("propagates post-merge %s error", async (_name, step) => {
      mergeBase();
      const seq: Array<{ data?: any; error?: any; count?: number | null }> = [
        { data: null, error: null, count: 1 },
        { data: null, error: null, count: 1 },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: [], error: null }, // source empty -> skip category loop
      ];
      for (let i = 0; i <= 2; i++) {
        seq.push(i === step ? { data: null, error: err } : { data: null, error: null });
        if (i === step) break;
      }
      queueThenResponses(seq);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual(err);
    });

    it("throws when invitation update fails at the end", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      queueThenResponses([
        { data: null, error: null, count: 0 }, // target count
        { data: null, error: null }, // insert member ok
        { data: null, error: { code: "500", message: "update fail" } }, // invitation update fails
      ]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "update fail" });
    });
  });

  // =========================================================================
  // removeMember
  // =========================================================================

  describe("removeMember", () => {
    it("creates new household and moves owned data + membership", async () => {
      // 1. create new household -> single()
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      // 3. household owner lookup -> single()
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: "owner-user" },
        error: null,
      });
      queueThenResponses([
        // 2a. select owned accounts
        { data: [{ id: "acct-1" }, { id: "acct-2" }], error: null },
        // 2b. update transactions for those accounts
        { data: null, error: null },
        // 2c. update accounts themselves
        { data: null, error: null },
        // 3a. update private budgets
        { data: null, error: null },
        // 3b. transfer shared budgets to household owner
        { data: null, error: null },
        // 3c. transfer shared goals to household owner
        { data: null, error: null },
        // 4. update private goals
        { data: null, error: null },
        // 5. update bank connections
        { data: null, error: null },
        // 6. update membership
        { data: null, error: null },
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();

      // Member-cap/business guard: ensure we performed the membership update
      // against the original household_id + user_id scope.
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        household_id: "hh-new",
        role: "owner",
      });
    });

    it("skips account move when user owns zero accounts", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: "owner-user" },
        error: null,
      });
      queueThenResponses([
        { data: [], error: null }, // no owned accounts
        { data: null, error: null }, // budgets (private)
        { data: null, error: null }, // shared budgets transfer
        { data: null, error: null }, // shared goals transfer
        { data: null, error: null }, // private goals move
        { data: null, error: null }, // bank connections move
        { data: null, error: null }, // membership update
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();
    });

    it("handles missing household owner gracefully (PGRST116)", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      // owner lookup returns PGRST116 -> householdOwner falsy, skip transfers
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      queueThenResponses([
        { data: null, error: null }, // owned accounts (null treated as none)
        { data: null, error: null }, // private budgets
        // no shared transfers
        { data: null, error: null }, // private goals
        { data: null, error: null }, // bank connections
        { data: null, error: null }, // membership update
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();
    });

    it("throws when create-household fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "create fail" },
      });

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "create fail" });
    });

    it("throws when owned-accounts lookup fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      queueThenResponses([
        { data: null, error: { code: "500", message: "accts fail" } },
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "accts fail" });
    });

    it("throws on non-PGRST116 owner-lookup error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      // owner lookup returns real error
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "owner fail" },
      });
      queueThenResponses([
        { data: [], error: null }, // no owned accounts
        { data: null, error: null }, // private budgets update
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "owner fail" });
    });

    const rmErr = { code: "500", message: "rm fail" };

    it("throws when transactions-for-owned-accounts update fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      queueThenResponses([
        { data: [{ id: "a-1" }], error: null }, // owned accounts
        { data: null, error: rmErr }, // txn update fails
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual(rmErr);
    });

    it("throws when moving accounts themselves fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      queueThenResponses([
        { data: [{ id: "a-1" }], error: null },
        { data: null, error: null }, // txns ok
        { data: null, error: rmErr }, // accounts update fails
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual(rmErr);
    });

    it("throws when private budgets update fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      queueThenResponses([
        { data: [], error: null },
        { data: null, error: rmErr }, // budgets fails
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual(rmErr);
    });

    it("throws when transfer-shared-budgets fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: "owner-user" },
        error: null,
      });
      queueThenResponses([
        { data: [], error: null },
        { data: null, error: null }, // private budgets
        { data: null, error: rmErr }, // shared budget transfer fails
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual(rmErr);
    });

    it("throws when transfer-shared-goals fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: "owner-user" },
        error: null,
      });
      queueThenResponses([
        { data: [], error: null },
        { data: null, error: null }, // private budgets
        { data: null, error: null }, // shared budgets
        { data: null, error: rmErr }, // shared goals fails
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual(rmErr);
    });

    it("throws when private goals update fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: "owner-user" },
        error: null,
      });
      queueThenResponses([
        { data: [], error: null },
        { data: null, error: null }, // private budgets
        { data: null, error: null }, // shared budgets
        { data: null, error: null }, // shared goals
        { data: null, error: rmErr }, // private goals fails
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual(rmErr);
    });

    it("throws when bank connections move fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: "owner-user" },
        error: null,
      });
      queueThenResponses([
        { data: [], error: null },
        { data: null, error: null }, // private budgets
        { data: null, error: null }, // shared budgets
        { data: null, error: null }, // shared goals
        { data: null, error: null }, // private goals
        { data: null, error: rmErr }, // bank fails
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual(rmErr);
    });

    it("throws when final membership update fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: "owner-user" },
        error: null,
      });
      queueThenResponses([
        { data: [], error: null }, // no owned accounts
        { data: null, error: null }, // private budgets
        { data: null, error: null }, // shared budgets
        { data: null, error: null }, // shared goals
        { data: null, error: null }, // private goals
        { data: null, error: null }, // bank connections
        { data: null, error: { code: "500", message: "member update fail" } },
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "member update fail" });
    });
  });
});
