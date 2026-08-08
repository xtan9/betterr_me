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
    turn_id: null,
    turn_position: null,
    model: null,
    created_at: '2026-04-02T10:00:00Z',
  };

  const mockAssistantMessage: ChatMessage = {
    id: 'msg-124',
    conversation_id: mockConversationId,
    role: 'assistant',
    content: 'I am doing well, thank you!',
    turn_id: null,
    turn_position: null,
    model: null,
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
      mockSupabaseClient.expectQuery({
        table: 'chat_messages',
        method: 'select',
        args: ['*'],
      });
      mockSupabaseClient.expectQuery({
        table: 'chat_messages',
        method: 'eq',
        args: ['conversation_id', mockConversationId],
      });
      mockSupabaseClient.expectQuery({
        table: 'chat_messages',
        method: 'order',
        args: ['created_at', { ascending: true }],
      });
      mockSupabaseClient.expectQuery({
        table: 'chat_messages',
        method: 'order',
        args: ['turn_position', { ascending: true, nullsFirst: true }],
      });
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

  describe('saveCompletedTurn', () => {
    it('returns the atomic retry-safe persistence outcome', async () => {
      const saved = {
        outcome: 'already_saved' as const,
        messages: [mockMessage, mockAssistantMessage],
      };
      const rpc = vi.fn().mockResolvedValue({ data: saved, error: null });
      const turnDb = new ChatMessagesDB({ rpc } as any);

      const result = await turnDb.saveCompletedTurn({
        conversationId: mockConversationId,
        turnId: 'turn-1',
        userContent: 'Hello',
        assistantContent: 'Hi there',
        assistantModel: 'gpt-5.3-codex-spark',
      });

      expect(result).toEqual(saved);
      expect(rpc).toHaveBeenCalledWith('save_completed_chat_turn', {
        p_conversation_id: mockConversationId,
        p_turn_id: 'turn-1',
        p_user_content: 'Hello',
        p_assistant_content: 'Hi there',
        p_assistant_model: 'gpt-5.3-codex-spark',
      });
    });

    it('throws when atomic turn persistence fails', async () => {
      const error = { message: 'Atomic insert failed' };
      const rpc = vi.fn().mockResolvedValue({ data: null, error });
      const turnDb = new ChatMessagesDB({ rpc } as any);

      await expect(turnDb.saveCompletedTurn({
        conversationId: mockConversationId,
        turnId: 'turn-1',
        userContent: 'Hello',
        assistantContent: 'Hi there',
        assistantModel: 'gpt-5.3-codex-spark',
      })).rejects.toEqual(error);
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
