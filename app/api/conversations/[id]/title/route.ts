import { NextResponse } from "next/server";
import { generateText } from "ai";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { ConversationsDB } from "@/lib/db";
import { llmProvider } from "@/lib/ai/provider";
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";
import { checkChatRateLimit } from "@/lib/ai/rate-limit";
import { titleRequestSchema } from "@/lib/validations/chat";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/conversations/[id]/title
 * Generate a short title for a conversation using LLM
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    // Early guard: LLM API key must be configured
    if (!process.env.LLM_API_KEY) {
      log.error(
        "POST /api/conversations/[id]/title failed: LLM_API_KEY not configured",
      );
      return NextResponse.json(
        { error: "AI service is not configured." },
        { status: 503 },
      );
    }

    const rateLimit = await checkChatRateLimit(supabase, userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: rateLimit.reason === "unavailable"
            ? "AI service is temporarily unavailable."
            : "Chat usage limit exceeded.",
        },
        { status: rateLimit.reason === "unavailable" ? 503 : 429 },
      );
    }

    // Parse and validate body
    const body = await request.json();
    const parsed = titleRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }

    // Verify conversation ownership
    const conversationsDB = new ConversationsDB(supabase);
    const conversation = await conversationsDB.getConversation(id);
    if (!conversation || conversation.user_id !== userId) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    // Generate title via LLM
    const { text } = await generateText({
      model: llmProvider(
        process.env.LLM_MODEL || DEFAULT_MODEL_ID,
      ),
      prompt: `Summarize this conversation in 5-8 words as a title. Return ONLY the title, no quotes or punctuation. IMPORTANT: The title MUST be in the same language as the conversation. If the conversation is in Chinese, the title must be in Chinese. If in English, the title must be in English.\n\nUser: ${parsed.data.userMessage}\nAssistant: ${parsed.data.assistantMessage}`,
      maxOutputTokens: 30,
    });

    const title = text.trim();

    // Update conversation title
    await conversationsDB.updateConversation(id, userId, { title });

    return NextResponse.json({ title });
  } catch (error) {
    log.error("POST /api/conversations/[id]/title error", error);
    return NextResponse.json(
      { error: "Failed to generate title" },
      { status: 500 },
    );
  }
}
