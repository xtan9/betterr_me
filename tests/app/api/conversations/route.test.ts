import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted mocks
const { mockGetUser, mockGetUserConversations, mockCreateConversation } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetUserConversations: vi.fn(),
  mockCreateConversation: vi.fn(),
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
    getUserConversations = mockGetUserConversations;
    createConversation = mockCreateConversation;
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: mockLogError },
}));

import { GET, POST } from '@/app/api/conversations/route';

function makeRequest(method: string = 'GET', body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request('http://localhost:3000/api/conversations', init);
}

describe('GET /api/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it('returns conversations for authenticated user', async () => {
    const mockConversations = [
      { id: 'c1', title: 'Test', model: 'claude', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ];
    mockGetUserConversations.mockResolvedValue(mockConversations);

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.conversations).toEqual(mockConversations);
    expect(mockGetUserConversations).toHaveBeenCalledWith('user-123');
  });

  it('returns 500 on database error', async () => {
    mockGetUserConversations.mockRejectedValue(new Error('DB error'));

    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
  });
});

describe('POST /api/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest('POST'));
    expect(response.status).toBe(401);
  });

  it('creates a new conversation and returns 201', async () => {
    const mockConversation = { id: 'c1', user_id: 'user-123', title: null, model: 'default', created_at: '2026-01-01', updated_at: '2026-01-01' };
    mockCreateConversation.mockResolvedValue(mockConversation);

    const response = await POST(makeRequest('POST'));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.conversation).toEqual(mockConversation);
    expect(mockCreateConversation).toHaveBeenCalledWith({ user_id: 'user-123' });
  });

  it('creates conversation with model when model is provided in body', async () => {
    const mockConversation = { id: 'c1', user_id: 'user-123', title: null, model: 'claude-opus-4-6', created_at: '2026-01-01', updated_at: '2026-01-01' };
    mockCreateConversation.mockResolvedValue(mockConversation);

    const response = await POST(makeRequest('POST', { model: 'claude-opus-4-6' }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.conversation).toEqual(mockConversation);
    expect(mockCreateConversation).toHaveBeenCalledWith({ user_id: 'user-123', model: 'claude-opus-4-6' });
  });

  it('returns 500 on database error', async () => {
    mockCreateConversation.mockRejectedValue(new Error('DB error'));

    const response = await POST(makeRequest('POST'));
    expect(response.status).toBe(500);
  });
});
