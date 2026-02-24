import { z } from "zod";
import type { MoodRating } from "@/lib/db/types";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const journalEntryFormSchema = z.object({
  entry_date: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  title: z
    .string()
    .trim()
    .max(200, "Title must be 200 characters or less")
    .default(""),
  content: z.record(z.unknown()).default({ type: "doc", content: [] }),
  mood: z.number().int().min(1).max(5).nullable().default(null) as unknown as z.ZodDefault<z.ZodNullable<z.ZodType<MoodRating>>>,
  word_count: z.number().int().min(0).default(0),
  tags: z.array(z.string().max(50)).max(20).default([]),
  prompt_key: z.string().max(100).nullable().optional(),
});

export type JournalEntryFormValues = z.infer<typeof journalEntryFormSchema>;

export const journalEntryUpdateSchema = journalEntryFormSchema
  .partial()
  .omit({ entry_date: true })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type JournalEntryUpdateValues = z.infer<typeof journalEntryUpdateSchema>;

export const journalLinkSchema = z.object({
  link_type: z.enum(["habit", "task", "project"]),
  link_id: z.string().uuid("Invalid link ID"),
});

export type JournalLinkValues = z.infer<typeof journalLinkSchema>;
