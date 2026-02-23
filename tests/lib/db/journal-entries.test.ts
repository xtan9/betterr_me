import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JournalEntriesDB } from '@/lib/db/journal-entries';
import { mockSupabaseClient } from '../../setup';
import type { JournalEntry, JournalEntryInsert } from '@/lib/db/types';

describe('JournalEntriesDB', () => {
  const mockUserId = 'user-123';
  const journalDB = new JournalEntriesDB(mockSupabaseClient as any);

  const mockEntry: JournalEntry = {
    id: 'entry-123',
    user_id: mockUserId,
    entry_date: '2026-02-22',
    title: 'Test Entry',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
    mood: 4,
    word_count: 1,
    tags: ['test'],
    prompt_key: null,
    created_at: '2026-02-22T10:00:00Z',
    updated_at: '2026-02-22T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertEntry', () => {
    it('should call supabase upsert with onConflict', async () => {
      mockSupabaseClient.setMockResponse(mockEntry);

      const insertData: JournalEntryInsert = {
        user_id: mockUserId,
        entry_date: '2026-02-22',
        title: 'Test Entry',
        content: { type: 'doc', content: [] },
        mood: 4,
        word_count: 1,
        tags: ['test'],
        prompt_key: null,
      };

      const result = await journalDB.upsertEntry(insertData);

      expect(result).toEqual(mockEntry);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('journal_entries');
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(insertData, {
        onConflict: 'user_id,entry_date',
      });
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should throw on Supabase error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error', code: 'ERROR' });

      await expect(
        journalDB.upsertEntry({
          user_id: mockUserId,
          entry_date: '2026-02-22',
          title: 'Test',
          content: { type: 'doc', content: [] },
          mood: 3,
          word_count: 0,
          tags: [],
          prompt_key: null,
        })
      ).rejects.toEqual({ message: 'DB error', code: 'ERROR' });
    });
  });

  describe('getEntryByDate', () => {
    it('should call maybeSingle and return data', async () => {
      // For maybeSingle, the mock thenable resolves with data
      mockSupabaseClient.setMockResponse(mockEntry);

      const result = await journalDB.getEntryByDate(mockUserId, '2026-02-22');

      expect(result).toEqual(mockEntry);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('journal_entries');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('entry_date', '2026-02-22');
    });

    it('should return null when no entry exists', async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await journalDB.getEntryByDate(mockUserId, '2026-02-22');

      expect(result).toBeNull();
    });

    it('should throw on error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(
        journalDB.getEntryByDate(mockUserId, '2026-02-22')
      ).rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('getEntry', () => {
    it('should call single and return data', async () => {
      mockSupabaseClient.setMockResponse(mockEntry);

      const result = await journalDB.getEntry('entry-123', mockUserId);

      expect(result).toEqual(mockEntry);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('journal_entries');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'entry-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should return null for PGRST116 error code', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'PGRST116' });

      const result = await journalDB.getEntry('nonexistent', mockUserId);

      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'OTHER', message: 'DB error' });

      await expect(
        journalDB.getEntry('entry-123', mockUserId)
      ).rejects.toEqual({ code: 'OTHER', message: 'DB error' });
    });
  });

  describe('updateEntry', () => {
    it('should call update with correct filters', async () => {
      const updates = { title: 'Updated Title', mood: 5 };
      const updatedEntry = { ...mockEntry, ...updates };
      mockSupabaseClient.setMockResponse(updatedEntry);

      const result = await journalDB.updateEntry('entry-123', mockUserId, updates);

      expect(result).toEqual(updatedEntry);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'entry-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should throw on error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Not found' });

      await expect(
        journalDB.updateEntry('entry-123', mockUserId, { title: 'New' })
      ).rejects.toEqual({ message: 'Not found' });
    });
  });

  describe('deleteEntry', () => {
    it('should call delete with correct filters', async () => {
      mockSupabaseClient.setMockResponse(null);

      await journalDB.deleteEntry('entry-123', mockUserId);

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'entry-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should throw on error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'FK constraint' });

      await expect(
        journalDB.deleteEntry('entry-123', mockUserId)
      ).rejects.toEqual({ message: 'FK constraint' });
    });
  });

  describe('getCalendarMonth', () => {
    it('should select only entry_date, mood, title', async () => {
      const calendarData = [
        { entry_date: '2026-02-01', mood: 4, title: 'Day 1' },
        { entry_date: '2026-02-15', mood: 3, title: 'Day 15' },
      ];
      mockSupabaseClient.setMockResponse(calendarData);

      const result = await journalDB.getCalendarMonth(mockUserId, 2026, 2);

      expect(result).toEqual(calendarData);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('journal_entries');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('entry_date, mood, title');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith('entry_date', '2026-02-01');
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('entry_date', '2026-02-31');
    });

    it('should filter by date range for given month', async () => {
      mockSupabaseClient.setMockResponse([]);

      await journalDB.getCalendarMonth(mockUserId, 2026, 12);

      expect(mockSupabaseClient.gte).toHaveBeenCalledWith('entry_date', '2026-12-01');
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('entry_date', '2026-12-31');
    });

    it('should return empty array when no entries', async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await journalDB.getCalendarMonth(mockUserId, 2026, 3);

      expect(result).toEqual([]);
    });

    it('should throw on error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(
        journalDB.getCalendarMonth(mockUserId, 2026, 2)
      ).rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('getTimeline', () => {
    it('should order by entry_date DESC with limit', async () => {
      const entries = [mockEntry];
      mockSupabaseClient.setMockResponse(entries);

      const result = await journalDB.getTimeline(mockUserId, 10);

      expect(result).toEqual(entries);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('journal_entries');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('entry_date', { ascending: false });
    });

    it('should apply cursor filter when provided', async () => {
      mockSupabaseClient.setMockResponse([]);

      await journalDB.getTimeline(mockUserId, 10, '2026-02-01');

      expect(mockSupabaseClient.lt).toHaveBeenCalledWith('entry_date', '2026-02-01');
    });

    it('should return empty array when no entries', async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await journalDB.getTimeline(mockUserId);

      expect(result).toEqual([]);
    });
  });
});
