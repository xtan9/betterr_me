import { NextResponse } from "next/server";
import { ChatMessagesDB, ConversationsDB } from "@/lib/db";
import { log } from "@/lib/logger";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { saveCompletedTurnSchema } from "@/lib/validations/chat";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { outcome: "failed", error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

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

    const conversation = await new ConversationsDB(supabase).getConversation(id);
    if (!conversation || conversation.user_id !== userId) {
      return NextResponse.json(
        { outcome: "failed", error: "Conversation not found" },
        { status: 404 },
      );
    }

    const result = await new ChatMessagesDB(supabase).saveCompletedTurn({
      conversationId: id,
      turnId: parsed.data.turnId,
      userContent: parsed.data.userMessage,
      assistantContent: parsed.data.assistantMessage,
      assistantModel: parsed.data.assistantModel,
    });

    return NextResponse.json(result, {
      status: result.outcome === "saved" ? 201 : 200,
    });
  } catch (error) {
    log.error("[chat] Failed to save completed turn", error);
    return NextResponse.json(
      { outcome: "failed", error: "Failed to save completed turn" },
      { status: 500 },
    );
  }
}
