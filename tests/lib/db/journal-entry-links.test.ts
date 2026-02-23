import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JournalEntryLinksDB } from '@/lib/db/journal-entry-links';
import { mockSupabaseClient } from '../../setup';
import type { JournalEntryLink, JournalEntryLinkInsert } from '@/lib/db/types';

describe('JournalEntryLinksDB', () => {
  const linksDB = new JournalEntryLinksDB(mockSupabaseClient as any);

  const mockLink: JournalEntryLink = {
    id: 'link-123',
    entry_id: 'entry-123',
    link_type: 'habit',
    link_id: 'habit-456',
    created_at: '2026-02-22T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLinksForEntry', () => {
    it('should return links for an entry', async () => {
      mockSupabaseClient.setMockResponse([mockLink]);

      const result = await linksDB.getLinksForEntry('entry-123');

      expect(result).toEqual([mockLink]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('journal_entry_links');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('entry_id', 'entry-123');
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });

    it('should return empty array when no links exist', async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await linksDB.getLinksForEntry('entry-123');

      expect(result).toEqual([]);
    });

    it('should throw on error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(linksDB.getLinksForEntry('entry-123')).rejects.toEqual({
        message: 'DB error',
      });
    });
  });

  describe('addLink', () => {
    it('should insert and return the link', async () => {
      mockSupabaseClient.setMockResponse(mockLink);

      const linkData: JournalEntryLinkInsert = {
        entry_id: 'entry-123',
        link_type: 'habit',
        link_id: 'habit-456',
      };

      const result = await linksDB.addLink(linkData);

      expect(result).toEqual(mockLink);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('journal_entry_links');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(linkData);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should throw on duplicate link', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Duplicate key', code: '23505' });

      await expect(
        linksDB.addLink({
          entry_id: 'entry-123',
          link_type: 'habit',
          link_id: 'habit-456',
        })
      ).rejects.toEqual({ message: 'Duplicate key', code: '23505' });
    });
  });

  describe('removeLink', () => {
    it('should delete by id and entry_id', async () => {
      mockSupabaseClient.setMockResponse(null);

      await linksDB.removeLink('link-123', 'entry-123');

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'link-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('entry_id', 'entry-123');
    });

    it('should throw on error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Not found' });

      await expect(
        linksDB.removeLink('link-123', 'entry-123')
      ).rejects.toEqual({ message: 'Not found' });
    });
  });
});
