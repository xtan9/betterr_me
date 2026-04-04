import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted mocks
const { mockGetUser, mockGetConversation, mockUpdateConversation, mockGenerateText } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetConversation: vi.fn(),
  mockUpdateConversation: vi.fn(),
  mockGenerateText: vi.fn(),
}));

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/lib/db', () => ({
  ConversationsDB: class {
    getConversation = mockGetConversation;
    updateConversation = mockUpdateConversation;
  },
}));

vi.mock('ai', () => ({
  generateText: mockGenerateText,
}));

vi.mock('@/lib/ai/provider', () => ({
  llmProvider: vi.fn((model: string) => `mock-model:${model}`),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: mockLogError },
}));

import { POST } from '@/app/api/conversations/[id]/title/route';

function makeRequest(body: unknown) {
  return new Request('http://localhost:3000/api/conversations/conv-1/title', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'conv-1' });

const mockConversation = { id: 'conv-1', user_id: 'user-123', title: null, model: 'claude', created_at: '2026-01-01', updated_at: '2026-01-01' };

describe('POST /api/conversations/[id]/title', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LLM_API_KEY = 'test-key';
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockGetConversation.mockResolvedValue(mockConversation);
    mockGenerateText.mockResolvedValue({ text: '  Test Title  ' });
    mockUpdateConversation.mockResolvedValue({ ...mockConversation, title: 'Test Title' });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest({ userMessage: 'hi', assistantMessage: 'hello' }), { params });
    expect(response.status).toBe(401);
  });

  it('returns 503 if LLM_API_KEY is not configured', async () => {
    delete process.env.LLM_API_KEY;

    const response = await POST(makeRequest({ userMessage: 'hi', assistantMessage: 'hello' }), { params });
    expect(response.status).toBe(503);
  });

  it('returns 400 for invalid body', async () => {
    const response = await POST(makeRequest({ userMessage: '' }), { params });
    expect(response.status).toBe(400);
  });

  it('returns 404 if conversation not owned by user', async () => {
    mockGetConversation.mockResolvedValue({ ...mockConversation, user_id: 'other-user' });

    const response = await POST(makeRequest({ userMessage: 'hi', assistantMessage: 'hello' }), { params });
    expect(response.status).toBe(404);
  });

  it('generates title and updates conversation', async () => {
    const response = await POST(makeRequest({ userMessage: 'How do I cook pasta?', assistantMessage: 'Here is how...' }), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.title).toBe('Test Title');
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 30,
      }),
    );
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', 'user-123', { title: 'Test Title' });
  });

  it('returns 500 on LLM error', async () => {
    mockGenerateText.mockRejectedValue(new Error('LLM failed'));

    const response = await POST(makeRequest({ userMessage: 'hi', assistantMessage: 'hello' }), { params });
    expect(response.status).toBe(500);
  });
});
