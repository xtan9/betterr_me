import { describe, it, expect, vi, beforeEach } from "vitest";
import { HouseholdsDB } from "@/lib/db/households";
import { mockSupabaseClient } from "../../setup";

describe("HouseholdsDB", () => {
  let db: HouseholdsDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new HouseholdsDB(mockSupabaseClient as any);
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
});
