import { NextResponse } from "next/server";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { llmProvider } from "@/lib/ai/provider";
import { sendChatSchema } from "@/lib/validations/chat";
import { log } from "@/lib/logger";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // Auth FIRST — cookies() available here, NOT inside stream callback
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Early guard: LLM API key must be configured
    if (!process.env.LLM_API_KEY) {
      log.error("POST /api/chat failed: LLM_API_KEY not configured");
      return NextResponse.json(
        { error: "AI service is not configured." },
        { status: 503 },
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      log.warn("POST /api/chat: invalid JSON body", { error: String(error) });
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    const parsed = sendChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }

    const { messages } = parsed.data;

    // Stream response from LLM proxy
    const result = streamText({
      model: llmProvider(
        process.env.LLM_MODEL || "claude-sonnet-4-20250514",
      ),
      messages,
      maxOutputTokens: parseInt(process.env.LLM_MAX_TOKENS || "4096", 10),
      abortSignal: req.signal,
      onError({ error }) {
        log.error("LLM stream error", error);
      },
    });

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    log.error("POST /api/chat error", error);
    return NextResponse.json(
      { error: "Failed to reach AI service. Please try again." },
      { status: 502 },
    );
  }
}
