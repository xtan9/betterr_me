import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/api-keys/route';
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
  getUserKeys: vi.fn(),
  getKeyCount: vi.fn(),
  createKey: vi.fn(),
  deleteKey: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  ApiKeysDB: class {
    constructor() {
      return mockApiKeysDB;
    }
  },
}));

vi.mock('@/lib/auth/api-key', () => ({
  generateApiKey: vi.fn(() => ({
    fullKey: 'brm_testfullkey1234567890abcdef',
    keyPrefix: 'brm_testfull',
    keyHash: 'a'.repeat(64),
  })),
}));

import { createClient } from '@/lib/supabase/server';

describe('GET /api/api-keys', () => {
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

  it('should return user keys', async () => {
    const mockKeys = [
      {
        id: 'key-1',
        user_id: 'user-123',
        name: 'My Key',
        key_prefix: 'brm_abcd1234',
        permissions: 'read_write',
        expires_at: null,
        last_used_at: null,
        created_at: '2026-03-25T10:00:00Z',
      },
    ];
    mockApiKeysDB.getUserKeys.mockResolvedValue(mockKeys);

    const request = new NextRequest('http://localhost:3000/api/api-keys');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.keys).toEqual(mockKeys);
    expect(mockApiKeysDB.getUserKeys).toHaveBeenCalledWith('user-123');
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/api-keys');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});

describe('POST /api/api-keys', () => {
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

  it('should create key and return full_key', async () => {
    mockApiKeysDB.getKeyCount.mockResolvedValue(0);
    const mockCreatedKey = {
      id: 'key-1',
      user_id: 'user-123',
      name: 'New Key',
      key_prefix: 'brm_testfull',
      permissions: 'read_write',
      expires_at: null,
      last_used_at: null,
      created_at: '2026-03-25T10:00:00Z',
    };
    mockApiKeysDB.createKey.mockResolvedValue(mockCreatedKey);

    const request = new NextRequest('http://localhost:3000/api/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Key', permissions: 'read_write' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.key.full_key).toBe('brm_testfullkey1234567890abcdef');
    expect(data.key.name).toBe('New Key');
  });

  it('should reject when max 10 keys reached', async () => {
    mockApiKeysDB.getKeyCount.mockResolvedValue(10);

    const request = new NextRequest('http://localhost:3000/api/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'Too Many Keys' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Maximum of 10 API keys allowed');
  });

  it('should validate name is required', async () => {
    const request = new NextRequest('http://localhost:3000/api/api-keys', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'Key' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
