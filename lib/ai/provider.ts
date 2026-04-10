import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({
  baseURL: process.env.LLM_BASE_URL || "https://llm.betterr.me/v1",
  // CLIProxyAPI uses Bearer auth, not x-api-key header
  authToken: process.env.LLM_API_KEY ?? "",
});
// Note: Empty authToken is guarded at the route level (503 if LLM_API_KEY not set).

export const llmProvider = anthropic;

// Anthropic built-in web search tool — gives the model real-time web access
export const webSearchTool = anthropic.tools.webSearch_20250305({
  maxUses: 3,
});
