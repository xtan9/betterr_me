import { z } from "zod";
import { JournalEntriesDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function journalTools(): ToolDefinition[] {
  return [
    {
      name: "getTodayJournal",
      description: "Get today's journal entry",
      parameters: z.object({
        date: z.string().describe("Date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new JournalEntriesDB(ctx.supabase);
        return db.getEntryByDate(ctx.userId, params.date);
      },
    },
    {
      name: "getRecentJournal",
      description: "Get recent journal entries",
      parameters: z.object({
        limit: z.number().optional().describe("Number of entries to return (default 5)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new JournalEntriesDB(ctx.supabase);
        return db.getTimeline(ctx.userId, params.limit ?? 5);
      },
    },
    {
      name: "createJournalEntry",
      description: "Create or update a journal entry for a given date",
      parameters: z.object({
        date: z.string().describe("Date in YYYY-MM-DD format"),
        content: z.string().describe("Journal entry content (markdown supported)"),
        mood: z.number().optional().describe("Mood rating 1-5"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new JournalEntriesDB(ctx.supabase);
        return db.upsertEntry({
          user_id: ctx.userId,
          entry_date: params.date,
          content: params.content,
          mood: params.mood,
        });
      },
    },
  ];
}
