import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/money/categories/route";
import { NextRequest } from "next/server";

const { mockResolveHousehold } = vi.hoisted(() => ({
  mockResolveHousehold: vi.fn(),
}));

const { mockGetVisible, mockCreate } = vi.hoisted(() => ({
  mockGetVisible: vi.fn(),
  mockCreate: vi.fn(),
}));

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

vi.mock("@/lib/db", () => ({
  CategoriesDB: class {
    getVisible = mockGetVisible;
    create = mockCreate;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createClient } from "@/lib/supabase/server";

describe("GET /api/money/categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
    } as any);
    mockResolveHousehold.mockResolvedValue("household-abc");
  });

  it("should return 401 when not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return visible categories list", async () => {
    const mockCategories = [
      {
        id: "cat-1",
        name: "groceries",
        icon: "🛒",
        is_system: true,
        color: "#4CAF50",
        display_name: "Groceries",
        household_id: null,
        created_at: "2026-02-20T00:00:00Z",
      },
      {
        id: "cat-2",
        name: "custom-cat",
        icon: "🎯",
        is_system: false,
        color: "#FF5722",
        display_name: "My Category",
        household_id: "household-abc",
        created_at: "2026-02-21T00:00:00Z",
      },
    ];
    mockGetVisible.mockResolvedValue(mockCategories);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.categories).toHaveLength(2);
    expect(data.categories[0].name).toBe("groceries");
    expect(mockGetVisible).toHaveBeenCalledWith("household-abc");
  });

  it("should return empty array when no categories", async () => {
    mockGetVisible.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.categories).toEqual([]);
  });
});

describe("POST /api/money/categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123", email: "test@example.com" } },
        })),
      },
    } as any);
    mockResolveHousehold.mockResolvedValue("household-abc");
  });

  it("should return 401 when not authenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/money/categories",
      {
        method: "POST",
        body: JSON.stringify({ name: "Test" }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should create a custom category and return 201", async () => {
    const mockCategory = {
      id: "cat-new",
      name: "entertainment",
      icon: "🎬",
      is_system: false,
      color: "#9C27B0",
      display_name: "Entertainment",
      household_id: "household-abc",
      created_at: "2026-02-22T00:00:00Z",
    };
    mockCreate.mockResolvedValue(mockCategory);

    const request = new NextRequest(
      "http://localhost:3000/api/money/categories",
      {
        method: "POST",
        body: JSON.stringify({
          name: "entertainment",
          icon: "🎬",
          color: "#9C27B0",
          display_name: "Entertainment",
        }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.category).toBeDefined();
    expect(data.category.name).toBe("entertainment");
    expect(mockCreate).toHaveBeenCalledWith({
      name: "entertainment",
      icon: "🎬",
      color: "#9C27B0",
      display_name: "Entertainment",
      household_id: "household-abc",
      is_system: false,
    });
  });

  it("should return 400 with invalid data (empty name)", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/money/categories",
      {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
  });

  it("should return 400 with invalid color format", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/money/categories",
      {
        method: "POST",
        body: JSON.stringify({ name: "test", color: "not-a-color" }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
  });
});
