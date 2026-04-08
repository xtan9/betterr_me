import { z } from "zod";

export const saveMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(32000, "Message too long"),
});

export const titleRequestSchema = z.object({
  userMessage: z.string().min(1).max(32000),
  assistantMessage: z.string().min(1).max(32000),
});

