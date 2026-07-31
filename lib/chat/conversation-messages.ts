import type { SupabaseClient } from "@supabase/supabase-js";

import { ChatMessagesDB, ConversationsDB } from "@/lib/db";
import type { ChatMessageInsert } from "@/lib/db/types";

export function createConversationMessages(client: SupabaseClient) {
  const conversations = new ConversationsDB(client);
  const messages = new ChatMessagesDB(client);

  async function isOwned(conversationId: string, userId: string) {
    const conversation = await conversations.getConversation(conversationId);
    return conversation?.user_id === userId;
  }

  return {
    async load(conversationId: string, userId: string) {
      if (!(await isOwned(conversationId, userId))) return null;
      return messages.getMessagesByConversation(conversationId);
    },

    async save(
      conversationId: string,
      userId: string,
      message: Pick<ChatMessageInsert, "role" | "content">,
    ) {
      if (!(await isOwned(conversationId, userId))) return null;
      return messages.createMessage({
        conversation_id: conversationId,
        ...message,
      });
    },
  };
}
