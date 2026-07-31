import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProfilesDB, profilesDB } from "@/lib/db/profiles";
import { mockSupabaseClient } from "../../setup";
import { restoreMockSupabaseThen } from "../../helpers/mock-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, ProfileUpdate } from "@/lib/db/types";

const USER_ID = "user-123";

function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    id: USER_ID,
    email: "test@example.com",
    full_name: "Test User",
    avatar_url: "https://example.com/avatar.jpg",
    timezone: "UTC",
    email_notifications_enabled: true,
    role: "user",
    preferences: {
      date_format: "MM/DD/YYYY",
      week_start_day: 1,
      theme: "dark",
      weight_unit: "kg",
    },
    created_at: "2026-01-30T10:00:00Z",
    updated_at: "2026-01-30T10:00:00Z",
    ...over,
  };
}

describe("ProfilesDB", () => {
  let db: ProfilesDB;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
    db = new ProfilesDB(mockSupabaseClient as unknown as SupabaseClient);
  });

  afterEach(() => {
    restoreMockSupabaseThen();
  });

  // ─── getProfile ───────────────────────────────────────────────────────────
  describe("getProfile", () => {
    it("fetches the profile by id with full query chain", async () => {
      const expected = makeProfile();
      mockSupabaseClient.setMockResponse(expected);

      const result = await db.getProfile(USER_ID);

      expect(result).toEqual(expected);

      // Full chain: catches .from("profiles") → .from("X") mutants and the
      // .eq("id", ...) → .eq("user_id", ...) misuse (profiles keys on `id`).
      mockSupabaseClient.expectQuery({
        table: "profiles",
        method: "from",
        args: ["profiles"],
      });
      mockSupabaseClient.expectQuery({
        table: "profiles",
        method: "select",
        args: ["*"],
      });
      mockSupabaseClient.expectQuery({
        table: "profiles",
        method: "eq",
        args: ["id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "profiles",
        method: "single",
        args: [],
      });
    });

    it("returns null when error.code === 'PGRST116' (row not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getProfile("nonexistent");

      expect(result).toBeNull();
    });

    it("throws when error.code is not 'PGRST116'", async () => {
      const err = { code: "OTHER_ERROR", message: "DB error" };
      mockSupabaseClient.setMockResponse(null, err);

      await expect(db.getProfile(USER_ID)).rejects.toEqual(err);
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────────────
  describe("updateProfile", () => {
    it("updates by id and returns the updated profile", async () => {
      const updates: ProfileUpdate = {
        full_name: "Updated Name",
        avatar_url: "https://example.com/new-avatar.jpg",
      };
      const expected = makeProfile({ ...updates });
      mockSupabaseClient.setMockResponse(expected);

      const result = await db.updateProfile(USER_ID, updates);

      expect(result).toEqual(expected);

      mockSupabaseClient.expectQuery({
        table: "profiles",
        method: "from",
        args: ["profiles"],
      });
      mockSupabaseClient.expectQuery({
        table: "profiles",
        method: "update",
        args: [updates],
      });
      mockSupabaseClient.expectQuery({
        table: "profiles",
        method: "eq",
        args: ["id", USER_ID],
      });
      mockSupabaseClient.expectQuery({
        table: "profiles",
        method: "select",
        args: [],
      });
      mockSupabaseClient.expectQuery({
        table: "profiles",
        method: "single",
        args: [],
      });
    });

    it("throws when the update errors", async () => {
      const err = { message: "Update failed" };
      mockSupabaseClient.setMockResponse(null, err);

      await expect(
        db.updateProfile(USER_ID, { full_name: "Test" }),
      ).rejects.toEqual(err);
    });
  });

  // ─── updatePreferences ────────────────────────────────────────────────────
  describe("updatePreferences", () => {
    it("accepts a partial intent and returns the atomically updated profile", async () => {
      const expected = makeProfile({
        preferences: {
          date_format: "MM/DD/YYYY",
          week_start_day: 1,
          theme: "light",
          weight_unit: "kg",
        },
      });
      const rpc = vi.fn().mockResolvedValue({ data: expected, error: null });
      const rpcDB = new ProfilesDB({ rpc } as unknown as SupabaseClient);

      const result = await rpcDB.updatePreferences(USER_ID, { theme: "light" });

      expect(rpc).toHaveBeenCalledWith("update_profile_preferences", {
        profile_id: USER_ID,
        preference_patch: { theme: "light" },
      });
      expect(result).toEqual(expected);
    });

    it("rejects the intent without returning a profile when persistence fails", async () => {
      const error = {
        code: "P0002",
        message: "Profile not found for user user-123",
        details: null,
        hint: null,
      };
      const rpc = vi.fn().mockResolvedValue({ data: null, error });
      const rpcDB = new ProfilesDB({ rpc } as unknown as SupabaseClient);

      const rejection = rpcDB.updatePreferences(USER_ID, { theme: "dark" });

      await expect(rejection).rejects.toBeInstanceOf(Error);
      await expect(rejection).rejects.toMatchObject({
        code: "P0002",
        message: "Profile not found for user user-123",
      });
    });

    it("reports a missing profile when the RPC returns null without an error", async () => {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
      const rpcDB = new ProfilesDB({ rpc } as unknown as SupabaseClient);

      await expect(
        rpcDB.updatePreferences(USER_ID, { theme: "dark" }),
      ).rejects.toThrow("Profile not found for user user-123");
    });
  });

  // ─── module-level singleton ───────────────────────────────────────────────
  describe("profilesDB singleton", () => {
    it("exports a ProfilesDB instance bound to the browser client", () => {
      // The singleton is constructed at import time via createClient() (mocked
      // in tests/setup.ts to return mockSupabaseClient). Confirming it's an
      // instance keeps the export from being silently deleted by a mutant.
      expect(profilesDB).toBeInstanceOf(ProfilesDB);
    });
  });
});
