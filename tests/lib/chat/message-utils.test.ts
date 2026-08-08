import { describe, it, expect, vi } from 'vitest';
import { dbMessageToUIMessage } from '@/lib/chat/message-utils';
import type { ChatMessage } from '@/lib/db/types';

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('message-utils', () => {
  describe('dbMessageToUIMessage', () => {
    it('converts a user message with text part', () => {
      const dbMsg: ChatMessage = {
        id: 'm1',
        conversation_id: 'c1',
        role: 'user',
        content: 'hello',
        turn_id: null,
        turn_position: null,
        model: null,
        created_at: '2026-01-01T00:00:00Z',
      };

      const result = dbMessageToUIMessage(dbMsg);

      expect(result).toEqual({
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      });
    });

    it('converts an assistant message preserving role', () => {
      const dbMsg: ChatMessage = {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: 'Hi there!',
        turn_id: 'turn-1',
        turn_position: 1,
        model: 'gpt-5.3-codex-spark',
        created_at: '2026-01-01T00:01:00Z',
      };

      const result = dbMessageToUIMessage(dbMsg);

      expect(result.role).toBe('assistant');
      expect(result.parts).toEqual([{ type: 'text', text: 'Hi there!' }]);
    });

    it('preserves message id from database', () => {
      const dbMsg: ChatMessage = {
        id: 'm3',
        conversation_id: 'c1',
        role: 'user',
        content: 'test',
        turn_id: null,
        turn_position: null,
        model: null,
        created_at: '2026-06-15T12:30:00Z',
      };

      const result = dbMessageToUIMessage(dbMsg);
      expect(result.id).toBe('m3');
    });
  });
});
