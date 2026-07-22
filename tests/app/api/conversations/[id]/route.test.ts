import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted mocks
const { mockGetUser, mockDeleteConversation, mockUpdateConversation } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockDeleteConversation: vi.fn(),
  mockUpdateConversation: vi.fn(),
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
    deleteConversation = mockDeleteConversation;
    updateConversation = mockUpdateConversation;
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: mockLogError },
}));

import { DELETE, PATCH } from '@/app/api/conversations/[id]/route';

function makeRequest() {
  return new Request('http://localhost:3000/api/conversations/conv-1', { method: 'DELETE' });
}

const params = Promise.resolve({ id: 'conv-1' });

function makePatchRequest(body: unknown) {
  return new Request('http://localhost:3000/api/conversations/conv-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/conversations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(makePatchRequest({ title: 'New Title' }), { params });
    expect(response.status).toBe(401);
  });

  it('returns 400 when no valid fields provided (empty body)', async () => {
    const response = await PATCH(makePatchRequest({}), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('No valid fields to update');
  });

  it('returns 400 for empty title', async () => {
    const response = await PATCH(makePatchRequest({ title: '' }), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Title must be 1-200 characters');
  });

  it('returns 400 for whitespace-only title', async () => {
    const response = await PATCH(makePatchRequest({ title: '   ' }), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Title must be 1-200 characters');
  });

  it('returns 400 for invalid model (not in allowed list)', async () => {
    const response = await PATCH(makePatchRequest({ model: 'gpt-4' }), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid model');
  });

  it('succeeds with valid title', async () => {
    mockUpdateConversation.mockResolvedValue(undefined);

    const response = await PATCH(makePatchRequest({ title: 'Updated Title' }), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', 'user-123', { title: 'Updated Title' });
  });

  it('succeeds with valid model', async () => {
    mockUpdateConversation.mockResolvedValue(undefined);

    const response = await PATCH(makePatchRequest({ model: 'gpt-5.6-sol' }), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', 'user-123', { model: 'gpt-5.6-sol' });
  });

  it('returns 500 on database error', async () => {
    mockUpdateConversation.mockRejectedValue(new Error('DB error'));

    const response = await PATCH(makePatchRequest({ title: 'Test' }), { params });
    expect(response.status).toBe(500);
    expect(mockLogError).toHaveBeenCalled();
  });
});

describe('DELETE /api/conversations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(makeRequest(), { params });
    expect(response.status).toBe(401);
  });

  it('deletes conversation and returns 204', async () => {
    mockDeleteConversation.mockResolvedValue(undefined);

    const response = await DELETE(makeRequest(), { params });

    expect(response.status).toBe(204);
    expect(mockDeleteConversation).toHaveBeenCalledWith('conv-1', 'user-123');
  });

  it('returns 500 on database error', async () => {
    mockDeleteConversation.mockRejectedValue(new Error('DB error'));

    const response = await DELETE(makeRequest(), { params });
    expect(response.status).toBe(500);
  });
});
