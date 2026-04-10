import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  baseURL: process.env.LLM_BASE_URL || "https://llm.betterr.me/v1",
  apiKey: process.env.LLM_API_KEY ?? "",
  headers: {
    // Identify as Claude Code client so the LLM proxy (CLIProxyAPI) skips
    // injecting the Claude Code system prompt, allowing our own system prompt.
    "User-Agent": "claude-cli/2.1.44 (external, sdk-cli)",
  },
});
// Note: Empty apiKey is guarded at the route level (503 if LLM_API_KEY not set).

// Use .chat() for Chat Completions API format — the default uses
// Responses API which the LLM proxy doesn't fully support for tool calling.
export const llmProvider = openai.chat;
