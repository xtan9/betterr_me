import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalEntryLink } from "./types";
import { log } from "@/lib/logger";

export class JournalEntryLinksDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all links for a journal entry, ordered by creation time.
   */
  async getLinksForEntry(entryId: string): Promise<JournalEntryLink[]> {
    const { data, error } = await this.supabase
      .from("journal_entry_links")
      .select("*")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: true });

    if (error) {
      log.error("JournalEntryLinksDB.getLinksForEntry failed", error, {
        entryId,
      });
      throw error;
    }
    return data || [];
  }

}
