import { NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { createConversationMessages } from "@/lib/chat/conversation-messages";
import { saveMessageSchema } from "@/lib/validations/chat";
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
 * GET /api/conversations/[id]/messages
 * Load messages for a conversation owned by the authenticated user
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const messages = await createConversationMessages(supabase).load(
      id,
      userId,
    );
    if (!messages) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ messages });
  } catch (error) {
    log.error("GET /api/conversations/[id]/messages error", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/conversations/[id]/messages
 * Save a message to a conversation owned by the authenticated user
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

    // Parse and validate body
    const body = await request.json();
    const parsed = saveMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }

    const message = await createConversationMessages(supabase).save(
      id,
      userId,
      {
        role: parsed.data.role,
        content: parsed.data.content,
      },
    );
    if (!message) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    log.error("POST /api/conversations/[id]/messages error", error);
    return NextResponse.json(
      { error: "Failed to save message" },
      { status: 500 },
    );
  }
}
