import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/money/household/route";

const { mockResolveHousehold } = vi.hoisted(() => ({
  mockResolveHousehold: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/db/households", () => ({
  resolveHousehold: mockResolveHousehold,
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
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
    } as any);
  });

  it("should return household_id for authenticated user", async () => {
    mockResolveHousehold.mockResolvedValue("household-abc");

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.household_id).toBe("household-abc");
    expect(mockResolveHousehold).toHaveBeenCalledWith(
      expect.anything(),
      "user-123"
    );
  });

  it("should return 401 if not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
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
});
