import type { ChatMessage } from "@/lib/db/types";
import type { UIMessage } from "ai";

const validRoles = new Set(["user", "assistant"]);

export function dbMessageToUIMessage(msg: ChatMessage): UIMessage {
  if (!validRoles.has(msg.role)) {
    console.warn(`[message-utils] Unexpected message role: ${msg.role}`, { messageId: msg.id });
  }
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
  if (!textPart) {
    console.warn("[message-utils] UIMessage has no text part", { role: msg.role, partTypes: msg.parts.map(p => p.type) });
  }
  return {
    conversation_id: conversationId,
    role: msg.role,
    content: textPart?.type === "text" ? textPart.text : "",
  };
}
