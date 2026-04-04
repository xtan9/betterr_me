import type { ChatMessage } from "@/lib/db/types";
import type { UIMessage } from "ai";

export function dbMessageToUIMessage(msg: ChatMessage): UIMessage {
  return {
    id: msg.id,
    role: msg.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: msg.content }],
    createdAt: new Date(msg.created_at),
  };
}

export function uiMessageToDbInsert(
  msg: UIMessage,
  conversationId: string,
): { conversation_id: string; role: string; content: string } {
  const textPart = msg.parts.find((p) => p.type === "text");
  return {
    conversation_id: conversationId,
    role: msg.role,
    content: textPart?.type === "text" ? textPart.text : "",
  };
}
