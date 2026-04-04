import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted mocks
const { mockGetUser, mockGetConversation, mockGetMessagesByConversation, mockCreateMessage, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetConversation: vi.fn(),
  mockGetMessagesByConversation: vi.fn(),
  mockCreateMessage: vi.fn(),
  mockFrom: vi.fn(),
}));

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

vi.mock('@/lib/db', () => ({
  ConversationsDB: class {
    getConversation = mockGetConversation;
  },
  ChatMessagesDB: class {
    getMessagesByConversation = mockGetMessagesByConversation;
    createMessage = mockCreateMessage;
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: mockLogError },
}));

import { GET, POST } from '@/app/api/conversations/[id]/messages/route';

function makeGetRequest() {
  return new Request('http://localhost:3000/api/conversations/conv-1/messages', { method: 'GET' });
}

function makePostRequest(body: unknown) {
  return new Request('http://localhost:3000/api/conversations/conv-1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'conv-1' });

const mockConversation = { id: 'conv-1', user_id: 'user-123', title: null, model: 'claude', created_at: '2026-01-01', updated_at: '2026-01-01' };

describe('GET /api/conversations/[id]/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockGetConversation.mockResolvedValue(mockConversation);

    // Setup chain for supabase.from().update().eq().eq()
    const eqInner = vi.fn().mockReturnValue({ data: null, error: null });
    const eqOuter = vi.fn().mockReturnValue({ eq: eqInner });
    const update = vi.fn().mockReturnValue({ eq: eqOuter });
    mockFrom.mockReturnValue({ update });
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(makeGetRequest(), { params });
    expect(response.status).toBe(401);
  });

  it('returns 404 if conversation not found', async () => {
    mockGetConversation.mockResolvedValue(null);

    const response = await GET(makeGetRequest(), { params });
    expect(response.status).toBe(404);
  });

  it('returns 404 if conversation belongs to another user', async () => {
    mockGetConversation.mockResolvedValue({ ...mockConversation, user_id: 'other-user' });

    const response = await GET(makeGetRequest(), { params });
    expect(response.status).toBe(404);
  });

  it('returns messages for owned conversation', async () => {
    const mockMessages = [
      { id: 'm1', conversation_id: 'conv-1', role: 'user', content: 'hello', created_at: '2026-01-01T00:00:00Z' },
      { id: 'm2', conversation_id: 'conv-1', role: 'assistant', content: 'hi', created_at: '2026-01-01T00:00:01Z' },
    ];
    mockGetMessagesByConversation.mockResolvedValue(mockMessages);

    const response = await GET(makeGetRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.messages).toEqual(mockMessages);
    expect(mockGetMessagesByConversation).toHaveBeenCalledWith('conv-1');
  });
});

describe('POST /api/conversations/[id]/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockGetConversation.mockResolvedValue(mockConversation);

    // Setup chain for supabase.from().update().eq().eq()
    const eqInner = vi.fn().mockReturnValue({ data: null, error: null });
    const eqOuter = vi.fn().mockReturnValue({ eq: eqInner });
    const update = vi.fn().mockReturnValue({ eq: eqOuter });
    mockFrom.mockReturnValue({ update });
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makePostRequest({ role: 'user', content: 'hi' }), { params });
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid role', async () => {
    const response = await POST(makePostRequest({ role: 'system', content: 'hi' }), { params });
    expect(response.status).toBe(400);
  });

  it('returns 400 for empty content', async () => {
    const response = await POST(makePostRequest({ role: 'user', content: '' }), { params });
    expect(response.status).toBe(400);
  });

  it('saves a user message and returns 201', async () => {
    const savedMessage = { id: 'm1', conversation_id: 'conv-1', role: 'user', content: 'hi', created_at: '2026-01-01' };
    mockCreateMessage.mockResolvedValue(savedMessage);

    const response = await POST(makePostRequest({ role: 'user', content: 'hi' }), { params });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.message).toEqual(savedMessage);
    expect(mockCreateMessage).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      role: 'user',
      content: 'hi',
    });
  });

  it('saves an assistant message and returns 201', async () => {
    const savedMessage = { id: 'm2', conversation_id: 'conv-1', role: 'assistant', content: 'Hello!', created_at: '2026-01-01' };
    mockCreateMessage.mockResolvedValue(savedMessage);

    const response = await POST(makePostRequest({ role: 'assistant', content: 'Hello!' }), { params });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.message).toEqual(savedMessage);
  });

  it('returns 404 if conversation not owned by user', async () => {
    mockGetConversation.mockResolvedValue({ ...mockConversation, user_id: 'other-user' });

    const response = await POST(makePostRequest({ role: 'user', content: 'hi' }), { params });
    expect(response.status).toBe(404);
  });
});
