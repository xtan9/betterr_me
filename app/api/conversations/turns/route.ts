import { NextResponse } from "next/server";
import { ConversationsDB } from "@/lib/db";
import { AVAILABLE_MODELS } from "@/lib/ai/models";
import { initialConversationTitle } from "@/lib/chat/conversation-title";
import { log } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { saveCompletedTurnSchema } from "@/lib/validations/chat";

/**
 * POST /api/conversations/turns
 * Persist the first completed turn as one retry-safe conversation lifecycle.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { outcome: "failed", error: "Unauthorized" },
        { status: 401 },
      );
    }

    const parsed = saveCompletedTurnSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          outcome: "failed",
          error: parsed.error.errors[0]?.message ?? "Invalid request",
        },
        { status: 400 },
      );
    }

    if (!AVAILABLE_MODELS.some(({ id }) => id === parsed.data.assistantModel)) {
      return NextResponse.json(
        { outcome: "failed", error: "Invalid model" },
        { status: 400 },
      );
    }

    const result = await new ConversationsDB(supabase).createInitialTurn({
      userId: user.id,
      turnId: parsed.data.turnId,
      userContent: parsed.data.userMessage,
      assistantContent: parsed.data.assistantMessage,
      assistantModel: parsed.data.assistantModel,
      title: initialConversationTitle(parsed.data.userMessage),
    });

    return NextResponse.json(result, {
      status: result.outcome === "saved" ? 201 : 200,
    });
  } catch (error) {
    log.error("[chat] Failed to save initial conversation turn", error);
    return NextResponse.json(
      {
        outcome: "failed",
        error: "Failed to save initial conversation turn",
      },
      { status: 500 },
    );
  }
}
