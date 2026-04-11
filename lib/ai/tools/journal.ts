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
        content: z.string().describe("Journal entry content as plain text"),
        mood: z.number().optional().describe("Mood rating 1-5"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new JournalEntriesDB(ctx.supabase);
        // Convert plain text to minimal Tiptap JSON structure
        const tiptapContent = {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: params.content }] }],
        };
        return db.upsertEntry({
          user_id: ctx.userId,
          entry_date: params.date,
          content: tiptapContent,
          mood: params.mood,
          title: "",
          word_count: params.content.split(/\s+/).filter(Boolean).length,
          tags: [],
          prompt_key: null,
        });
      },
    },
    {
      name: "deleteJournalEntry",
      description:
        "Delete a journal entry. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        entryId: z.string().describe("The journal entry ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new JournalEntriesDB(ctx.supabase);
        await db.deleteEntry(params.entryId, ctx.userId);
        return { success: true };
      },
    },
  ];
}
