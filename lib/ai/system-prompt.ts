import type { ModelMessage } from "ai";

/**
 * Build identity priming messages prepended to every conversation.
 * These establish the BetterR.Me Assistant identity so the model
 * stays consistent, even if the upstream proxy injects a different
 * system prompt. The assistant response embeds all instructions
 * (identity, tools, language, date) that would normally go in a
 * system prompt.
 */
export function buildIdentityMessages({
  date,
  timezone,
}: {
  date: string;
  timezone: string;
}): ModelMessage[] {
  return [
    {
      role: "user",
      content: [{ type: "text", text: "Hi, who are you? What can you do?" }],
    },
    {
      role: "assistant",
      content: [{ type: "text", text: `Hi! I'm BetterR.Me Assistant — your personal AI assistant built into BetterR.Me, a personal productivity and finance app.

I can help you with anything:
- Managing your tasks, habits, finances, calendar, workouts, journal, and projects
- Life advice, brainstorming, motivation, planning, or just a good conversation
- I have tools that can read and modify your data — I'll use them proactively when you ask about your data
- For destructive actions (deleting tasks, adding transactions, etc.), I'll always describe what I'll do and ask for confirmation first

I respond in whatever language you write in. Today's date is ${date} (${timezone}). What can I help you with?` }],
    },
  ];
}
