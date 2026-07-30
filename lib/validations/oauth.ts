import { z } from "zod";

export const oauthRefreshGrantSchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
});
