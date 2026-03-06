import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/money/household/invite/route";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockResolveHousehold,
  mockGetMemberRole,
  mockGetMemberCount,
  mockGetMembers,
  mockCreateInvite,
} = vi.hoisted(() => ({
  mockResolveHousehold: vi.fn(),
  mockGetMemberRole: vi.fn(),
  mockGetMemberCount: vi.fn(),
  mockGetMembers: vi.fn(),
  mockCreateInvite: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "owner@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/db/households", () => ({
  resolveHousehold: mockResolveHousehold,
  HouseholdsDB: class {
    getMemberRole = mockGetMemberRole;
    getMemberCount = mockGetMemberCount;
    getMembers = mockGetMembers;
    createInvite = mockCreateInvite;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/money/household/invite", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/money/household/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated owner with room for more members
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "owner@example.com" } },
        })),
      },
    } as any);
    mockResolveHousehold.mockResolvedValue("household-abc");
    mockGetMemberRole.mockResolvedValue("owner");
    mockGetMemberCount.mockResolvedValue(2);
    mockGetMembers.mockResolvedValue([
      { email: "owner@example.com" },
      { email: "existing@example.com" },
    ]);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const response = await POST(makeRequest({ email: "partner@example.com" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid email", async () => {
    const response = await POST(makeRequest({ email: "not-an-email" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
  });

  it("returns 403 when non-owner tries to invite", async () => {
    mockGetMemberRole.mockResolvedValue("member");

    const response = await POST(makeRequest({ email: "partner@example.com" }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("owner");
  });

  it("returns 400 when household is full (5 members)", async () => {
    mockGetMemberCount.mockResolvedValue(5);

    const response = await POST(makeRequest({ email: "partner@example.com" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("maximum");
  });

  it("returns 201 with invitation data on success", async () => {
    const mockInvitation = {
      id: "invite-1",
      token: "abc-token-123",
      email: "partner@example.com",
    };
    mockCreateInvite.mockResolvedValue(mockInvitation);

    const response = await POST(makeRequest({ email: "partner@example.com" }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.invitation).toEqual(mockInvitation);
  });

  it("returns 409 when email already a member", async () => {
    const response = await POST(
      makeRequest({ email: "existing@example.com" })
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("already a member");
  });

  it("returns 409 when invitation already sent (duplicate)", async () => {
    mockCreateInvite.mockRejectedValue(
      new Error("An invitation has already been sent to this email")
    );

    const response = await POST(makeRequest({ email: "new@example.com" }));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("already been sent");
  });
});
