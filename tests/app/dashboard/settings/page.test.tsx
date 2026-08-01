import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentProfileProjection: vi.fn(),
  getCookiePermissions: vi.fn(),
  composeCurrentProfileResponse: vi.fn(),
  supabase: { auth: { getUser: vi.fn() } },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mocks.supabase),
}));

vi.mock("@/lib/db", () => ({
  ProfilesDB: class {
    getCurrentProfileProjection = mocks.getCurrentProfileProjection;
  },
}));

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticatedCookiePermissions: mocks.getCookiePermissions,
  verifiedIdentityEmail: (user: { email?: string | null }) => user.email ?? null,
}));

vi.mock("@/lib/current-profile", () => ({
  composeCurrentProfileResponse: mocks.composeCurrentProfileResponse,
}));

vi.mock("@/components/settings/settings-content", () => ({
  SettingsContent: () => null,
}));

import SettingsPage from "@/app/dashboard/settings/page";

describe("SettingsPage Current Profile hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "person@example.test",
          email_confirmed_at: "2026-08-01T00:00:00.000Z",
        },
      },
    });
    mocks.getCurrentProfileProjection.mockResolvedValue({
      id: "profile-1",
    });
    mocks.getCookiePermissions.mockResolvedValue(["read", "write"]);
    mocks.composeCurrentProfileResponse.mockImplementation((input) => input);
  });

  it.each([
    ["permitted", ["read", "write", "admin"], true],
    ["denied", ["read", "write"], false],
  ] as const)(
    "hydrates the %s server-authorized admin capability",
    async (_label, permissions, canAccessAdmin) => {
      mocks.getCookiePermissions.mockResolvedValue(permissions);

      await SettingsPage();

      expect(mocks.getCookiePermissions).toHaveBeenCalledWith(
        mocks.supabase,
        "user-1",
      );
      expect(mocks.composeCurrentProfileResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilities: { canAccessAdmin },
        }),
      );
    },
  );
});
