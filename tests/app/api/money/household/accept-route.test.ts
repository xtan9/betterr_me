import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/money/household/accept/route";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockGetMemberCount, mockAcceptInvite } = vi.hoisted(() => ({
  mockGetMemberCount: vi.fn(),
  mockAcceptInvite: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-456", email: "invitee@example.com" } },
      })),
    },
    from: mockFrom,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { household_id: "household-target" },
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/db/households", () => ({
  HouseholdsDB: class {
    getMemberCount = mockGetMemberCount;
    acceptInvite = mockAcceptInvite;
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
  return new NextRequest("http://localhost:3000/api/money/household/accept", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validToken = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/money/household/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated solo user (1 member in current household)
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-456", email: "invitee@example.com" } },
        })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({
              data: { household_id: "solo-household" },
            })),
          })),
        })),
      })),
    } as any);
    mockGetMemberCount.mockResolvedValue(1);
    mockAcceptInvite.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
      from: mockFrom,
    } as any);

    const response = await POST(makeRequest({ token: validToken }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 for missing token", async () => {
    const response = await POST(makeRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 for invalid token (not UUID)", async () => {
    const response = await POST(makeRequest({ token: "not-a-uuid" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 for expired token", async () => {
    mockAcceptInvite.mockRejectedValue(
      new Error("Invalid or expired invitation token")
    );

    const response = await POST(makeRequest({ token: validToken }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid or expired");
  });

  it("returns 200 on successful acceptance", async () => {
    const response = await POST(makeRequest({ token: validToken }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.household_id).toBe("household-target");
    expect(mockAcceptInvite).toHaveBeenCalled();
  });

  it("returns 400 when user is already in multi-member household", async () => {
    mockGetMemberCount.mockResolvedValue(2);

    const response = await POST(makeRequest({ token: validToken }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("already in a multi-member household");
  });
});
