import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUser, mockCreateInitialTurn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCreateInitialTurn: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } }),
  ),
}));

vi.mock("@/lib/db", () => ({
  ConversationsDB: class {
    createInitialTurn = mockCreateInitialTurn;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn() },
}));

import { POST } from "@/app/api/conversations/turns/route";

const initialTurn = {
  turnId: "turn-1",
  userMessage: "Help me make a realistic weekly plan for my goals",
  assistantMessage: "Let's build a plan around your available time.",
  assistantModel: "gpt-5.3-codex-spark",
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/conversations/turns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/conversations/turns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("creates the first completed turn and returns its stable conversation id", async () => {
    mockCreateInitialTurn.mockResolvedValue({
      outcome: "saved",
      conversationId: "conv-1",
      title: "Help me make a realistic weekly plan for…",
      messages: [
        { id: "message-1", role: "user" },
        { id: "message-2", role: "assistant", model: "gpt-5.3-codex-spark" },
      ],
    });

    const response = await POST(makeRequest(initialTurn));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        outcome: "saved",
        conversationId: "conv-1",
      }),
    );
    expect(mockCreateInitialTurn).toHaveBeenCalledWith({
      userId: "user-1",
      turnId: "turn-1",
      userContent: initialTurn.userMessage,
      assistantContent: initialTurn.assistantMessage,
      assistantModel: "gpt-5.3-codex-spark",
      title: "Help me make a realistic weekly plan for…",
    });
  });

  it("returns an already-saved retry without changing the conversation id", async () => {
    mockCreateInitialTurn.mockResolvedValue({
      outcome: "already_saved",
      conversationId: "conv-1",
      title: "Help me make a realistic weekly plan for…",
      messages: [],
    });

    const response = await POST(makeRequest(initialTurn));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        outcome: "already_saved",
        conversationId: "conv-1",
      }),
    );
  });

  it("rejects unauthenticated requests before persistence", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest(initialTurn));

    expect(response.status).toBe(401);
    expect(mockCreateInitialTurn).not.toHaveBeenCalled();
  });

  it("rejects an unsupported model before persistence", async () => {
    const response = await POST(
      makeRequest({ ...initialTurn, assistantModel: "unknown-model" }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateInitialTurn).not.toHaveBeenCalled();
  });

  it("reports a single failed outcome when the lifecycle cannot be saved", async () => {
    mockCreateInitialTurn.mockRejectedValue(new Error("atomic write failed"));

    const response = await POST(makeRequest(initialTurn));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      outcome: "failed",
      error: "Failed to save initial conversation turn",
    });
  });
});
