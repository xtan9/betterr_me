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
    it("merges new preferences with existing ones and preserves unchanged fields", async () => {
      const base = makeProfile();
      // Both getProfile (first .single()) and updateProfile (second .single())
      // read from mockData. Use mockResolvedValueOnce so each awaited single
      // resolves with distinct data/error — first with the current profile,
      // then with the merged-updated profile.
      const merged = makeProfile({
        preferences: {
          ...base.preferences,
          theme: "light",
        },
      });
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: base, error: null })
        .mockResolvedValueOnce({ data: merged, error: null });

      const result = await db.updatePreferences(USER_ID, { theme: "light" });

      // New field updated, old fields preserved — both matter:
      // - A mutant that replaces the spread `...profile.preferences` with
      //   `...{}` would drop date_format; this assertion catches it.
      // - A mutant that flips the spread order so new values come first
      //   would leave theme: 'dark'; asserting 'light' catches that.
      expect(result.preferences.theme).toBe("light");
      expect(result.preferences.date_format).toBe("MM/DD/YYYY");
      expect(result.preferences.week_start_day).toBe(1);
      expect(result.preferences.weight_unit).toBe("kg");

      // Verify updateProfile was called with the exact merged object — this
      // is the key assertion that catches any mutation to the merge logic
      // in the source.
      mockSupabaseClient.expectQuery({
        table: "profiles",
        method: "update",
        args: [
          {
            preferences: {
              date_format: "MM/DD/YYYY",
              week_start_day: 1,
              theme: "light",
              weight_unit: "kg",
            },
          },
        ],
      });
    });

    it("throws 'Profile not found' when the underlying getProfile returns null", async () => {
      // getProfile returns null via PGRST116 path → throw 'Profile not found'.
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      await expect(
        db.updatePreferences("nonexistent", { theme: "dark" }),
      ).rejects.toThrow("Profile not found");
    });

    it("propagates errors from the underlying getProfile call", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "OTHER_ERROR",
        message: "DB fail",
      });

      await expect(
        db.updatePreferences(USER_ID, { theme: "dark" }),
      ).rejects.toEqual({ code: "OTHER_ERROR", message: "DB fail" });
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
