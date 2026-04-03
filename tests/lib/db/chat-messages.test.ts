import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatMessagesDB } from '@/lib/db/chat-messages';
import { mockSupabaseClient } from '../../setup';
import type { ChatMessage } from '@/lib/db/types';

describe('ChatMessagesDB', () => {
  let db: ChatMessagesDB;
  const mockConversationId = 'conv-123';
  const mockMessage: ChatMessage = {
    id: 'msg-123',
    conversation_id: mockConversationId,
    role: 'user',
    content: 'Hello, how are you?',
    created_at: '2026-04-02T10:00:00Z',
  };

  const mockAssistantMessage: ChatMessage = {
    id: 'msg-124',
    conversation_id: mockConversationId,
    role: 'assistant',
    content: 'I am doing well, thank you!',
    created_at: '2026-04-02T10:00:01Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db = new ChatMessagesDB(mockSupabaseClient as any);
  });

  describe('getMessagesByConversation', () => {
    it('should fetch messages ordered by created_at ASC', async () => {
      mockSupabaseClient.setMockResponse([mockMessage, mockAssistantMessage]);

      const result = await db.getMessagesByConversation(mockConversationId);

      expect(result).toEqual([mockMessage, mockAssistantMessage]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('chat_messages');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('conversation_id', mockConversationId);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });

    it('should return empty array when no messages', async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getMessagesByConversation(mockConversationId);

      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(db.getMessagesByConversation(mockConversationId)).rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('createMessage', () => {
    it('should insert and return a new message', async () => {
      mockSupabaseClient.setMockResponse(mockMessage);

      const result = await db.createMessage({
        conversation_id: mockConversationId,
        role: 'user',
        content: 'Hello, how are you?',
      });

      expect(result).toEqual(mockMessage);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('chat_messages');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        conversation_id: mockConversationId,
        role: 'user',
        content: 'Hello, how are you?',
      });
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Insert error' });

      await expect(
        db.createMessage({ conversation_id: mockConversationId, role: 'user', content: 'test' })
      ).rejects.toEqual({ message: 'Insert error' });
    });
  });

  describe('createMessages', () => {
    it('should bulk insert and return messages', async () => {
      mockSupabaseClient.setMockResponse([mockMessage, mockAssistantMessage]);

      const result = await db.createMessages([
        { conversation_id: mockConversationId, role: 'user', content: 'Hello' },
        { conversation_id: mockConversationId, role: 'assistant', content: 'Hi there' },
      ]);

      expect(result).toEqual([mockMessage, mockAssistantMessage]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('chat_messages');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith([
        { conversation_id: mockConversationId, role: 'user', content: 'Hello' },
        { conversation_id: mockConversationId, role: 'assistant', content: 'Hi there' },
      ]);
      expect(mockSupabaseClient.select).toHaveBeenCalled();
    });

    it('should return empty array when no data returned', async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.createMessages([
        { conversation_id: mockConversationId, role: 'user', content: 'test' },
      ]);

      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Bulk insert error' });

      await expect(
        db.createMessages([{ conversation_id: mockConversationId, role: 'user', content: 'test' }])
      ).rejects.toEqual({ message: 'Bulk insert error' });
    });
  });

  describe('deleteMessagesByConversation', () => {
    it('should delete all messages for a conversation', async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.deleteMessagesByConversation(mockConversationId);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('chat_messages');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('conversation_id', mockConversationId);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Delete error' });

      await expect(db.deleteMessagesByConversation(mockConversationId)).rejects.toEqual({ message: 'Delete error' });
    });
  });
});
