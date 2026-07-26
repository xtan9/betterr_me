import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HouseholdsDB } from "@/lib/db/households";
import { mockSupabaseClient } from "../../setup";
import {
  queueThenResponses,
  restoreMockSupabaseThen,
} from "../../helpers/mock-supabase";

const FROZEN_NOW = "2026-04-17T12:00:00.000Z";

describe("HouseholdsDB", () => {
  let db: HouseholdsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    // Restore default single/maybeSingle impl. `vi.clearAllMocks()` clears
    // call history but doesn't drain queued `mockResolvedValueOnce` values —
    // those can leak across tests. We explicitly reinstall a working impl.
    const restoreSingle = (method: "single" | "maybeSingle") => {
      const fn = mockSupabaseClient[method] as any;
      fn.mockReset(); // clears queued one-time values + implementation
      fn.mockImplementation(() => {
        const self = mockSupabaseClient as any;
        self.queryLog.push({
          table: self.currentTable ?? null,
          method,
          args: [],
        });
        return Promise.resolve({
          data: self.mockData,
          error: self.mockError,
        });
      });
    };
    restoreSingle("single");
    restoreSingle("maybeSingle");
    db = new HouseholdsDB(mockSupabaseClient as any);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // =========================================================================
  // resolveHousehold
  // =========================================================================

  describe("resolveHousehold", () => {
    it("returns existing household_id when membership exists", async () => {
      mockSupabaseClient.setMockResponse({ household_id: "hh-existing" });

      const result = await db.resolveHousehold("user-1");

      expect(result).toBe("hh-existing");
      // Full SELECT chain asserted via expectQuery (single-phase).
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "from",
        args: ["household_members"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "select",
        args: ["household_id"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "eq",
        args: ["user_id", "user-1"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "single",
        args: [],
      });
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

    it("creates household + membership and logs full ordered chain when none exists", async () => {
      // 1. membership lookup -> PGRST116 (not found)
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      // 2. household insert and 3. membership insert both succeed.
      queueThenResponses([{ data: null, error: null }, { data: null, error: null }]);

      const result = await db.resolveHousehold("user-1");

      expect(result).toEqual(expect.any(String));

      // Full-log assertion — critical here because .from("household_members")
      // and .eq("user_id", userId) appear multiple times across phases, and
      // expectQuery() would match *any* occurrence, missing single-position mutations.
      // NOTE: `.single()` calls mocked via `mockResolvedValueOnce` bypass the
      // record() impl, so they don't appear in the queryLog. We still assert
      // every non-terminal chain call; terminals are covered by side effects
      // (the test would fail if `.single()` wasn't awaited with the right data).
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: SELECT membership (PGRST116)
        { table: "household_members", method: "from", args: ["household_members"] },
        { table: "household_members", method: "select", args: ["household_id"] },
        { table: "household_members", method: "eq", args: ["user_id", "user-1"] },
        // Phase 2: INSERT household
        { table: "households", method: "from", args: ["households"] },
        {
          table: "households",
          method: "insert",
          args: [{ id: expect.any(String), name: "My Household" }],
        },
        // Phase 3: INSERT membership
        { table: "household_members", method: "from", args: ["household_members"] },
        {
          table: "household_members",
          method: "insert",
          args: [
            { household_id: expect.any(String), user_id: "user-1", role: "owner" },
          ],
        },
      ]);
    });

    it("throws when household insert fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      queueThenResponses([{ data: null, error: { code: "500", message: "insert fail" } }]);

      await expect(db.resolveHousehold("user-1")).rejects.toEqual({
        code: "500",
        message: "insert fail",
      });
    });

    it("recovers from 23505 race: cleans up orphan household, retries lookup, returns winner", async () => {
      // 1. membership lookup -> not found
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      // 3. retry membership lookup -> returns winning household_id
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { household_id: "hh-winner" },
        error: null,
      });
      // 3. member insert -> 23505 conflict, then delete orphan (awaited)
      queueThenResponses([
        { data: null, error: null }, // insert household
        { data: null, error: { code: "23505" } },
        { data: null, error: null }, // delete orphan household
      ]);

      const result = await db.resolveHousehold("user-1");

      expect(result).toBe("hh-winner");

      // Assert the orphan cleanup + retry-lookup phases use the exact args
      // source uses — these are duplicated across phases so we need the full log.
      // `.single()` calls via mockResolvedValueOnce don't record — see note above.
      expect(mockSupabaseClient.queryLog).toEqual([
        // Phase 1: SELECT (PGRST116)
        { table: "household_members", method: "from", args: ["household_members"] },
        { table: "household_members", method: "select", args: ["household_id"] },
        { table: "household_members", method: "eq", args: ["user_id", "user-1"] },
        // Phase 2: INSERT households
        { table: "households", method: "from", args: ["households"] },
        { table: "households", method: "insert", args: [{ id: expect.any(String), name: "My Household" }] },
        // Phase 3: INSERT household_members (23505 race)
        { table: "household_members", method: "from", args: ["household_members"] },
        {
          table: "household_members",
          method: "insert",
          args: [
            { household_id: expect.any(String), user_id: "user-1", role: "owner" },
          ],
        },
        // Cleanup orphan households row
        { table: "households", method: "from", args: ["households"] },
        { table: "households", method: "delete", args: [] },
        { table: "households", method: "eq", args: ["id", expect.any(String)] },
        // Retry SELECT membership
        { table: "household_members", method: "from", args: ["household_members"] },
        { table: "household_members", method: "select", args: ["household_id"] },
        { table: "household_members", method: "eq", args: ["user_id", "user-1"] },
      ]);
    });

    it("23505 branch: falls through to memberError throw when retry returns null row (no error)", async () => {
      // If the retry lookup succeeds but returns no row (retry === null),
      // source must fall through to `throw memberError`. A mutant that flips
      // `if (retry)` to `if (true)` would attempt `return retry.household_id`
      // on a null object and throw a TypeError. Asserting the exact original
      // memberError kills that mutant.
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      // Retry lookup succeeds but returns no data (neither row nor error).
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      queueThenResponses([
        { data: null, error: null }, // insert household
        { data: null, error: { code: "23505" } },
        { data: null, error: null }, // delete orphan
      ]);

      await expect(db.resolveHousehold("user-1")).rejects.toEqual({
        code: "23505",
      });
    });

    it("throws when 23505 retry lookup fails", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "retry fail" },
      });
      queueThenResponses([
        { data: null, error: null }, // insert household
        { data: null, error: { code: "23505" } },
        { data: null, error: null }, // delete orphan
      ]);

      await expect(db.resolveHousehold("user-1")).rejects.toEqual({
        code: "500",
        message: "retry fail",
      });
    });

    it("throws memberError when non-23505 and non-race (does NOT enter orphan-cleanup branch)", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      // Poison a 3rd single() — if the mutant incorrectly flipped the
      // `if (memberError.code === "23505")` guard to `true`, it would enter
      // the orphan-cleanup path and hit this 3rd single(). Source would then
      // throw the POISONED retryError instead of memberError. Our assertion
      // on "member fail" message kills that mutant.
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "POISONED", message: "branch should not run" },
      });
      queueThenResponses([
        { data: null, error: { code: "500", message: "member fail" } },
        { data: null, error: null }, // orphan delete — only consumed by mutant
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
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "from",
        args: ["household_members"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "eq",
        args: ["user_id", "user-x"],
      });
    });
  });

  // =========================================================================
  // getMemberRole
  // =========================================================================

  describe("getMemberRole", () => {
    it("returns role for existing member with full chain", async () => {
      mockSupabaseClient.setMockResponse({ role: "owner" });

      const role = await db.getMemberRole("hh-1", "user-1");

      expect(role).toBe("owner");
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "from",
        args: ["household_members"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "select",
        args: ["role"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "eq",
        args: ["household_id", "hh-1"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "eq",
        args: ["user_id", "user-1"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "single",
        args: [],
      });
    });

    it("returns 'member' role", async () => {
      mockSupabaseClient.setMockResponse({ role: "member" });
      const role = await db.getMemberRole("hh-1", "user-1");
      expect(role).toBe("member");
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
    it("returns count with full chain asserted", async () => {
      mockSupabaseClient.setMockResponse(null, null, 3);

      const count = await db.getMemberCount("hh-1");

      expect(count).toBe(3);
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "from",
        args: ["household_members"],
      });
      // head:true + count:"exact" + select("*") — specific args kill ObjectLiteral/BooleanLiteral mutants
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "select",
        args: ["*", { count: "exact", head: true }],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "eq",
        args: ["household_id", "hh-1"],
      });
    });

    it("returns 0 when count is null (?? 0 fallback)", async () => {
      mockSupabaseClient.setMockResponse(null, null, null);

      const count = await db.getMemberCount("hh-1");

      expect(count).toBe(0);
    });

    it("throws on error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "fail",
      });

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
    it("creates and returns invitation with full insert chain", async () => {
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
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "from",
        args: ["household_invitations"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "insert",
        args: [
          {
            household_id: "hh-1",
            invited_by: "user-1",
            email: "invitee@example.com",
          },
        ],
      });
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "single",
        args: [],
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
    it("returns pending invitations with full chain", async () => {
      const mockInvites = [
        { id: "inv-1", status: "pending" },
        { id: "inv-2", status: "pending" },
      ];
      mockSupabaseClient.setMockResponse(mockInvites);

      const result = await db.getInvitations("hh-1");

      expect(result).toEqual(mockInvites);
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "from",
        args: ["household_invitations"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "eq",
        args: ["household_id", "hh-1"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "eq",
        args: ["status", "pending"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "order",
        args: ["created_at", { ascending: false }],
      });
    });

    it("returns empty array when no invitations (|| [] fallback)", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getInvitations("hh-1");

      expect(result).toEqual([]);
    });

    it("throws on DB error", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "500",
        message: "list fail",
      });

      await expect(db.getInvitations("hh-1")).rejects.toEqual({
        code: "500",
        message: "list fail",
      });
    });
  });

  // =========================================================================
  // getInvitationByToken
  // =========================================================================

  describe("getInvitationByToken", () => {
    it("returns invitation for valid token with full chain", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(FROZEN_NOW));
      try {
        const mockInvite = { id: "inv-1", token: "abc123", status: "pending" };
        mockSupabaseClient.setMockResponse(mockInvite);

        const result = await db.getInvitationByToken("abc123");

        expect(result).toEqual(mockInvite);
        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "from",
          args: ["household_invitations"],
        });
        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "select",
          args: ["*"],
        });
        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "eq",
          args: ["token", "abc123"],
        });
        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "eq",
          args: ["status", "pending"],
        });
        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "gt",
          args: ["expires_at", FROZEN_NOW],
        });
      } finally {
        vi.useRealTimers();
      }
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
    it("revokes invitation with full chain", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.revokeInvite("inv-1");

      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "from",
        args: ["household_invitations"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "update",
        args: [{ status: "revoked" }],
      });
      mockSupabaseClient.expectQuery({
        table: "household_invitations",
        method: "eq",
        args: ["id", "inv-1"],
      });
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
    it("returns flattened member list with profile fields and asserts full chain", async () => {
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
          profile: {
            email: "b@example.com",
            full_name: null,
            avatar_url: null,
          },
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
      expect(result[1]).toEqual({
        id: "m-2",
        household_id: "hh-1",
        user_id: "u-2",
        role: "member",
        created_at: "2026-01-02T00:00:00Z",
        email: "b@example.com",
        full_name: null,
        avatar_url: null,
      });

      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "from",
        args: ["household_members"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "select",
        args: ["*, profile:profiles(email, full_name, avatar_url)"],
      });
      mockSupabaseClient.expectQuery({
        table: "household_members",
        method: "eq",
        args: ["household_id", "hh-1"],
      });
    });

    it("defaults missing profile fields safely (profile = null branch)", async () => {
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

    it("defaults missing profile.email to empty string when profile present but email missing", async () => {
      // Kills the || "" fallback mutant (ObjectLiteral / LogicalOperator)
      const rows = [
        {
          id: "m-4",
          household_id: "hh-1",
          user_id: "u-4",
          role: "member",
          created_at: "2026-01-04T00:00:00Z",
          profile: { email: "", full_name: null, avatar_url: null },
        },
      ];
      mockSupabaseClient.setMockResponse(rows);

      const result = await db.getMembers("hh-1");

      expect(result[0].email).toBe("");
    });

    it("returns empty array when data is null (|| [] fallback)", async () => {
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
    it("returns pending invitations with full chain and frozen time", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(FROZEN_NOW));
      try {
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

        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "from",
          args: ["household_invitations"],
        });
        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "select",
          args: ["*"],
        });
        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "eq",
          args: ["email", "x@example.com"],
        });
        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "eq",
          args: ["status", "pending"],
        });
        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "gt",
          args: ["expires_at", FROZEN_NOW],
        });
        mockSupabaseClient.expectQuery({
          table: "household_invitations",
          method: "order",
          args: ["created_at", { ascending: false }],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns empty array when no invites (|| [] fallback)", async () => {
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

    it("performs full invitation lookup chain including frozen gt(expires_at, now)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(FROZEN_NOW));
      try {
        // Invite lookup returns invalid => throws early after the SELECT.
        mockSupabaseClient.single.mockResolvedValueOnce({
          data: null,
          error: { code: "PGRST116" },
        });

        await expect(
          db.acceptInvite("tok-lookup", "user-1", mockSupabaseClient as any)
        ).rejects.toThrow("Invalid or expired invitation");

        // Lock in the exact shape of the invitation lookup chain.
        // (`.single()` bypassed via mockResolvedValueOnce, so not in log.)
        expect(mockSupabaseClient.queryLog).toEqual([
          {
            table: "household_invitations",
            method: "from",
            args: ["household_invitations"],
          },
          {
            table: "household_invitations",
            method: "select",
            args: ["*"],
          },
          {
            table: "household_invitations",
            method: "eq",
            args: ["token", "tok-lookup"],
          },
          {
            table: "household_invitations",
            method: "eq",
            args: ["status", "pending"],
          },
          {
            table: "household_invitations",
            method: "gt",
            args: ["expires_at", FROZEN_NOW],
          },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("enforces MAX_HOUSEHOLD_MEMBERS cap when count = 5", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      queueThenResponses([{ data: null, error: null, count: 5 }]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).rejects.toThrow("Household has reached the maximum of 5 members");
    });

    it("enforces cap boundary (count > 5 still rejects)", async () => {
      // Kills `>=` → `>` mutation by proving 5 rejects. And `>=` → `==` mutation
      // needs count=6 to also reject. Test both boundaries.
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      queueThenResponses([{ data: null, error: null, count: 6 }]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).rejects.toThrow("Household has reached the maximum of 5 members");
    });

    it("allows join when count = 4 (just below cap)", async () => {
      // Kills `>=` → `>=` off-by-one mutations by proving 4 passes.
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      // No existing membership -> PGRST116
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      queueThenResponses([
        { data: null, error: null, count: 4 },
        { data: null, error: null }, // insert member
        { data: null, error: null }, // update invitation
      ]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();
    });

    it("propagates target count DB error", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
      queueThenResponses([
        {
          data: null,
          error: { code: "500", message: "count fail" },
          count: null,
        },
      ]);

      await expect(
        db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual({ code: "500", message: "count fail" });
    });

    it("inserts membership when user has no existing household (full ordered chain)", async () => {
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
      queueThenResponses([
        { data: null, error: null, count: 1 }, // target count
        { data: null, error: null }, // insert member
        { data: null, error: null }, // update invitation
      ]);

      vi.useFakeTimers();
      vi.setSystemTime(new Date(FROZEN_NOW));
      try {
        await expect(
          db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
        ).resolves.toBeUndefined();

        // Full log — covers every repeated .from()/.eq() in the no-existing-household path.
        expect(mockSupabaseClient.queryLog).toEqual([
          // 1. Invitation SELECT
          { table: "household_invitations", method: "from", args: ["household_invitations"] },
          { table: "household_invitations", method: "select", args: ["*"] },
          { table: "household_invitations", method: "eq", args: ["token", "token-1"] },
          { table: "household_invitations", method: "eq", args: ["status", "pending"] },
          { table: "household_invitations", method: "gt", args: ["expires_at", FROZEN_NOW] },
          // 2. Target count
          { table: "household_members", method: "from", args: ["household_members"] },
          { table: "household_members", method: "select", args: ["*", { count: "exact", head: true }] },
          { table: "household_members", method: "eq", args: ["household_id", "hh-target"] },
          // 3. Current membership SELECT
          { table: "household_members", method: "from", args: ["household_members"] },
          { table: "household_members", method: "select", args: ["household_id, role"] },
          { table: "household_members", method: "eq", args: ["user_id", "user-1"] },
          // 4. INSERT new membership
          { table: "household_members", method: "from", args: ["household_members"] },
          {
            table: "household_members",
            method: "insert",
            args: [
              {
                household_id: "hh-target",
                user_id: "user-1",
                role: "member",
              },
            ],
          },
          // 5. Invitation update -> accepted
          { table: "household_invitations", method: "from", args: ["household_invitations"] },
          { table: "household_invitations", method: "update", args: [{ status: "accepted" }] },
          { table: "household_invitations", method: "eq", args: ["id", "inv-1"] },
        ]);
      } finally {
        vi.useRealTimers();
      }
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

    it("moves membership when user is in a multi-member household (full chain)", async () => {
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

      vi.useFakeTimers();
      vi.setSystemTime(new Date(FROZEN_NOW));
      try {
        await expect(
          db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
        ).resolves.toBeUndefined();

        // Full log for the multi-member move path — kills repeated-arg mutants.
        expect(mockSupabaseClient.queryLog).toEqual([
          // 1. Invitation SELECT
          { table: "household_invitations", method: "from", args: ["household_invitations"] },
          { table: "household_invitations", method: "select", args: ["*"] },
          { table: "household_invitations", method: "eq", args: ["token", "token-1"] },
          { table: "household_invitations", method: "eq", args: ["status", "pending"] },
          { table: "household_invitations", method: "gt", args: ["expires_at", FROZEN_NOW] },
          // 2. Target count
          { table: "household_members", method: "from", args: ["household_members"] },
          { table: "household_members", method: "select", args: ["*", { count: "exact", head: true }] },
          { table: "household_members", method: "eq", args: ["household_id", "hh-target"] },
          // 3. Current membership SELECT
          { table: "household_members", method: "from", args: ["household_members"] },
          { table: "household_members", method: "select", args: ["household_id, role"] },
          { table: "household_members", method: "eq", args: ["user_id", "user-1"] },
          // 4. Source count
          { table: "household_members", method: "from", args: ["household_members"] },
          { table: "household_members", method: "select", args: ["*", { count: "exact", head: true }] },
          { table: "household_members", method: "eq", args: ["household_id", "hh-source"] },
          // 5. Move membership UPDATE
          { table: "household_members", method: "from", args: ["household_members"] },
          {
            table: "household_members",
            method: "update",
            args: [{ household_id: "hh-target", role: "member" }],
          },
          { table: "household_members", method: "eq", args: ["household_id", "hh-source"] },
          { table: "household_members", method: "eq", args: ["user_id", "user-1"] },
          // 6. Invitation update -> accepted
          { table: "household_invitations", method: "from", args: ["household_invitations"] },
          { table: "household_invitations", method: "update", args: [{ status: "accepted" }] },
          { table: "household_invitations", method: "eq", args: ["id", "inv-1"] },
        ]);
      } finally {
        vi.useRealTimers();
      }
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

    it("merges solo household data into target when user is sole owner (full chain)", async () => {
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

      vi.useFakeTimers();
      vi.setSystemTime(new Date(FROZEN_NOW));
      try {
        await expect(
          db.acceptInvite("token-1", "user-1", mockSupabaseClient as any)
        ).resolves.toBeUndefined();

        // Full ordered log of the entire merge path. Every repeated .from(),
        // .eq(), object-literal payload is locked in.
        expect(mockSupabaseClient.queryLog).toEqual([
          // 1. Invitation SELECT
          { table: "household_invitations", method: "from", args: ["household_invitations"] },
          { table: "household_invitations", method: "select", args: ["*"] },
          { table: "household_invitations", method: "eq", args: ["token", "token-1"] },
          { table: "household_invitations", method: "eq", args: ["status", "pending"] },
          { table: "household_invitations", method: "gt", args: ["expires_at", FROZEN_NOW] },
          // 2. Target count
          { table: "household_members", method: "from", args: ["household_members"] },
          { table: "household_members", method: "select", args: ["*", { count: "exact", head: true }] },
          { table: "household_members", method: "eq", args: ["household_id", "hh-target"] },
          // 3. Current membership
          { table: "household_members", method: "from", args: ["household_members"] },
          { table: "household_members", method: "select", args: ["household_id, role"] },
          { table: "household_members", method: "eq", args: ["user_id", "user-1"] },
          // 4. Source count
          { table: "household_members", method: "from", args: ["household_members"] },
          { table: "household_members", method: "select", args: ["*", { count: "exact", head: true }] },
          { table: "household_members", method: "eq", args: ["household_id", "hh-source"] },
          // accounts
          { table: "accounts", method: "from", args: ["accounts"] },
          {
            table: "accounts",
            method: "update",
            args: [{ household_id: "hh-target", visibility: "mine" }],
          },
          { table: "accounts", method: "eq", args: ["household_id", "hh-source"] },
          // transactions
          { table: "transactions", method: "from", args: ["transactions"] },
          { table: "transactions", method: "update", args: [{ household_id: "hh-target" }] },
          { table: "transactions", method: "eq", args: ["household_id", "hh-source"] },
          // budgets
          { table: "budgets", method: "from", args: ["budgets"] },
          {
            table: "budgets",
            method: "update",
            args: [{ household_id: "hh-target", is_shared: false }],
          },
          { table: "budgets", method: "eq", args: ["household_id", "hh-source"] },
          // savings_goals
          { table: "savings_goals", method: "from", args: ["savings_goals"] },
          {
            table: "savings_goals",
            method: "update",
            args: [{ household_id: "hh-target", is_shared: false }],
          },
          { table: "savings_goals", method: "eq", args: ["household_id", "hh-source"] },
          // recurring_bills
          { table: "recurring_bills", method: "from", args: ["recurring_bills"] },
          { table: "recurring_bills", method: "update", args: [{ household_id: "hh-target" }] },
          { table: "recurring_bills", method: "eq", args: ["household_id", "hh-source"] },
          // manual_assets
          { table: "manual_assets", method: "from", args: ["manual_assets"] },
          { table: "manual_assets", method: "update", args: [{ household_id: "hh-target" }] },
          { table: "manual_assets", method: "eq", args: ["household_id", "hh-source"] },
          // merchant_category_rules
          { table: "merchant_category_rules", method: "from", args: ["merchant_category_rules"] },
          { table: "merchant_category_rules", method: "update", args: [{ household_id: "hh-target" }] },
          { table: "merchant_category_rules", method: "eq", args: ["household_id", "hh-source"] },
          // bank_connections
          { table: "bank_connections", method: "from", args: ["bank_connections"] },
          { table: "bank_connections", method: "update", args: [{ household_id: "hh-target" }] },
          { table: "bank_connections", method: "eq", args: ["household_id", "hh-source"] },
          // mergeCategories: source SELECT
          { table: "transaction_categories", method: "from", args: ["transaction_categories"] },
          { table: "transaction_categories", method: "select", args: ["id, name"] },
          { table: "transaction_categories", method: "eq", args: ["household_id", "hh-source"] },
          // target SELECT
          { table: "transaction_categories", method: "from", args: ["transaction_categories"] },
          { table: "transaction_categories", method: "select", args: ["id, name"] },
          { table: "transaction_categories", method: "eq", args: ["household_id", "hh-target"] },
          // duplicate (Food) sc-1 -> remap 4 tables + delete
          { table: "transactions", method: "from", args: ["transactions"] },
          { table: "transactions", method: "update", args: [{ category_id: "tc-1" }] },
          { table: "transactions", method: "eq", args: ["category_id", "sc-1"] },
          { table: "budget_categories", method: "from", args: ["budget_categories"] },
          { table: "budget_categories", method: "update", args: [{ category_id: "tc-1" }] },
          { table: "budget_categories", method: "eq", args: ["category_id", "sc-1"] },
          { table: "merchant_category_rules", method: "from", args: ["merchant_category_rules"] },
          { table: "merchant_category_rules", method: "update", args: [{ category_id: "tc-1" }] },
          { table: "merchant_category_rules", method: "eq", args: ["category_id", "sc-1"] },
          { table: "transaction_splits", method: "from", args: ["transaction_splits"] },
          { table: "transaction_splits", method: "update", args: [{ category_id: "tc-1" }] },
          { table: "transaction_splits", method: "eq", args: ["category_id", "sc-1"] },
          { table: "transaction_categories", method: "from", args: ["transaction_categories"] },
          { table: "transaction_categories", method: "delete", args: [] },
          { table: "transaction_categories", method: "eq", args: ["id", "sc-1"] },
          // unique sc-2 (Travel) -> move to target
          { table: "transaction_categories", method: "from", args: ["transaction_categories"] },
          { table: "transaction_categories", method: "update", args: [{ household_id: "hh-target" }] },
          { table: "transaction_categories", method: "eq", args: ["id", "sc-2"] },
          // net_worth_snapshots delete
          { table: "net_worth_snapshots", method: "from", args: ["net_worth_snapshots"] },
          { table: "net_worth_snapshots", method: "delete", args: [] },
          { table: "net_worth_snapshots", method: "eq", args: ["household_id", "hh-source"] },
          // household_members update (move membership)
          { table: "household_members", method: "from", args: ["household_members"] },
          {
            table: "household_members",
            method: "update",
            args: [{ household_id: "hh-target", role: "member" }],
          },
          { table: "household_members", method: "eq", args: ["household_id", "hh-source"] },
          { table: "household_members", method: "eq", args: ["user_id", "user-1"] },
          // households delete
          { table: "households", method: "from", args: ["households"] },
          { table: "households", method: "delete", args: [] },
          { table: "households", method: "eq", args: ["id", "hh-source"] },
          // invitation update
          { table: "household_invitations", method: "from", args: ["household_invitations"] },
          { table: "household_invitations", method: "update", args: [{ status: "accepted" }] },
          { table: "household_invitations", method: "eq", args: ["id", "inv-1"] },
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    // Parametrized merge-error tests — each stops the merge at a different
    // step to hit every "if (error) throw error" guard inside
    // mergeHouseholdData + mergeCategories.
    const mergeBase = () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "inv-1", household_id: "hh-target" },
        error: null,
      });
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
        { data: null, error: null, count: 1 }, // target count
        { data: null, error: null, count: 1 }, // source count (solo)
      ];
      for (let i = 2; i <= 9; i++) {
        seq.push(
          i === failIdx ? { data: null, error: err } : { data: null, error: null }
        );
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
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
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
        { data: [{ id: "sc-1", name: "Food" }], error: null },
        { data: null, error: err },
      ]);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).rejects.toEqual(err);
    });

    it("returns early from mergeCategories when source has no categories (empty array path)", async () => {
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
        { data: [], error: null }, // source empty -> early return (length===0 branch)
        { data: null, error: null }, // snapshots delete
        { data: null, error: null }, // membership update
        { data: null, error: null }, // households delete
        { data: null, error: null }, // invitation update
      ]);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();

      // Kills `sourceCategories.length === 0` → `false` mutant: if mutated,
      // the early-return is skipped and the target-categories fetch runs
      // even on empty source. Source does exactly ONE .from("transaction_categories")
      // (the source fetch) on this path; mutant would do TWO (source + target).
      const txnCategoryFromCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.table === "transaction_categories" && e.method === "from"
      );
      expect(txnCategoryFromCalls).toHaveLength(1);
    });

    it("returns early from mergeCategories when source data is null (|| branch)", async () => {
      // Separately kills LogicalOperator mutant on `!sourceCategories || sourceCategories.length === 0`
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
        { data: null, error: null }, // null source data -> !sourceCategories === true
        { data: null, error: null }, // snapshots delete
        { data: null, error: null }, // membership update
        { data: null, error: null }, // households delete
        { data: null, error: null }, // invitation update
      ]);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();
    });

    it("handles null target categories list (|| [] defaults)", async () => {
      // Kills the `|| []` fallback for target categories (LogicalOperator / BlockStatement)
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
        { data: [{ id: "sc-1", name: "Unique" }], error: null }, // source has 1 unique
        { data: null, error: null }, // target null -> || []  (no matches)
        { data: null, error: null }, // move unique -> target (update)
        { data: null, error: null }, // snapshots
        { data: null, error: null }, // membership
        { data: null, error: null }, // households delete
        { data: null, error: null }, // invitation
      ]);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();
    });

    it("matches categories case-insensitively (toLowerCase)", async () => {
      // Kills MethodExpression mutant on .toLowerCase() — "FOOD" in source matches "food" in target
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
        { data: [{ id: "sc-1", name: "FOOD" }], error: null }, // uppercase source
        { data: [{ id: "tc-1", name: "food" }], error: null }, // lowercase target
        // Remaps expected (matching name case-insensitively):
        { data: null, error: null }, // transactions remap
        { data: null, error: null }, // budget_categories remap
        { data: null, error: null }, // merchant_category_rules remap
        { data: null, error: null }, // transaction_splits remap
        { data: null, error: null }, // delete source category
        { data: null, error: null }, // snapshots
        { data: null, error: null }, // membership
        { data: null, error: null }, // households delete
        { data: null, error: null }, // invitation
      ]);

      await expect(
        db.acceptInvite("t", "user-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();

      // Assert remap target category id used ("tc-1") — kills string-swap mutants
      // on the `matchingTargetId` path.
      const remapUpdates = mockSupabaseClient.queryLog.filter(
        (e) =>
          e.method === "update" &&
          Array.isArray(e.args) &&
          (e.args[0] as any)?.category_id === "tc-1"
      );
      // transactions, budget_categories, merchant_category_rules, transaction_splits
      expect(remapUpdates).toHaveLength(4);
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
        { data: [{ id: "sc-1", name: "Food" }], error: null },
        { data: [{ id: "tc-1", name: "Food" }], error: null },
      ];
      for (let i = 0; i <= 4; i++) {
        seq.push(
          i === step ? { data: null, error: err } : { data: null, error: null }
        );
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
        { data: [{ id: "sc-1", name: "Travel" }], error: null },
        { data: [], error: null },
        { data: null, error: err },
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
        { data: [], error: null },
      ];
      for (let i = 0; i <= 2; i++) {
        seq.push(
          i === step ? { data: null, error: err } : { data: null, error: null }
        );
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
        { data: null, error: null, count: 0 },
        { data: null, error: null }, // insert member ok
        { data: null, error: { code: "500", message: "update fail" } },
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
    it("creates new household and moves owned data + membership with full chain", async () => {
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
        { data: [{ id: "acct-1" }, { id: "acct-2" }], error: null }, // owned accounts
        { data: null, error: null }, // update transactions
        { data: null, error: null }, // update accounts
        { data: null, error: null }, // update private budgets
        { data: null, error: null }, // transfer shared budgets
        { data: null, error: null }, // transfer shared goals
        { data: null, error: null }, // update private goals
        { data: null, error: null }, // update bank connections
        { data: null, error: null }, // update membership
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();

      // Full ordered log locks in every .from/.eq/.update payload.
      expect(mockSupabaseClient.queryLog).toEqual([
        // 1. create new household
        { table: "households", method: "from", args: ["households"] },
        { table: "households", method: "insert", args: [{ name: "My Household" }] },
        { table: "households", method: "select", args: ["id"] },
        // 2. select owned accounts
        { table: "accounts", method: "from", args: ["accounts"] },
        { table: "accounts", method: "select", args: ["id"] },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["owner_id", "u-1"] },
        // 2b. move transactions for those accounts
        { table: "transactions", method: "from", args: ["transactions"] },
        { table: "transactions", method: "update", args: [{ household_id: "hh-new" }] },
        { table: "transactions", method: "in", args: ["account_id", ["acct-1", "acct-2"]] },
        // 2c. move accounts themselves
        { table: "accounts", method: "from", args: ["accounts"] },
        {
          table: "accounts",
          method: "update",
          args: [{ household_id: "hh-new", visibility: "mine" }],
        },
        { table: "accounts", method: "eq", args: ["household_id", "hh-1"] },
        { table: "accounts", method: "eq", args: ["owner_id", "u-1"] },
        // 3. move member's private budgets
        { table: "budgets", method: "from", args: ["budgets"] },
        {
          table: "budgets",
          method: "update",
          args: [{ household_id: "hh-new", is_shared: false }],
        },
        { table: "budgets", method: "eq", args: ["household_id", "hh-1"] },
        { table: "budgets", method: "eq", args: ["owner_id", "u-1"] },
        { table: "budgets", method: "eq", args: ["is_shared", false] },
        // household owner lookup
        { table: "household_members", method: "from", args: ["household_members"] },
        { table: "household_members", method: "select", args: ["user_id"] },
        { table: "household_members", method: "eq", args: ["household_id", "hh-1"] },
        { table: "household_members", method: "eq", args: ["role", "owner"] },
        // transfer shared budgets
        { table: "budgets", method: "from", args: ["budgets"] },
        { table: "budgets", method: "update", args: [{ owner_id: "owner-user" }] },
        { table: "budgets", method: "eq", args: ["household_id", "hh-1"] },
        { table: "budgets", method: "eq", args: ["owner_id", "u-1"] },
        { table: "budgets", method: "eq", args: ["is_shared", true] },
        // transfer shared goals
        { table: "savings_goals", method: "from", args: ["savings_goals"] },
        { table: "savings_goals", method: "update", args: [{ owner_id: "owner-user" }] },
        { table: "savings_goals", method: "eq", args: ["household_id", "hh-1"] },
        { table: "savings_goals", method: "eq", args: ["owner_id", "u-1"] },
        { table: "savings_goals", method: "eq", args: ["is_shared", true] },
        // 4. move private goals
        { table: "savings_goals", method: "from", args: ["savings_goals"] },
        {
          table: "savings_goals",
          method: "update",
          args: [{ household_id: "hh-new", is_shared: false }],
        },
        { table: "savings_goals", method: "eq", args: ["household_id", "hh-1"] },
        { table: "savings_goals", method: "eq", args: ["owner_id", "u-1"] },
        { table: "savings_goals", method: "eq", args: ["is_shared", false] },
        // 5. bank_connections
        { table: "bank_connections", method: "from", args: ["bank_connections"] },
        { table: "bank_connections", method: "update", args: [{ household_id: "hh-new" }] },
        { table: "bank_connections", method: "eq", args: ["household_id", "hh-1"] },
        { table: "bank_connections", method: "eq", args: ["connected_by", "u-1"] },
        // 6. update membership
        { table: "household_members", method: "from", args: ["household_members"] },
        {
          table: "household_members",
          method: "update",
          args: [{ household_id: "hh-new", role: "owner" }],
        },
        { table: "household_members", method: "eq", args: ["household_id", "hh-1"] },
        { table: "household_members", method: "eq", args: ["user_id", "u-1"] },
      ]);
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
        { data: [], error: null }, // no owned accounts (length 0)
        { data: null, error: null }, // budgets
        { data: null, error: null }, // transfer shared budgets
        { data: null, error: null }, // transfer shared goals
        { data: null, error: null }, // private goals
        { data: null, error: null }, // bank connections
        { data: null, error: null }, // membership
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();

      // Assert no .in call happened (transactions + accounts update skipped)
      const inCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.method === "in"
      );
      expect(inCalls).toHaveLength(0);
      // Assert only one .from("accounts") (for the SELECT, not the move)
      const accountsFromCalls = mockSupabaseClient.queryLog.filter(
        (e) => e.table === "accounts" && e.method === "from"
      );
      expect(accountsFromCalls).toHaveLength(1);
    });

    it("handles null ownedAccounts (falsy guard)", async () => {
      // Kills LogicalOperator / ConditionalExpression on `ownedAccounts && ownedAccounts.length > 0`
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { user_id: "owner-user" },
        error: null,
      });
      queueThenResponses([
        { data: null, error: null }, // null owned accounts -> first guard false
        { data: null, error: null }, // budgets
        { data: null, error: null }, // transfer shared budgets
        { data: null, error: null }, // transfer shared goals
        { data: null, error: null }, // private goals
        { data: null, error: null }, // bank connections
        { data: null, error: null }, // membership
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();
    });

    it("handles missing household owner gracefully (PGRST116) — skips transfers", async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: "hh-new" },
        error: null,
      });
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });
      queueThenResponses([
        { data: null, error: null }, // owned accounts
        { data: null, error: null }, // private budgets
        // no shared transfers
        { data: null, error: null }, // private goals
        { data: null, error: null }, // bank connections
        { data: null, error: null }, // membership update
      ]);

      await expect(
        db.removeMember("hh-1", "u-1", mockSupabaseClient as any)
      ).resolves.toBeUndefined();

      // Assert we did NOT attempt the shared-transfer updates (no update with
      // { owner_id: ... } payload).
      const ownerTransfers = mockSupabaseClient.queryLog.filter(
        (e) =>
          e.method === "update" &&
          Array.isArray(e.args) &&
          "owner_id" in (e.args[0] as any)
      );
      expect(ownerTransfers).toHaveLength(0);
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
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: "500", message: "owner fail" },
      });
      queueThenResponses([
        { data: [], error: null }, // no owned accounts
        { data: null, error: null }, // private budgets
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
        { data: [{ id: "a-1" }], error: null }, // owned accounts (non-empty)
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
        { data: null, error: rmErr },
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
        { data: [], error: null },
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
