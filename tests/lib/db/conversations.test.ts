import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationsDB } from '@/lib/db/conversations';
import { mockSupabaseClient } from '../../setup';
import type { Conversation } from '@/lib/db/types';

describe('ConversationsDB', () => {
  let db: ConversationsDB;
  const mockUserId = 'user-123';
  const mockConversation: Conversation = {
    id: 'conv-123',
    user_id: mockUserId,
    title: 'Test Conversation',
    model: 'claude-sonnet-4-6',
    created_at: '2026-04-02T10:00:00Z',
    updated_at: '2026-04-02T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db = new ConversationsDB(mockSupabaseClient as any);
  });

  describe('getUserConversations', () => {
    it('should fetch conversations for a user ordered by updated_at DESC', async () => {
      mockSupabaseClient.setMockResponse([mockConversation]);

      const result = await db.getUserConversations(mockUserId);

      expect(result).toEqual([mockConversation]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('updated_at', { ascending: false });
    });

    it('should return empty array when no data', async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getUserConversations(mockUserId);

      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(db.getUserConversations(mockUserId)).rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('getConversation', () => {
    it('should fetch a single conversation by id', async () => {
      mockSupabaseClient.setMockResponse(mockConversation);

      const result = await db.getConversation('conv-123');

      expect(result).toEqual(mockConversation);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'conv-123');
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should return null when not found (PGRST116)', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'PGRST116', message: 'Not found' });

      const result = await db.getConversation('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'OTHER', message: 'DB error' });

      await expect(db.getConversation('conv-123')).rejects.toEqual({ code: 'OTHER', message: 'DB error' });
    });
  });

  describe('createConversation', () => {
    it('should insert and return a new conversation', async () => {
      mockSupabaseClient.setMockResponse(mockConversation);

      const result = await db.createConversation({ user_id: mockUserId, title: 'Test' });

      expect(result).toEqual(mockConversation);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({ user_id: mockUserId, title: 'Test' });
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Insert error' });

      await expect(db.createConversation({ user_id: mockUserId })).rejects.toEqual({ message: 'Insert error' });
    });
  });

  describe('createInitialTurn', () => {
    it('returns the atomic retry-safe initial lifecycle outcome', async () => {
      const saved = {
        outcome: 'already_saved' as const,
        conversationId: 'conv-123',
        title: 'Plan my week',
        messages: [],
      };
      mockSupabaseClient.setMockResponse(saved);

      const result = await db.createInitialTurn({
        userId: mockUserId,
        turnId: 'turn-1',
        userContent: 'Plan my week',
        assistantContent: 'Let us start with your priorities.',
        assistantModel: 'gpt-5.4-mini',
        title: 'Plan my week',
      });

      expect(result).toEqual(saved);
      mockSupabaseClient.expectQuery({
        table: null,
        method: 'rpc',
        args: ['save_initial_chat_turn', {
          p_user_id: mockUserId,
          p_turn_id: 'turn-1',
          p_user_content: 'Plan my week',
          p_assistant_content: 'Let us start with your priorities.',
          p_assistant_model: 'gpt-5.4-mini',
          p_title: 'Plan my week',
        }],
      });
    });

    it('throws when the initial lifecycle RPC fails', async () => {
      const error = { message: 'Atomic lifecycle failed' };
      mockSupabaseClient.setMockResponse(null, error);

      await expect(db.createInitialTurn({
        userId: mockUserId,
        turnId: 'turn-1',
        userContent: 'Plan my week',
        assistantContent: 'Let us start with your priorities.',
        assistantModel: 'gpt-5.4-mini',
        title: 'Plan my week',
      })).rejects.toEqual(error);
    });
  });

  describe('updateConversation', () => {
    it('should update and return the conversation with user_id filter', async () => {
      const updated = { ...mockConversation, title: 'Updated Title' };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateConversation('conv-123', mockUserId, { title: 'Updated Title' });

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ title: 'Updated Title' });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'conv-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Update error' });

      await expect(db.updateConversation('conv-123', mockUserId, { title: 'x' })).rejects.toEqual({ message: 'Update error' });
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation by id with user_id filter', async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.deleteConversation('conv-123', mockUserId);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'conv-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Delete error' });

      await expect(db.deleteConversation('conv-123', mockUserId)).rejects.toEqual({ message: 'Delete error' });
    });
  });
});
