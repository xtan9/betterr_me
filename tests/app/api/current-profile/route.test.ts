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
  full_name: "Taylor Example",
  avatar_url: null,
  timezone: "America/Los_Angeles",
  role: "user",
  preference_revision: 3,
  preferences: {
    theme: "system",
    week_start_day: 1,
    weight_unit: "kg",
    email_notifications_enabled: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
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
    expect(data.currentProfile.identity.email).toBe("taylor@example.com");
    expect(data.currentProfile.profileDetails.fullName).toBe("Taylor Example");
    expect(data.currentProfile.preferences.fitness.weightUnit).toEqual({
      status: "ready",
      value: "kg",
    });
    expect(data.currentProfile).not.toHaveProperty("role");
    expect(data.currentProfile).not.toHaveProperty("id");
    expect(mockGetCurrentProfileProjection).toHaveBeenCalledWith("user-123");
  });

  it("returns 409 when Profile Details are not provisioned", async () => {
    mockGetCurrentProfileProjection.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/current-profile"),
    );

    expect(response.status).toBe(409);
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
    await expect(response.json()).resolves.toEqual({
      error: "current_profile_unavailable",
    });
  });
});
