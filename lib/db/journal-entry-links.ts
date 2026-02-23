import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalEntryLink, JournalEntryLinkInsert } from "./types";
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

  /**
   * Add a link between a journal entry and a habit/task/project.
   * Throws on error including unique constraint violations for duplicate links.
   */
  async addLink(link: JournalEntryLinkInsert): Promise<JournalEntryLink> {
    const { data, error } = await this.supabase
      .from("journal_entry_links")
      .insert(link)
      .select()
      .single();

    if (error) {
      log.error("JournalEntryLinksDB.addLink failed", error, {
        entry_id: link.entry_id,
        link_type: link.link_type,
      });
      throw error;
    }
    return data;
  }

  /**
   * Remove a link by ID and entry ID.
   */
  async removeLink(linkId: string, entryId: string): Promise<void> {
    const { error } = await this.supabase
      .from("journal_entry_links")
      .delete()
      .eq("id", linkId)
      .eq("entry_id", entryId);

    if (error) {
      log.error("JournalEntryLinksDB.removeLink failed", error, {
        linkId,
        entryId,
      });
      throw error;
    }
  }
}
