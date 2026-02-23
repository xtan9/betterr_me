import { describe, it, expect } from 'vitest';
import { getPreviewText, extractPlainText } from '@/lib/journal/utils';

describe('extractPlainText', () => {
  it('should extract text from a text node', () => {
    const node = { type: 'text', text: 'Hello world' };
    expect(extractPlainText(node)).toBe('Hello world');
  });

  it('should extract text from nested content', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world' },
          ],
        },
      ],
    };
    expect(extractPlainText(doc)).toBe('Hello world');
  });

  it('should return empty string for null', () => {
    expect(extractPlainText(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(extractPlainText(undefined)).toBe('');
  });

  it('should return empty string for non-object', () => {
    expect(extractPlainText('string')).toBe('');
    expect(extractPlainText(42)).toBe('');
  });

  it('should handle nodes with no text and no content', () => {
    const node = { type: 'hardBreak' };
    expect(extractPlainText(node)).toBe('');
  });
});

describe('getPreviewText', () => {
  it('should extract text from simple Tiptap paragraph', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    };
    expect(getPreviewText(doc)).toBe('Hello world');
  });

  it('should handle nested content (headings, lists)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Item 1' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Item 2' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(getPreviewText(doc)).toBe('TitleItem 1Item 2');
  });

  it('should truncate at maxLength with "..."', () => {
    const longText = 'A'.repeat(200);
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: longText }],
        },
      ],
    };
    const result = getPreviewText(doc, 50);
    expect(result).toBe('A'.repeat(50) + '...');
    expect(result.length).toBe(53); // 50 + "..."
  });

  it('should not truncate text at or under maxLength', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Short text' }],
        },
      ],
    };
    expect(getPreviewText(doc, 100)).toBe('Short text');
  });

  it('should return empty string for null input', () => {
    expect(getPreviewText(null)).toBe('');
  });

  it('should return empty string for undefined input', () => {
    expect(getPreviewText(undefined)).toBe('');
  });

  it('should return empty string for empty doc', () => {
    const doc = { type: 'doc', content: [] };
    expect(getPreviewText(doc)).toBe('');
  });

  it('should handle content with no text nodes', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'horizontalRule' },
        { type: 'hardBreak' },
      ],
    };
    expect(getPreviewText(doc)).toBe('');
  });
});
