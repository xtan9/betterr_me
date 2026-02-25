import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/journal/route';
import { NextRequest } from 'next/server';

const { mockEnsureProfile } = vi.hoisted(() => ({
  mockEnsureProfile: vi.fn(),
}));

const mockJournalDB = {
  upsertEntry: vi.fn(),
  getEntryByDate: vi.fn(),
  getTimeline: vi.fn(),
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

vi.mock('@/lib/db/ensure-profile', () => ({
  ensureProfile: mockEnsureProfile,
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

describe('POST /api/journal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
        })),
      },
    } as any);
    mockEnsureProfile.mockResolvedValue(undefined);
  });

  it('should return 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/journal', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '2026-02-22',
        title: 'Test',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('should succeed with default empty title when title omitted', async () => {
    mockJournalDB.upsertEntry.mockResolvedValue(mockEntry);

    const request = new NextRequest('http://localhost:3000/api/journal', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '2026-02-22',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockJournalDB.upsertEntry).toHaveBeenCalledWith(
      expect.objectContaining({ title: '' })
    );
  });

  it('should return 400 for invalid date format', async () => {
    const request = new NextRequest('http://localhost:3000/api/journal', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '22-02-2026',
        title: 'Test',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should call upsertEntry with correct data and return 201', async () => {
    mockJournalDB.upsertEntry.mockResolvedValue(mockEntry);

    const request = new NextRequest('http://localhost:3000/api/journal', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '2026-02-22',
        title: 'Test Entry',
        content: { type: 'doc', content: [] },
        mood: 4,
        word_count: 5,
        tags: ['journal'],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.entry).toEqual(mockEntry);
    expect(mockJournalDB.upsertEntry).toHaveBeenCalledWith({
      user_id: 'user-123',
      entry_date: '2026-02-22',
      title: 'Test Entry',
      content: { type: 'doc', content: [] },
      mood: 4,
      word_count: 5,
      tags: ['journal'],
      prompt_key: null,
    });
  });

  it('should set default mood=null, word_count=0, tags=[]', async () => {
    mockJournalDB.upsertEntry.mockResolvedValue(mockEntry);

    const request = new NextRequest('http://localhost:3000/api/journal', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '2026-02-22',
        title: 'Minimal Entry',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    expect(mockJournalDB.upsertEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        mood: null,
        word_count: 0,
        tags: [],
        prompt_key: null,
      })
    );
  });

  it('should accept mood: null in POST body', async () => {
    mockJournalDB.upsertEntry.mockResolvedValue({ ...mockEntry, mood: null });

    const request = new NextRequest('http://localhost:3000/api/journal', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '2026-02-22',
        content: { type: 'doc', content: [] },
        mood: null,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    expect(mockJournalDB.upsertEntry).toHaveBeenCalledWith(
      expect.objectContaining({ mood: null })
    );
  });

  it('should call ensureProfile before upserting', async () => {
    mockJournalDB.upsertEntry.mockResolvedValue(mockEntry);

    const request = new NextRequest('http://localhost:3000/api/journal', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '2026-02-22',
        title: 'Test',
      }),
    });

    await POST(request);
    expect(mockEnsureProfile).toHaveBeenCalled();
  });
});

describe('GET /api/journal', () => {
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

  it('should return 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/journal?date=2026-02-22');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('should return 400 when date param missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/journal');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('date query parameter is required');
  });

  it('should return 400 for invalid date format', async () => {
    const request = new NextRequest('http://localhost:3000/api/journal?date=not-a-date');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid date format');
  });

  it('should return entry for valid date', async () => {
    mockJournalDB.getEntryByDate.mockResolvedValue(mockEntry);

    const request = new NextRequest('http://localhost:3000/api/journal?date=2026-02-22');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toEqual(mockEntry);
    expect(mockJournalDB.getEntryByDate).toHaveBeenCalledWith('user-123', '2026-02-22');
  });

  it('should return null entry when no entry exists for date', async () => {
    mockJournalDB.getEntryByDate.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/journal?date=2026-02-22');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entry).toBeNull();
  });

  it('should return entries array with hasMore flag in timeline mode', async () => {
    const entries = [mockEntry];
    mockJournalDB.getTimeline.mockResolvedValue(entries);

    const request = new NextRequest('http://localhost:3000/api/journal?mode=timeline&limit=10');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toEqual(entries);
    expect(data.hasMore).toBe(false); // 1 entry < 10 limit
    expect(mockJournalDB.getTimeline).toHaveBeenCalledWith('user-123', 10, undefined);
  });

  it('should pass cursor to timeline query', async () => {
    mockJournalDB.getTimeline.mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost:3000/api/journal?mode=timeline&cursor=2026-02-01'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockJournalDB.getTimeline).toHaveBeenCalledWith('user-123', 10, '2026-02-01');
  });

  it('should set hasMore=true when entries.length equals limit', async () => {
    const tenEntries = Array.from({ length: 10 }, (_, i) => ({
      ...mockEntry,
      id: `entry-${i}`,
    }));
    mockJournalDB.getTimeline.mockResolvedValue(tenEntries);

    const request = new NextRequest('http://localhost:3000/api/journal?mode=timeline&limit=10');
    const response = await GET(request);
    const data = await response.json();

    expect(data.hasMore).toBe(true);
  });

  it('should return 500 when getEntryByDate throws', async () => {
    mockJournalDB.getEntryByDate.mockRejectedValue(new Error('DB error'));

    const request = new NextRequest('http://localhost:3000/api/journal?date=2026-02-22');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to fetch journal entry');
  });

  it('should return 500 when getTimeline throws', async () => {
    mockJournalDB.getTimeline.mockRejectedValue(new Error('DB error'));

    const request = new NextRequest('http://localhost:3000/api/journal?mode=timeline');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to fetch journal entry');
  });
});

describe('POST /api/journal - 500 error paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: 'user-123', email: 'test@example.com' } },
        })),
      },
    } as any);
    mockEnsureProfile.mockResolvedValue(undefined);
  });

  it('should return 500 when upsertEntry throws', async () => {
    mockJournalDB.upsertEntry.mockRejectedValue(new Error('DB error'));

    const request = new NextRequest('http://localhost:3000/api/journal', {
      method: 'POST',
      body: JSON.stringify({
        entry_date: '2026-02-22',
        title: 'Test',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to save journal entry');
  });
});
