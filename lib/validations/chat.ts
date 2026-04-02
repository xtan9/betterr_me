import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
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
  conversationId: z.string().uuid("Invalid conversation ID").optional(),
});

export type SendChatInput = z.infer<typeof sendChatSchema>;
