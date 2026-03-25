import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeysDB } from '@/lib/db/api-keys';
import { mockSupabaseClient } from '../../setup';
import type { ApiKey, ApiKeyInsert, ApiKeyPublic } from '@/lib/db/types';

describe('ApiKeysDB', () => {
  const mockUserId = 'user-123';
  const apiKeysDB = new ApiKeysDB(mockSupabaseClient as any);

  const mockKeyPublic: ApiKeyPublic = {
    id: 'key-1',
    user_id: mockUserId,
    name: 'My Key',
    key_prefix: 'brm_abcd1234',
    permissions: 'read_write',
    expires_at: null,
    last_used_at: null,
    created_at: '2026-03-25T10:00:00Z',
  };

  const mockKey: ApiKey = {
    ...mockKeyPublic,
    key_hash: 'a'.repeat(64),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserKeys', () => {
    it('should return keys without key_hash', async () => {
      mockSupabaseClient.setMockResponse([mockKeyPublic]);

      const keys = await apiKeysDB.getUserKeys(mockUserId);

      expect(keys).toEqual([mockKeyPublic]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('api_keys');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('should handle database errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(apiKeysDB.getUserKeys(mockUserId)).rejects.toEqual({
        message: 'DB error',
      });
    });
  });

  describe('getKeyByHash', () => {
    it('should return key when found', async () => {
      mockSupabaseClient.setMockResponse(mockKey);

      const key = await apiKeysDB.getKeyByHash('a'.repeat(64));

      expect(key).toEqual(mockKey);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('api_keys');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        'key_hash',
        'a'.repeat(64)
      );
      expect(mockSupabaseClient.maybeSingle).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      mockSupabaseClient.setMockResponse(null);

      const key = await apiKeysDB.getKeyByHash('nonexistent');

      expect(key).toBeNull();
    });

    it('should handle database errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(apiKeysDB.getKeyByHash('hash')).rejects.toEqual({
        message: 'DB error',
      });
    });
  });

  describe('getKeyCount', () => {
    it('should return count', async () => {
      mockSupabaseClient.setMockResponse(null, null, 5);

      const count = await apiKeysDB.getKeyCount(mockUserId);

      expect(count).toBe(5);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('api_keys');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*', {
        count: 'exact',
        head: true,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should return 0 when count is null', async () => {
      mockSupabaseClient.setMockResponse(null, null, null);

      const count = await apiKeysDB.getKeyCount(mockUserId);

      expect(count).toBe(0);
    });

    it('should handle database errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(apiKeysDB.getKeyCount(mockUserId)).rejects.toEqual({
        message: 'DB error',
      });
    });
  });

  describe('createKey', () => {
    it('should insert and return key', async () => {
      const insert: ApiKeyInsert = {
        user_id: mockUserId,
        name: 'New Key',
        key_hash: 'b'.repeat(64),
        key_prefix: 'brm_newkey12',
        permissions: 'read_write',
      };

      mockSupabaseClient.setMockResponse(mockKeyPublic);

      const created = await apiKeysDB.createKey(insert);

      expect(created).toEqual(mockKeyPublic);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(insert);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should handle creation errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Duplicate key' });

      const insert: ApiKeyInsert = {
        user_id: mockUserId,
        name: 'Key',
        key_hash: 'c'.repeat(64),
        key_prefix: 'brm_dupkey12',
        permissions: 'read',
      };

      await expect(apiKeysDB.createKey(insert)).rejects.toEqual({
        message: 'Duplicate key',
      });
    });
  });

  describe('deleteKey', () => {
    it('should delete by id and user_id', async () => {
      mockSupabaseClient.setMockResponse(null);

      await apiKeysDB.deleteKey('key-1', mockUserId);

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'key-1');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should handle deletion errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'FK constraint' });

      await expect(apiKeysDB.deleteKey('key-1', mockUserId)).rejects.toEqual({
        message: 'FK constraint',
      });
    });
  });
});
