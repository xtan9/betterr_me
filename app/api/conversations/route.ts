import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ConversationsDB } from "@/lib/db";
import { AVAILABLE_MODELS } from "@/lib/ai/models";
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      user_id: user.id,
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
