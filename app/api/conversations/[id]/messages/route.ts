import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ConversationsDB, ChatMessagesDB } from "@/lib/db";
import { saveMessageSchema } from "@/lib/validations/chat";
import { log } from "@/lib/logger";

/**
 * GET /api/conversations/[id]/messages
 * Load messages for a conversation owned by the authenticated user
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify conversation ownership
    const conversationsDB = new ConversationsDB(supabase);
    const conversation = await conversationsDB.getConversation(id);
    if (!conversation || conversation.user_id !== user.id) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const chatMessagesDB = new ChatMessagesDB(supabase);
    const messages = await chatMessagesDB.getMessagesByConversation(id);
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate body
    const body = await request.json();
    const parsed = saveMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }

    // Verify conversation ownership
    const conversationsDB = new ConversationsDB(supabase);
    const conversation = await conversationsDB.getConversation(id);
    if (!conversation || conversation.user_id !== user.id) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    // Save message
    const chatMessagesDB = new ChatMessagesDB(supabase);
    const message = await chatMessagesDB.createMessage({
      conversation_id: id,
      role: parsed.data.role,
      content: parsed.data.content,
    });

    // Bump conversation updated_at
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    log.error("POST /api/conversations/[id]/messages error", error);
    return NextResponse.json(
      { error: "Failed to save message" },
      { status: 500 },
    );
  }
}
