import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted mocks
const { mockGetUser, mockDeleteConversation } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockDeleteConversation: vi.fn(),
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
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: mockLogError },
}));

import { DELETE } from '@/app/api/conversations/[id]/route';

function makeRequest() {
  return new Request('http://localhost:3000/api/conversations/conv-1', { method: 'DELETE' });
}

const params = Promise.resolve({ id: 'conv-1' });

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
