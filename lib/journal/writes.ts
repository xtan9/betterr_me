/** Journal commands, production composition, and delivery response mapping. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  JournalMutationPersistence,
  JournalSaveRequest,
  JournalSaveOutcome,
  JournalLinkRequest,
  JournalLinkOutcome,
  JournalUnlinkRequest,
  JournalUnlinkOutcome,
  JournalDeletionRequest,
  JournalDeletionOutcome,
  JournalEntryMutationRecord,
  JournalLinkMutationRecord,
} from "./write-contract";

import { normalizeRequest, normalizeLinkRequest, normalizeUnlinkRequest } from "./write-validation";

import { SupabaseJournalSavePersistence } from "./journal-persistence";

export type {
  JournalDocument,
  JournalEntryMutationRecord,
  JournalEntryChanges,
  JournalLinkMutationRecord,
  JournalLinkRequest,
  JournalUnlinkRequest,
  JournalDeletionRequest,
  JournalSaveRequest,
  JournalSavePersistenceRequest,
  JournalSavePersistenceOutcome,
  JournalSavePersistence,
  JournalLinkPersistenceOutcome,
  JournalLinkPersistence,
  JournalDeletionPersistenceOutcome,
  JournalDeletionPersistence,
  JournalMutationPersistence,
  JournalSaveOutcome,
  JournalLinkOutcome,
  JournalUnlinkOutcome,
  JournalDeletionOutcome,
} from "./write-contract";

export { SupabaseJournalSavePersistence } from "./journal-persistence";

export class JournalWrites {
  constructor(private readonly persistence: JournalMutationPersistence) {}

  async save(request: JournalSaveRequest): Promise<JournalSaveOutcome> {
    const normalized = normalizeRequest(request);
    if (!normalized.ok) {
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }

    if (!this.persistence.saveEntry) {
      throw new Error("Journal save persistence is not configured");
    }
    return this.persistence.saveEntry(normalized.request);
  }

  async link(request: JournalLinkRequest): Promise<JournalLinkOutcome> {
    const normalized = normalizeLinkRequest(request);
    if (!normalized.ok) {
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }

    if (!this.persistence.linkEntry) {
      throw new Error("Journal link persistence is not configured");
    }
    return this.persistence.linkEntry(normalized.request);
  }

  async unlink(request: JournalUnlinkRequest): Promise<JournalUnlinkOutcome> {
    const normalized = normalizeUnlinkRequest(request);
    if (!normalized.ok) {
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }

    if (!this.persistence.unlinkEntry) {
      throw new Error("Journal unlink persistence is not configured");
    }
    return this.persistence.unlinkEntry(normalized.request);
  }

  async delete(
    request: JournalDeletionRequest,
  ): Promise<JournalDeletionOutcome> {
    if (!this.persistence.deleteEntry) {
      throw new Error("Journal deletion persistence is not configured");
    }
    return this.persistence.deleteEntry(request);
  }
}

export function toJournalEntryResponse(entry: JournalEntryMutationRecord) {
  return {
    id: entry.id,
    user_id: entry.userId,
    entry_date: entry.entryDate,
    title: entry.title,
    content: entry.content,
    mood: entry.mood,
    word_count: entry.wordCount,
    tags: entry.tags,
    prompt_key: entry.promptKey,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

export function toJournalLinkResponse(link: JournalLinkMutationRecord) {
  return {
    id: link.id,
    entry_id: link.entryId,
    link_type: link.linkType,
    link_id: link.targetId,
    created_at: link.createdAt,
  };
}

export function createJournalWrites(supabase: SupabaseClient): JournalWrites {
  return new JournalWrites(new SupabaseJournalSavePersistence(supabase));
}
