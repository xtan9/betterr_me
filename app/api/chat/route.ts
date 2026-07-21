import { NextResponse } from "next/server";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { createClient } from "@/lib/supabase/server";
import { llmProvider, webSearchTool, createMemoryTool } from "@/lib/ai/provider";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from "@/lib/ai/models";
import { createChatTools } from "@/lib/ai/tools";
import { checkChatRateLimit } from "@/lib/ai/rate-limit";
import { buildIdentityMessages } from "@/lib/ai/system-prompt";
import { log } from "@/lib/logger";

export const maxDuration = 60;

const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_MESSAGES = 40;
const MAX_OUTPUT_TOKENS = 2048;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.LLM_API_KEY) {
      log.error("POST /api/chat failed: LLM_API_KEY not configured");
      return NextResponse.json(
        { error: "AI service is not configured." },
        { status: 503 },
      );
    }

    const rateLimit = await checkChatRateLimit(supabase, user.id);
    if (!rateLimit.allowed) {
      const unavailable = rateLimit.reason === "unavailable";
      return NextResponse.json(
        { error: unavailable ? "AI service is temporarily unavailable." : "Chat usage limit exceeded." },
        {
          status: unavailable ? 503 : 429,
          headers: unavailable ? undefined : { "Retry-After": "60" },
        },
      );
    }

    let rawBody: string;
    try {
      const contentLength = Number(req.headers.get("content-length") || "0");
      if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
        return NextResponse.json({ error: "Request body too large" }, { status: 413 });
      }
      rawBody = await req.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
        return NextResponse.json({ error: "Request body too large" }, { status: 413 });
      }
    } catch (error) {
      log.warn("POST /api/chat: failed to read request body", { error: String(error) });
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      log.warn("POST /api/chat: invalid JSON body", { error: String(error) });
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const messages = body.messages;
    const requestedModel = body.model;
    // Validate date format; fall back to UTC date if missing/invalid.
    // Client should always send the local date, but we need a safe server-side fallback.
    const rawDate = typeof body.date === "string" ? body.date : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : (() => { const n = new Date(); return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`; })();
    const rawTimezone = typeof body.timezone === "string" ? body.timezone : "";
    const timezone = /^[A-Za-z0-9_/+-]+$/.test(rawTimezone) ? rawTimezone : "UTC";
    const validModelIds = AVAILABLE_MODELS.map((m) => m.id);

    if (typeof requestedModel === "string" && requestedModel.length > 0 && !validModelIds.includes(requestedModel)) {
      return NextResponse.json(
        { error: `Invalid model: ${requestedModel}` },
        { status: 400 },
      );
    }

    const configuredDefault = process.env.LLM_MODEL;
    const defaultModel = configuredDefault && validModelIds.includes(configuredDefault)
      ? configuredDefault
      : DEFAULT_MODEL_ID;
    const modelId =
      typeof requestedModel === "string" && validModelIds.includes(requestedModel)
        ? requestedModel
        : defaultModel;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "At least one message required" },
        { status: 400 },
      );
    }

    if (messages.length > MAX_MESSAGES) {
      return NextResponse.json(
        { error: `Too many messages (max ${MAX_MESSAGES})` },
        { status: 400 },
      );
    }

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

    // Build tools (async — resolves householdId for money tools)
    const tools = await createChatTools({
      userId: user.id,
      supabase,
      date,
      timezone,
    });

    const result = streamText({
      model: llmProvider(modelId),
      messages: [...buildIdentityMessages({ date, timezone }), ...modelMessages],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: { ...tools, web_search: webSearchTool, memory: createMemoryTool(supabase, user.id) } as any,
      stopWhen: stepCountIs(3),
      maxOutputTokens: Math.min(
        MAX_OUTPUT_TOKENS,
        Math.max(1, Number.parseInt(process.env.LLM_MAX_TOKENS || String(MAX_OUTPUT_TOKENS), 10) || MAX_OUTPUT_TOKENS),
      ),
      abortSignal: req.signal,
      onError({ error }) {
        log.error("LLM stream error", error, { userId: user.id });
      },
    });

    return result.toUIMessageStreamResponse({
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(null, { status: 499 });
    }

    const errMsg = error instanceof Error ? error.message : String(error);
    if (
      errMsg.includes("authentication_error") ||
      errMsg.includes("OAuth token has expired")
    ) {
      log.error("POST /api/chat: LLM proxy auth expired", error);
      return NextResponse.json(
        { error: "AI service authentication expired. Please try again later." },
        { status: 503 },
      );
    }

    log.error("POST /api/chat error", error);
    return NextResponse.json(
      { error: "Failed to reach AI service. Please try again." },
      { status: 502 },
    );
  }
}
