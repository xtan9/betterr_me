import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUser, mockGetConversation, mockSaveCompletedTurn } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockGetConversation: vi.fn(),
    mockSaveCompletedTurn: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    }),
  ),
}));

vi.mock("@/lib/db", () => ({
  ConversationsDB: class {
    getConversation = mockGetConversation;
  },
  ChatMessagesDB: class {
    saveCompletedTurn = mockSaveCompletedTurn;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn() },
}));

import { POST } from "@/app/api/conversations/[id]/turns/route";

const params = Promise.resolve({ id: "conv-1" });

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/conversations/conv-1/turns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const completedTurn = {
  turnId: "turn-1",
  userMessage: "How am I doing?",
  assistantMessage: "You are making progress.",
  assistantModel: "gpt-5.3-codex-spark",
};

describe("POST /api/conversations/[id]/turns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockGetConversation.mockResolvedValue({
      id: "conv-1",
      user_id: "user-1",
    });
  });

  it("saves both ordered messages with assistant model metadata", async () => {
    const messages = [
      { id: "message-1", role: "user", content: completedTurn.userMessage },
      {
        id: "message-2",
        role: "assistant",
        content: completedTurn.assistantMessage,
        model: completedTurn.assistantModel,
      },
    ];
    mockSaveCompletedTurn.mockResolvedValue({
      outcome: "saved",
      messages,
    });

    const response = await POST(makeRequest(completedTurn), { params });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      outcome: "saved",
      messages,
    });
    expect(mockSaveCompletedTurn).toHaveBeenCalledWith({
      conversationId: "conv-1",
      turnId: "turn-1",
      userContent: "How am I doing?",
      assistantContent: "You are making progress.",
      assistantModel: "gpt-5.3-codex-spark",
    });
  });

  it("rejects unauthenticated requests without attempting persistence", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest(completedTurn), { params });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      outcome: "failed",
      error: "Unauthorized",
    });
    expect(mockSaveCompletedTurn).not.toHaveBeenCalled();
  });

  it("rejects an incomplete turn without attempting persistence", async () => {
    const response = await POST(
      makeRequest({ ...completedTurn, assistantMessage: "" }),
      { params },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).outcome).toBe("failed");
    expect(mockSaveCompletedTurn).not.toHaveBeenCalled();
  });

  it("rejects a missing conversation without attempting persistence", async () => {
    mockGetConversation.mockResolvedValue(null);

    const response = await POST(makeRequest(completedTurn), { params });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      outcome: "failed",
      error: "Conversation not found",
    });
    expect(mockSaveCompletedTurn).not.toHaveBeenCalled();
  });

  it("rejects a conversation owned by another user", async () => {
    mockGetConversation.mockResolvedValue({
      id: "conv-1",
      user_id: "user-2",
    });

    const response = await POST(makeRequest(completedTurn), { params });

    expect(response.status).toBe(404);
    expect(mockSaveCompletedTurn).not.toHaveBeenCalled();
  });

  it("reports a retry as already saved without creating another turn", async () => {
    const messages = [
      { id: "message-1", role: "user", content: completedTurn.userMessage },
      {
        id: "message-2",
        role: "assistant",
        content: completedTurn.assistantMessage,
        model: completedTurn.assistantModel,
      },
    ];
    mockSaveCompletedTurn
      .mockResolvedValueOnce({ outcome: "saved", messages })
      .mockResolvedValueOnce({ outcome: "already_saved", messages });

    const firstResponse = await POST(makeRequest(completedTurn), { params });
    const retryResponse = await POST(makeRequest(completedTurn), { params });

    expect(firstResponse.status).toBe(201);
    expect(retryResponse.status).toBe(200);
    await expect(retryResponse.json()).resolves.toEqual({
      outcome: "already_saved",
      messages,
    });
  });

  it("reports one failed outcome when the complete turn cannot be saved", async () => {
    mockSaveCompletedTurn.mockRejectedValue(new Error("atomic insert failed"));

    const response = await POST(makeRequest(completedTurn), { params });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      outcome: "failed",
      error: "Failed to save completed turn",
    });
  });
});
