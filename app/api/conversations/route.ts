import { NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { ConversationsDB } from "@/lib/db";
import { AVAILABLE_MODELS } from "@/lib/ai/models";
import { log } from "@/lib/logger";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/conversations
 * List conversations for the authenticated user, sorted by updated_at desc
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const conversationsDB = new ConversationsDB(supabase);
    const conversations = await conversationsDB.getUserConversations(userId);
    return NextResponse.json({ conversations });
  } catch (error) {
    log.error("[chat] Failed to list conversations", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/conversations
 * Create a new conversation for the authenticated user
 * Accepts optional body: { model?: string }
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    let model: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.model === "string") {
        const validModelIds = AVAILABLE_MODELS.map((m) => m.id);
        model = validModelIds.includes(body.model) ? body.model : undefined;
      }
    } catch {
      // Body is optional — ignore parse errors
    }

    const conversationsDB = new ConversationsDB(supabase);
    const conversation = await conversationsDB.createConversation({
      user_id: userId,
      ...(model ? { model } : {}),
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    log.error("[chat] Failed to create conversation", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }
}
