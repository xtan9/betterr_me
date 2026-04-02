import { z } from "zod";

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url("endpoint must be a valid URL"),
  p256dh: z.string().min(1, "p256dh is required"),
  auth: z.string().min(1, "auth is required"),
  user_agent: z.string().nullable().optional(),
});

export type PushSubscribeValues = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url("endpoint must be a valid URL"),
});

export type PushUnsubscribeValues = z.infer<typeof pushUnsubscribeSchema>;
