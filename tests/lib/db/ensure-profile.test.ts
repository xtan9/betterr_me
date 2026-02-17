import { describe, it, expect, vi } from "vitest";
import { ensureProfile } from "@/lib/db/ensure-profile";
import type { User } from "@supabase/supabase-js";

const mockUser: User = {
  id: "user-123",
  email: "test@example.com",
  user_metadata: { full_name: "Test User", avatar_url: "https://example.com/avatar.png" },
  app_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
} as User;

function createMockSupabase(overrides: {
  selectData?: Record<string, unknown> | null;
  selectError?: { code: string; message: string } | null;
  insertError?: { code: string; message: string } | null;
} = {}) {
  const { selectData = null, selectError = null, insertError = null } = overrides;
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: selectData,
            error: selectError,
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: insertError }),
    }),
  } as any;
}

describe("ensureProfile", () => {
  describe("profile already exists", () => {
    it("returns early without inserting", async () => {
      const supabase = createMockSupabase({
        selectData: { id: "user-123" },
      });

      await ensureProfile(supabase, mockUser);

      // from() called once for SELECT, never for INSERT
      const fromCalls = supabase.from.mock.calls;
      expect(fromCalls).toHaveLength(1);
    });
  });

  describe("profile missing (PGRST116)", () => {
    it("creates profile with user data", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "profiles") {
            // Return different chains for select vs insert
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: "PGRST116", message: "Not found" },
                  }),
                }),
              }),
              insert: mockInsert,
            };
          }
        }),
      } as any;

      await ensureProfile(supabase, mockUser);

      expect(mockInsert).toHaveBeenCalledWith({
        id: "user-123",
        email: "test@example.com",
        full_name: "Test User",
        avatar_url: "https://example.com/avatar.png",
      });
    });
  });

  describe("unexpected SELECT error", () => {
    it("throws non-PGRST116 select errors", async () => {
      const supabase = createMockSupabase({
        selectError: { code: "42P01", message: "relation does not exist" },
      });

      await expect(ensureProfile(supabase, mockUser)).rejects.toEqual({
        code: "42P01",
        message: "relation does not exist",
      });
    });
  });

  describe("race condition (23505 unique_violation)", () => {
    it("silently handles unique_violation on insert", async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "PGRST116", message: "Not found" },
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({
            error: { code: "23505", message: "unique_violation" },
          }),
        }),
      } as any;

      // Should NOT throw
      await expect(ensureProfile(supabase, mockUser)).resolves.toBeUndefined();
    });
  });

  describe("unexpected INSERT error", () => {
    it("throws non-23505 insert errors", async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "PGRST116", message: "Not found" },
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({
            error: { code: "23502", message: "not_null_violation" },
          }),
        }),
      } as any;

      await expect(ensureProfile(supabase, mockUser)).rejects.toEqual({
        code: "23502",
        message: "not_null_violation",
      });
    });
  });

  describe("email fallback", () => {
    it("uses no-email-{id} when user.email is null", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "PGRST116", message: "Not found" },
              }),
            }),
          }),
          insert: mockInsert,
        }),
      } as any;

      const userNoEmail = { ...mockUser, email: undefined } as unknown as User;
      await ensureProfile(supabase, userNoEmail);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ email: "no-email-user-123" }),
      );
    });
  });

  describe("user_metadata extraction", () => {
    it("uses null for missing full_name and avatar_url", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "PGRST116", message: "Not found" },
              }),
            }),
          }),
          insert: mockInsert,
        }),
      } as any;

      const userNoMeta = { ...mockUser, user_metadata: {} } as User;
      await ensureProfile(supabase, userNoMeta);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: null, avatar_url: null }),
      );
    });
  });
});
