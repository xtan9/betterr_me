import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { llmProvider } from "@/lib/ai/provider";
import { sendChatSchema } from "@/lib/validations/chat";

export const maxDuration = 60;

export async function POST(req: Request) {
  // Auth FIRST — cookies() available here, NOT inside stream callback
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = sendChatSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: parsed.error.errors[0]?.message || "Invalid request",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { messages } = parsed.data;

  // Stream response from LLM proxy — try/catch for network-level failures
  try {
    const result = streamText({
      model: llmProvider(
        process.env.LLM_MODEL || "claude-sonnet-4-20250514",
      ),
      messages,
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "4096", 10),
      abortSignal: req.signal,
    });

    return result.toDataStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to reach AI service. Please try again.",
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
