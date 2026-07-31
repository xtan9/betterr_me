const MAX_TITLE_WORDS = 8;
const MAX_TITLE_LENGTH = 80;

export function initialConversationTitle(userMessage: string): string {
  const normalized = userMessage.trim().replace(/\s+/g, " ");
  const words = normalized.split(" ");

  if (words.length > MAX_TITLE_WORDS) {
    return `${words.slice(0, MAX_TITLE_WORDS).join(" ")}…`;
  }

  return normalized.length > MAX_TITLE_LENGTH
    ? `${normalized.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : normalized;
}
