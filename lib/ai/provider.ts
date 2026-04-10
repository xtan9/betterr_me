import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  baseURL: process.env.LLM_BASE_URL || "https://llm.betterr.me/v1",
  apiKey: process.env.LLM_API_KEY ?? "",
});
// Note: Empty apiKey is guarded at the route level (503 if LLM_API_KEY not set).

// Use .chat() for Chat Completions API format — the default uses
// Responses API which the LLM proxy doesn't fully support for tool calling.
export const llmProvider = openai.chat;
