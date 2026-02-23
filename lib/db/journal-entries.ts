import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  JournalEntry,
  JournalEntryInsert,
  JournalEntryUpdate,
  JournalCalendarDay,
} from "./types";
import { log } from "@/lib/logger";

export class JournalEntriesDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create or update a journal entry for a given date.
   * Uses upsert on the UNIQUE(user_id, entry_date) constraint.
   * CRITICAL: entry data MUST include user_id and entry_date for onConflict to work.
   */
  async upsertEntry(entry: JournalEntryInsert): Promise<JournalEntry> {
    const { data, error } = await this.supabase
      .from("journal_entries")
      .upsert(entry, { onConflict: "user_id,entry_date" })
      .select()
      .single();

    if (error) {
      log.error("JournalEntriesDB.upsertEntry failed", error, {
        entry_date: entry.entry_date,
      });
      throw error;
    }
    return data;
  }

  /**
   * Get entry by date for a user (the primary access pattern).
   * Uses maybeSingle() since entry may not exist for a date.
   */
  async getEntryByDate(
    userId: string,
    date: string
  ): Promise<JournalEntry | null> {
    const { data, error } = await this.supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("entry_date", date)
      .maybeSingle();

    if (error) {
      log.error("JournalEntriesDB.getEntryByDate failed", error, {
        date,
      });
      throw error;
    }
    return data;
  }

  /**
   * Get entry by ID (for /api/journal/[id] routes).
   * Returns null if not found (PGRST116).
   */
  async getEntry(
    entryId: string,
    userId: string
  ): Promise<JournalEntry | null> {
    const { data, error } = await this.supabase
      .from("journal_entries")
      .select("*")
      .eq("id", entryId)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      log.error("JournalEntriesDB.getEntry failed", error, { entryId });
      throw error;
    }
    return data;
  }

  /**
   * Update a journal entry by ID.
   */
  async updateEntry(
    entryId: string,
    userId: string,
    updates: JournalEntryUpdate
  ): Promise<JournalEntry> {
    const { data, error } = await this.supabase
      .from("journal_entries")
      .update(updates)
      .eq("id", entryId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      log.error("JournalEntriesDB.updateEntry failed", error, { entryId });
      throw error;
    }
    return data;
  }

  /**
   * Delete a journal entry by ID.
   */
  async deleteEntry(entryId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from("journal_entries")
      .delete()
      .eq("id", entryId)
      .eq("user_id", userId);

    if (error) {
      log.error("JournalEntriesDB.deleteEntry failed", error, { entryId });
      throw error;
    }
  }

  /**
   * Calendar data: lightweight query returning date + mood + title for a month.
   * Never loads full content (performance).
   */
  async getCalendarMonth(
    userId: string,
    year: number,
    month: number
  ): Promise<JournalCalendarDay[]> {
    const monthStr = String(month).padStart(2, "0");
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-31`;

    const { data, error } = await this.supabase
      .from("journal_entries")
      .select("entry_date, mood, title")
      .eq("user_id", userId)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .order("entry_date", { ascending: true });

    if (error) {
      log.error("JournalEntriesDB.getCalendarMonth failed", error, {
        year,
        month,
      });
      throw error;
    }
    return data || [];
  }

  /**
   * Timeline: paginated entries for infinite scroll.
   * Returns full entries ordered by entry_date DESC with cursor-based pagination.
   */
  async getTimeline(
    userId: string,
    limit = 10,
    cursor?: string
  ): Promise<JournalEntry[]> {
    let query = this.supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt("entry_date", cursor);
    }

    const { data, error } = await query;

    if (error) {
      log.error("JournalEntriesDB.getTimeline failed", error);
      throw error;
    }
    return data || [];
  }
}
