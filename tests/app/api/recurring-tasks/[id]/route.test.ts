import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH, DELETE } from "@/app/api/recurring-tasks/[id]/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })),
    },
  })),
}));

const mockRecurringTasksDB = {
  getRecurringTask: vi.fn(),
  updateRecurringTask: vi.fn(),
  pauseRecurringTask: vi.fn(),
  resumeRecurringTask: vi.fn(),
  deleteRecurringTask: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  RecurringTasksDB: class {
    constructor() {
      return mockRecurringTasksDB;
    }
  },
}));

import { createClient } from "@/lib/supabase/server";

describe("GET /api/recurring-tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("should return template by ID", async () => {
    const template = { id: "rt-1", title: "Daily standup" };
    vi.mocked(mockRecurringTasksDB.getRecurringTask).mockResolvedValue(
      template,
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(template);
    expect(mockRecurringTasksDB.getRecurringTask).toHaveBeenCalledWith(
      "rt-1",
      "user-123",
    );
  });

  it("should return 404 if not found", async () => {
    vi.mocked(mockRecurringTasksDB.getRecurringTask).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/nonexistent",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(response.status).toBe(404);
  });

  it("should return 401 if unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/recurring-tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("should update template with valid body", async () => {
    const updated = { id: "rt-1", title: "Updated" };
    vi.mocked(mockRecurringTasksDB.updateRecurringTask).mockResolvedValue(
      updated,
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(updated);
  });

  it("should handle pause action", async () => {
    const paused = { id: "rt-1", status: "paused" };
    vi.mocked(mockRecurringTasksDB.pauseRecurringTask).mockResolvedValue(
      paused,
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?action=pause",
      { method: "PATCH" },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(paused);
    expect(mockRecurringTasksDB.pauseRecurringTask).toHaveBeenCalledWith(
      "rt-1",
      "user-123",
    );
  });

  it("should handle resume action", async () => {
    const resumed = { id: "rt-1", status: "active" };
    vi.mocked(mockRecurringTasksDB.resumeRecurringTask).mockResolvedValue(
      resumed,
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?action=resume",
      { method: "PATCH" },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recurring_task).toEqual(resumed);
    expect(mockRecurringTasksDB.resumeRecurringTask).toHaveBeenCalledWith(
      "rt-1",
      "user-123",
      expect.any(String),
      expect.any(String),
    );
  });

  it("should return 400 for invalid action", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?action=invalid",
      { method: "PATCH" },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/invalid action/i);
  });

  it("should return 400 on validation failure", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "PATCH",
        body: JSON.stringify({ priority: 99 }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(400);
  });

  it("should return 401 if unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "PATCH",
        body: JSON.stringify({ title: "X" }),
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("should return 404 if resume fails with not found", async () => {
    vi.mocked(mockRecurringTasksDB.resumeRecurringTask).mockRejectedValue(
      new Error("Recurring task not found"),
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1?action=resume",
      { method: "PATCH" },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/recurring-tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: "user-123" } } })) },
    } as any);
  });

  it("should delete template", async () => {
    vi.mocked(mockRecurringTasksDB.deleteRecurringTask).mockResolvedValue();

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "DELETE",
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockRecurringTasksDB.deleteRecurringTask).toHaveBeenCalledWith(
      "rt-1",
      "user-123",
    );
  });

  it("should return 401 if unauthenticated", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "DELETE",
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("should return 500 on internal error", async () => {
    vi.mocked(mockRecurringTasksDB.deleteRecurringTask).mockRejectedValue(
      new Error("fail"),
    );

    const request = new NextRequest(
      "http://localhost:3000/api/recurring-tasks/rt-1",
      {
        method: "DELETE",
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "rt-1" }),
    });

    expect(response.status).toBe(500);
  });
});
