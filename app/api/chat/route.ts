import { NextResponse } from "next/server";
import { streamText, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { llmProvider } from "@/lib/ai/provider";
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

    // Parse request body — AI SDK sends { messages: UIMessage[], id, trigger, messageId }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch (error) {
      log.warn("POST /api/chat: invalid JSON body", { error: String(error) });
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    const messages = body.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "At least one message required" },
        { status: 400 },
      );
    }

    if (messages.length > 100) {
      return NextResponse.json(
        { error: "Too many messages (max 100)" },
        { status: 400 },
      );
    }

    // Convert UIMessages (with parts) to model messages (with content) for streamText
    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(messages);
    } catch (err) {
      log.warn("POST /api/chat: invalid message format", { error: String(err) });
      return NextResponse.json(
        { error: "Invalid message format" },
        { status: 400 },
      );
    }

    // Stream response from LLM proxy
    const result = streamText({
      model: llmProvider(
        process.env.LLM_MODEL || "claude-sonnet-4-20250514",
      ),
      messages: modelMessages,
      maxOutputTokens: parseInt(process.env.LLM_MAX_TOKENS || "4096", 10),
      abortSignal: req.signal,
      onError({ error }) {
        log.error("LLM stream error", error, { userId: user.id });
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
