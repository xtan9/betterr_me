import { describe, it, expect } from 'vitest';
import { dbMessageToUIMessage, uiMessageToDbInsert } from '@/lib/chat/message-utils';
import type { ChatMessage } from '@/lib/db/types';
import type { UIMessage } from 'ai';

describe('message-utils', () => {
  describe('dbMessageToUIMessage', () => {
    it('converts a user message with text part and createdAt', () => {
      const dbMsg: ChatMessage = {
        id: 'm1',
        conversation_id: 'c1',
        role: 'user',
        content: 'hello',
        created_at: '2026-01-01T00:00:00Z',
      };

      const result = dbMessageToUIMessage(dbMsg);

      expect(result).toEqual({
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
    });

    it('converts an assistant message preserving role', () => {
      const dbMsg: ChatMessage = {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: 'Hi there!',
        created_at: '2026-01-01T00:01:00Z',
      };

      const result = dbMessageToUIMessage(dbMsg);

      expect(result.role).toBe('assistant');
      expect(result.parts).toEqual([{ type: 'text', text: 'Hi there!' }]);
    });

    it('creates a valid Date from created_at', () => {
      const dbMsg: ChatMessage = {
        id: 'm3',
        conversation_id: 'c1',
        role: 'user',
        content: 'test',
        created_at: '2026-06-15T12:30:00Z',
      };

      const result = dbMessageToUIMessage(dbMsg);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.createdAt!.toISOString()).toBe('2026-06-15T12:30:00.000Z');
    });
  });

  describe('uiMessageToDbInsert', () => {
    it('extracts text content from parts array', () => {
      const uiMsg: UIMessage = {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
        createdAt: new Date(),
      };

      const result = uiMessageToDbInsert(uiMsg, 'conv1');

      expect(result).toEqual({
        conversation_id: 'conv1',
        role: 'user',
        content: 'hello',
      });
    });

    it('returns empty content when parts array is empty', () => {
      const uiMsg: UIMessage = {
        id: 'm2',
        role: 'assistant',
        parts: [],
        createdAt: new Date(),
      };

      const result = uiMessageToDbInsert(uiMsg, 'conv1');

      expect(result.content).toBe('');
    });

    it('uses the first text part when multiple parts exist', () => {
      const uiMsg: UIMessage = {
        id: 'm3',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
        ],
        createdAt: new Date(),
      };

      const result = uiMessageToDbInsert(uiMsg, 'conv2');

      expect(result.content).toBe('first');
    });
  });
});
