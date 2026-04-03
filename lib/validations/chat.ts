import { z } from "zod";
import { CHAT_ROLES } from "@/lib/db/types";

export const chatMessageSchema = z.object({
  role: z.enum(CHAT_ROLES),
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(32000, "Message too long"),
});

export const sendChatSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1, "At least one message required")
    .max(100, "Too many messages"),
});

export type SendChatInput = z.infer<typeof sendChatSchema>;
