/**
 * Utility functions for journal entry content processing.
 *
 * Tiptap stores content as JSON with a recursive node structure:
 * { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '...' }] }] }
 */

/**
 * Recursively extract plain text from a Tiptap JSON node.
 * Text nodes have a `.text` property; all other nodes may have `.content` arrays.
 */
export function extractPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const n = node as Record<string, unknown>;

  if (n.type === "text" && typeof n.text === "string") {
    return n.text;
  }

  if (Array.isArray(n.content)) {
    return n.content.map(extractPlainText).join("");
  }

  return "";
}

/**
 * Extract a plain text preview from Tiptap JSON content.
 * Truncates to maxLength with '...' suffix if the full text exceeds the limit.
 * Returns empty string for null/undefined input.
 */
export function getPreviewText(
  tiptapJson: Record<string, unknown> | null | undefined,
  maxLength = 100
): string {
  if (!tiptapJson) return "";

  const fullText = extractPlainText(tiptapJson).trim();
  if (fullText.length <= maxLength) return fullText;
  return fullText.slice(0, maxLength).trimEnd() + "...";
}
