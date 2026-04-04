import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ConversationsDB } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * GET /api/conversations
 * List conversations for the authenticated user, sorted by updated_at desc
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversationsDB = new ConversationsDB(supabase);
    const conversations = await conversationsDB.getUserConversations(user.id);
    return NextResponse.json({ conversations });
  } catch (error) {
    log.error("GET /api/conversations error", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/conversations
 * Create a new conversation for the authenticated user
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversationsDB = new ConversationsDB(supabase);
    const conversation = await conversationsDB.createConversation({
      user_id: user.id,
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    log.error("POST /api/conversations error", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }
}
