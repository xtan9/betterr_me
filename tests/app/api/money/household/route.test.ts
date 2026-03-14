import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/money/household/route";

const { mockResolveHousehold, mockGetMemberRole, mockGetMembers, mockGetInvitations } = vi.hoisted(() => ({
  mockResolveHousehold: vi.fn(),
  mockGetMemberRole: vi.fn(),
  mockGetMembers: vi.fn(),
  mockGetInvitations: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/db/households", () => ({
  resolveHousehold: mockResolveHousehold,
  HouseholdsDB: class {
    getMemberRole = mockGetMemberRole;
    getMembers = mockGetMembers;
    getInvitations = mockGetInvitations;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { createClient } from "@/lib/supabase/server";

describe("GET /api/money/household", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to authenticated user for each test
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
    } as any);
    mockGetMemberRole.mockResolvedValue("owner");
    mockGetMembers.mockResolvedValue([]);
    mockGetInvitations.mockResolvedValue([]);
  });

  it("should return household_id for authenticated user", async () => {
    mockResolveHousehold.mockResolvedValue("household-abc");

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.household_id).toBe("household-abc");
    expect(data.role).toBe("owner");
    expect(data.members).toEqual([]);
    expect(data.invitations).toEqual([]);
    expect(mockResolveHousehold).toHaveBeenCalledWith(
      expect.anything(),
      "user-123"
    );
  });

  it("should return 401 if not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 500 if resolveHousehold throws", async () => {
    mockResolveHousehold.mockRejectedValue(new Error("DB connection failed"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to resolve household");
  });

  it("should not return invitations for non-owner members", async () => {
    mockResolveHousehold.mockResolvedValue("household-abc");
    mockGetMemberRole.mockResolvedValue("member");

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.invitations).toEqual([]);
    expect(mockGetInvitations).not.toHaveBeenCalled();
  });
});
