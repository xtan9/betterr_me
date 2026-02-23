import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from '@/app/api/journal/[id]/route';
import { NextRequest } from 'next/server';

const mockJournalDB = {
  getEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
      })),
    },
  })),
}));

vi.mock('@/lib/db', () => ({
  JournalEntriesDB: class {
    constructor() {
      return mockJournalDB;
    }
  },
}));

import { createClient } from '@/lib/supabase/server';

const mockEntry = {
  id: 'entry-123',
  user_id: 'user-123',
  entry_date: '2026-02-22',
  title: 'Test Entry',
  content: { type: 'doc', content: [] },
  mood: 3,
  word_count: 0,
  tags: [],
  prompt_key: null,
  created_at: '2026-02-22T10:00:00Z',
  updated_at: '2026-02-22T10:00:00Z',
};

const makeParams = (id: string) => Promise.resolve({ id });

describe('GET /api/journal/[id]', () => {
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

  it('should return 401 unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/journal/entry-123');
    const response = await GET(request, { params: makeParams('entry-123') });

    expect(response.status).toBe(401);
  });

  it('should return 404 when entry not found', async () => {
    mockJournalDB.getEntry.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/journal/nonexistent');
    const response = await GET(request, { params: makeParams('nonexistent') });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Journal entry not found');
  });

  it('should return entry for valid ID', async () => {
    mockJournalDB.getEntry.mockResolvedValue(mockEntry);

    const request = new NextRequest('http://localhost:3000/api/journal/entry-123');
    const response = await GET(request, { params: makeParams('entry-123') });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toEqual(mockEntry);
    expect(mockJournalDB.getEntry).toHaveBeenCalledWith('entry-123', 'user-123');
  });
});

describe('PATCH /api/journal/[id]', () => {
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

  it('should return 401 unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/journal/entry-123', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const response = await PATCH(request, { params: makeParams('entry-123') });

    expect(response.status).toBe(401);
  });

  it('should return 400 for empty update body', async () => {
    const request = new NextRequest('http://localhost:3000/api/journal/entry-123', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    const response = await PATCH(request, { params: makeParams('entry-123') });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should update entry and return 200', async () => {
    const updatedEntry = { ...mockEntry, title: 'Updated Title' };
    mockJournalDB.updateEntry.mockResolvedValue(updatedEntry);

    const request = new NextRequest('http://localhost:3000/api/journal/entry-123', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title' }),
    });
    const response = await PATCH(request, { params: makeParams('entry-123') });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toEqual(updatedEntry);
    expect(mockJournalDB.updateEntry).toHaveBeenCalledWith(
      'entry-123',
      'user-123',
      { title: 'Updated Title' }
    );
  });

  it('should return 404 for PGRST116 error', async () => {
    mockJournalDB.updateEntry.mockRejectedValue({ code: 'PGRST116' });

    const request = new NextRequest('http://localhost:3000/api/journal/entry-123', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
    const response = await PATCH(request, { params: makeParams('entry-123') });

    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/journal/[id]', () => {
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

  it('should return 401 unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/journal/entry-123', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: makeParams('entry-123') });

    expect(response.status).toBe(401);
  });

  it('should delete entry and return 200', async () => {
    mockJournalDB.deleteEntry.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost:3000/api/journal/entry-123', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: makeParams('entry-123') });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockJournalDB.deleteEntry).toHaveBeenCalledWith('entry-123', 'user-123');
  });
});
