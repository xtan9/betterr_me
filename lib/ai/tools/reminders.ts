import { z } from "zod";
import { RemindersDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function reminderTools(): ToolDefinition[] {
  return [
    {
      name: "getUpcomingReminders",
      description: "Get pending reminders that haven't been sent yet",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        const tomorrow = new Date(ctx.date + "T23:59:59");
        tomorrow.setDate(tomorrow.getDate() + 1);
        return db.getPendingReminders(tomorrow.toISOString());
      },
    },
  ];
}
