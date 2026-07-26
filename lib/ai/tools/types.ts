import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

export interface ToolContext {
  userId: string;
  supabase: SupabaseClient;
  date: string; // YYYY-MM-DD, user's local date
  timezone: string; // e.g. "America/Toronto"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<TParams = any> {
  name: string;
  description: string;
  parameters: z.ZodSchema<TParams>;
  execute: (params: TParams, ctx: ToolContext) => Promise<unknown>;
}
