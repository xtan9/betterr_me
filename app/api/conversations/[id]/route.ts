import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ConversationsDB } from "@/lib/db";
import { log } from "@/lib/logger";

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
