import { createOpenAI } from "@ai-sdk/openai";

export const llmProvider = createOpenAI({
  baseURL: process.env.LLM_BASE_URL || "https://llm.betterr.me/v1",
  apiKey: process.env.LLM_API_KEY ?? "",
});
// Note: Empty apiKey is guarded at the route level (503 if LLM_API_KEY not set).
