import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from '@/app/api/api-keys/[id]/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
      })),
    },
  })),
}));

const mockApiKeysDB = {
  deleteKey: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  ApiKeysDB: class {
    constructor() {
      return mockApiKeysDB;
    }
  },
}));

import { createClient } from '@/lib/supabase/server';

describe('DELETE /api/api-keys/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
        })),
      },
    } as any);
  });

  it('should delete a key', async () => {
    mockApiKeysDB.deleteKey.mockResolvedValue(undefined);

    const request = new NextRequest(
      'http://localhost:3000/api/api-keys/key-1',
      { method: 'DELETE' }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'key-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockApiKeysDB.deleteKey).toHaveBeenCalledWith('key-1', 'user-123');
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest(
      'http://localhost:3000/api/api-keys/key-1',
      { method: 'DELETE' }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'key-1' }),
    });

    expect(response.status).toBe(401);
  });

  it('should return 500 on database error', async () => {
    mockApiKeysDB.deleteKey.mockRejectedValue(new Error('DB error'));

    const request = new NextRequest(
      'http://localhost:3000/api/api-keys/key-1',
      { method: 'DELETE' }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'key-1' }),
    });

    expect(response.status).toBe(500);
  });
});
