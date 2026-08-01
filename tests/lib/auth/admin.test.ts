import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const { mockGetUser, mockFrom, mockRedirect } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

import {
  requireAdmin,
} from "@/lib/auth/admin";

// --- Helpers ---
function mockProfile(role: "user" | "admin") {
  return {
    id: "user-123",
    email: "test@example.com",
    role,
  };
}

function setupProfileQuery(profile: Record<string, unknown> | null) {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: profile,
          error: null,
        }),
      }),
    }),
  });
}

// --- Tests ---
describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /auth/login when no user is authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
    expect(mockRedirect).toHaveBeenCalledWith("/auth/login");
  });

  it("redirects to /dashboard when user role is 'user'", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    setupProfileQuery(mockProfile("user"));

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns user and profile when role is 'admin'", async () => {
    const user = { id: "user-123" };
    const profile = mockProfile("admin");
    mockGetUser.mockResolvedValue({ data: { user } });
    setupProfileQuery(profile);

    const result = await requireAdmin();

    expect(result).toEqual({ user, profile });
  });

  it("redirects to /dashboard when profile query returns null", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    setupProfileQuery(null);

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });
});
