import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/current-profile/route";

const { mockAuthenticateRequest, mockGetCurrentProfileProjection } = vi.hoisted(
  () => ({
    mockAuthenticateRequest: vi.fn(),
    mockGetCurrentProfileProjection: vi.fn(),
  }),
);

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mockAuthenticateRequest,
  cookieRouteErrorMessage: (error: { status: number; error: string }) =>
    error.status === 401 ? "Unauthorized" : error.error,
}));

vi.mock("@/lib/db", () => ({
  ProfilesDB: class {
    getCurrentProfileProjection = mockGetCurrentProfileProjection;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const projection = {
  id: "profile-123",
  email: "stale-profile@example.com",
  full_name: "Taylor Example",
  avatar_url: null,
  timezone: "America/Los_Angeles",
  role: "user",
  preference_revision: 3,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  preferences: {
    date_format: "MM/DD/YYYY",
    theme: "system",
    week_start_day: 1,
    weight_unit: "kg",
    email_notifications_enabled: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
    unknown_key: "private",
  },
};

describe("GET /api/current-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      ok: true,
      principal: {
        type: "user",
        userId: "user-123",
        credential: "cookie",
        profile: {
          email: "taylor@example.com",
          fullName: "Ignored auth name",
          avatarUrl: null,
        },
      },
      permissions: ["read"],
      client: {},
    });
    mockGetCurrentProfileProjection.mockResolvedValue(projection);
  });

  it("returns the canonical private currentProfile envelope", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/current-profile"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(data).toEqual({
      currentProfile: {
        identity: { email: "taylor@example.com" },
        profileDetails: { fullName: "Taylor Example", avatarUrl: null },
        userTimeZone: { status: "resolved", value: "America/Los_Angeles" },
        capabilities: { canAccessAdmin: false },
        preferences: {
          preferenceRevision: 3,
          appearance: { theme: { status: "ready", value: "system" } },
          localization: { weekStart: { status: "ready", value: "monday" } },
          fitness: { weightUnit: { status: "ready", value: "kg" } },
          notifications: {
            reminderEmail: { status: "ready", value: { enabled: false } },
            pushQuietWindow: {
              status: "ready",
              value: { status: "disabled" },
            },
          },
        },
        issues: [],
      },
    });
    expect(mockGetCurrentProfileProjection).toHaveBeenCalledWith("user-123");
  });

  it("takes capabilities from the authorization boundary, not the profile projection", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      ok: true,
      principal: {
        type: "user",
        userId: "user-123",
        credential: "cookie",
        profile: { email: "taylor@example.com", fullName: null, avatarUrl: null },
      },
      permissions: ["read", "admin"],
      client: {},
    });

    const response = await GET(
      new NextRequest("http://localhost/api/current-profile"),
    );

    await expect(response.json()).resolves.toMatchObject({
      currentProfile: { capabilities: { canAccessAdmin: true } },
    });
  });

  it("returns a degraded 200 when one stored Preference is malformed", async () => {
    mockGetCurrentProfileProjection.mockResolvedValue({
      ...projection,
      preferences: {
        ...projection.preferences,
        theme: "chartreuse",
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/current-profile"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.currentProfile.preferences.appearance.theme).toEqual({
      status: "unavailable",
      reason: "invalidStoredValue",
    });
    expect(data.currentProfile.preferences.localization.weekStart).toEqual({
      status: "ready",
      value: "monday",
    });
    expect(data.currentProfile.issues).toEqual([
      { scope: "appearance.theme", code: "invalidStoredValue" },
    ]);
  });

  it("returns 409 when Profile Details are not provisioned", async () => {
    mockGetCurrentProfileProjection.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/current-profile"),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual({
      error: "profile_not_provisioned",
    });
  });

  it("returns 401 for an unauthenticated request", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      ok: false,
      outcome: "anonymous",
      error: "Unauthorized",
      status: 401,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/current-profile"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("returns 503 when the profile source is unavailable", async () => {
    mockGetCurrentProfileProjection.mockRejectedValue(new Error("database down"));

    const response = await GET(
      new NextRequest("http://localhost/api/current-profile"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual({
      error: "current_profile_unavailable",
    });
  });
});
