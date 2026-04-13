import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockReminderDefaultsDB = {
  getDefaults: vi.fn(),
  upsertDefault: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123", email: "test@example.com" } },
      })),
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  ReminderDefaultsDB: class {
    constructor() {
      return mockReminderDefaultsDB;
    }
  },
}));

import { createClient } from "@/lib/supabase/server";

describe("GET /api/reminder-defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user defaults", async () => {
    const { GET } = await import("@/app/api/reminder-defaults/route");
    const mockDefaults = [
      {
        id: "d1",
        user_id: "user-123",
        source_type: "calendar_event",
        relative_minutes: 15,
        channels: ["push"],
        created_at: "2026-04-01T00:00:00Z",
      },
    ];
    mockReminderDefaultsDB.getDefaults.mockResolvedValue(mockDefaults);

    const request = new NextRequest(
      "http://localhost:3000/api/reminder-defaults"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.defaults).toEqual(mockDefaults);
    expect(mockReminderDefaultsDB.getDefaults).toHaveBeenCalledWith(
      "user-123"
    );
  });

  it("returns 401 for unauthenticated request", async () => {
    const { GET } = await import("@/app/api/reminder-defaults/route");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null } })),
      },
    } as unknown as ReturnType<typeof createClient> extends Promise<infer T> ? T : never);

    const request = new NextRequest(
      "http://localhost:3000/api/reminder-defaults"
    );
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});

describe("PUT /api/reminder-defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a default for source type", async () => {
    const { PUT } = await import("@/app/api/reminder-defaults/route");
    const mockResult = {
      id: "d1",
      user_id: "user-123",
      source_type: "calendar_event",
      relative_minutes: 30,
      channels: ["push", "email"],
      created_at: "2026-04-01T00:00:00Z",
    };
    mockReminderDefaultsDB.upsertDefault.mockResolvedValue(mockResult);

    const request = new NextRequest(
      "http://localhost:3000/api/reminder-defaults",
      {
        method: "PUT",
        body: JSON.stringify({
          source_type: "calendar_event",
          relative_minutes: 30,
          channels: ["push", "email"],
        }),
      }
    );
    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.default).toEqual(mockResult);
    expect(mockReminderDefaultsDB.upsertDefault).toHaveBeenCalledWith(
      "user-123",
      {
        source_type: "calendar_event",
        relative_minutes: 30,
        channels: ["push", "email"],
      }
    );
  });

  it("returns 401 for unauthenticated request", async () => {
    const { PUT } = await import("@/app/api/reminder-defaults/route");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(() => ({ data: { user: null } })),
      },
    } as unknown as ReturnType<typeof createClient> extends Promise<infer T> ? T : never);

    const request = new NextRequest(
      "http://localhost:3000/api/reminder-defaults",
      {
        method: "PUT",
        body: JSON.stringify({
          source_type: "calendar_event",
          relative_minutes: 30,
          channels: ["push"],
        }),
      }
    );
    const response = await PUT(request);

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const { PUT } = await import("@/app/api/reminder-defaults/route");

    const request = new NextRequest(
      "http://localhost:3000/api/reminder-defaults",
      {
        method: "PUT",
        body: JSON.stringify({
          source_type: "invalid_type",
          relative_minutes: -5,
          channels: [],
        }),
      }
    );
    const response = await PUT(request);

    expect(response.status).toBe(400);
  });

  it("returns 500 when upsert throws", async () => {
    const { PUT } = await import("@/app/api/reminder-defaults/route");
    mockReminderDefaultsDB.upsertDefault.mockRejectedValue(new Error("db error"));

    const request = new NextRequest(
      "http://localhost:3000/api/reminder-defaults",
      {
        method: "PUT",
        body: JSON.stringify({
          source_type: "task",
          relative_minutes: 10,
          channels: ["push"],
        }),
      }
    );
    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to upsert reminder default");
  });
});

describe("GET /api/reminder-defaults - error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when getDefaults throws", async () => {
    const { GET } = await import("@/app/api/reminder-defaults/route");
    mockReminderDefaultsDB.getDefaults.mockRejectedValue(new Error("db error"));

    const request = new NextRequest(
      "http://localhost:3000/api/reminder-defaults"
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch reminder defaults");
  });
});
