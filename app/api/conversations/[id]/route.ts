import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ConversationsDB } from "@/lib/db";
import { AVAILABLE_MODELS } from "@/lib/ai/models";
import { log } from "@/lib/logger";

/**
 * PATCH /api/conversations/[id]
 * Update a conversation (title, model) owned by the authenticated user
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }
    const updates: { title?: string; model?: string } = {};

    if (typeof body.title === "string") {
      const trimmed = body.title.trim();
      if (trimmed.length === 0 || trimmed.length > 200) {
        return NextResponse.json(
          { error: "Title must be 1-200 characters" },
          { status: 400 },
        );
      }
      updates.title = trimmed;
    }

    if (typeof body.model === "string") {
      const validModelIds = AVAILABLE_MODELS.map((m) => m.id);
      if (!validModelIds.includes(body.model)) {
        return NextResponse.json(
          { error: "Invalid model" },
          { status: 400 },
        );
      }
      updates.model = body.model;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const conversationsDB = new ConversationsDB(supabase);
    await conversationsDB.updateConversation(id, user.id, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("[chat] Failed to update conversation", error, { id });
    return NextResponse.json(
      { error: "Failed to update conversation" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/conversations/[id]
 * Delete a conversation owned by the authenticated user
 */
export async function DELETE(
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

    const conversationsDB = new ConversationsDB(supabase);
    await conversationsDB.deleteConversation(id, user.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    log.error("DELETE /api/conversations/[id] error", error);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 },
    );
  }
}
