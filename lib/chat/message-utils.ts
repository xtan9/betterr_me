import type { ChatMessage } from "@/lib/db/types";
import type { UIMessage } from "ai";
import { log } from "@/lib/logger";

const validRoles = new Set(["user", "assistant"]);

export function dbMessageToUIMessage(msg: ChatMessage): UIMessage {
  if (!validRoles.has(msg.role)) {
    log.warn("[message-utils] Unexpected message role", { role: msg.role, messageId: msg.id });
  }
  return {
    id: msg.id,
    role: msg.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: msg.content }],
  };
}
