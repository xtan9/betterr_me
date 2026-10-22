/** Maps Journal commands to atomic Supabase operations and decodes stored records. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MoodRating } from "@/lib/db/types";

import type {
  JournalMutationPersistence,
  JournalSavePersistenceRequest,
  JournalSavePersistenceOutcome,
  JournalLinkRequest,
  JournalLinkPersistenceOutcome,
  JournalUnlinkRequest,
  JournalDeletionRequest,
  JournalDeletionPersistenceOutcome,
  JournalEntryChanges,
  JournalEntryMutationRecord,
  JournalLinkMutationRecord,
} from "./write-contract";

import { isRecord, isJournalLinkType } from "./write-validation";

export class SupabaseJournalSavePersistence implements JournalMutationPersistence {
  constructor(private readonly supabase: SupabaseClient) {}

  async saveEntry(
    request: JournalSavePersistenceRequest,
  ): Promise<JournalSavePersistenceOutcome> {
    const { data, error } = await this.supabase.rpc("save_journal_entry", {
      p_user_id: request.userId,
      p_entry_id: request.entryId,
      p_entry_date: request.entryDate,
      p_changes: toStoredChanges(request.changes),
    });
    if (error) throw error;
    return mapStoredSaveOutcome(data);
  }

  async linkEntry(
    request: JournalLinkRequest,
  ): Promise<
    Extract<
      JournalLinkPersistenceOutcome,
      { type: "linked" | "already-applied" | "conflict" | "not-found" }
    >
  > {
    const { data, error } = await this.supabase.rpc("link_journal_entry", {
      p_user_id: request.userId,
      p_entry_id: request.entryId,
      p_link_type: request.linkType,
      p_link_id: request.targetId,
    });
    if (error) throw error;
    return mapStoredLinkOutcome(data, "link");
  }

  async unlinkEntry(
    request: JournalUnlinkRequest,
  ): Promise<
    Extract<
      JournalLinkPersistenceOutcome,
      { type: "unlinked" | "conflict" | "not-found" }
    >
  > {
    const { data, error } = await this.supabase.rpc("unlink_journal_entry", {
      p_user_id: request.userId,
      p_entry_id: request.entryId,
      p_link_id: request.linkId,
    });
    if (error) throw error;
    return mapStoredLinkOutcome(data, "unlink");
  }

  async deleteEntry(
    request: JournalDeletionRequest,
  ): Promise<JournalDeletionPersistenceOutcome> {
    const { data, error } = await this.supabase.rpc(
      "delete_journal_entry_atomically",
      {
        p_entry_id: request.entryId,
        p_user_id: request.userId,
      },
    );
    if (error) throw error;
    return mapStoredJournalDeletionOutcome(data);
  }
}

function toStoredChanges(changes: JournalEntryChanges): Record<string, unknown> {
  return {
    ...(changes.title === undefined ? {} : { title: changes.title }),
    ...(changes.content === undefined ? {} : { content: changes.content }),
    ...(changes.mood === undefined ? {} : { mood: changes.mood }),
    ...(changes.wordCount === undefined ? {} : { word_count: changes.wordCount }),
    ...(changes.tags === undefined ? {} : { tags: changes.tags }),
    ...(changes.promptKey === undefined ? {} : { prompt_key: changes.promptKey }),
  };
}

function toJournalMutationRecord(value: unknown): JournalEntryMutationRecord {
  if (!isRecord(value)) {
    throw new Error("Invalid journal entry returned by the database");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.user_id !== "string" ||
    typeof record.entry_date !== "string" ||
    typeof record.title !== "string" ||
    !isRecord(record.content) ||
    (record.mood !== null &&
      (typeof record.mood !== "number" ||
        !Number.isInteger(record.mood) ||
        record.mood < 1 ||
        record.mood > 5)) ||
    (typeof record.word_count !== "number" ||
      !Number.isInteger(record.word_count) ||
      record.word_count < 0) ||
    !Array.isArray(record.tags) ||
    !record.tags.every((tag) => typeof tag === "string") ||
    (record.prompt_key !== null && typeof record.prompt_key !== "string") ||
    typeof record.created_at !== "string" ||
    typeof record.updated_at !== "string"
  ) {
    throw new Error("Invalid journal entry returned by the database");
  }

  return {
    id: record.id,
    userId: record.user_id,
    entryDate: record.entry_date,
    title: record.title,
    content: record.content,
    mood: record.mood as MoodRating | null,
    wordCount: record.word_count,
    tags: record.tags,
    promptKey: record.prompt_key,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function mapStoredSaveOutcome(value: unknown): JournalSavePersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid journal save outcome returned by the database");
  }
  if (value.type === "conflict" || value.type === "not-found") {
    return { type: value.type };
  }
  if ((value.type === "created" || value.type === "updated") && value.entry) {
    return {
      type: value.type,
      entry: toJournalMutationRecord(value.entry),
    };
  }
  throw new Error("Invalid journal save outcome returned by the database");
}

function toJournalLinkMutationRecord(value: unknown): JournalLinkMutationRecord {
  if (!isRecord(value)) {
    throw new Error("Invalid journal link returned by the database");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.entry_id !== "string" ||
    !isJournalLinkType(record.link_type) ||
    typeof record.link_id !== "string" ||
    typeof record.created_at !== "string"
  ) {
    throw new Error("Invalid journal link returned by the database");
  }

  return {
    id: record.id,
    entryId: record.entry_id,
    linkType: record.link_type,
    targetId: record.link_id,
    createdAt: record.created_at,
  };
}

function mapStoredLinkOutcome(
  value: unknown,
  operation: "link",
): Extract<
  JournalLinkPersistenceOutcome,
  { type: "linked" | "already-applied" | "conflict" | "not-found" }
>;

function mapStoredLinkOutcome(
  value: unknown,
  operation: "unlink",
): Extract<
  JournalLinkPersistenceOutcome,
  { type: "unlinked" | "conflict" | "not-found" }
>;

function mapStoredLinkOutcome(
  value: unknown,
  operation: "link" | "unlink",
): JournalLinkPersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid journal link outcome returned by the database");
  }

  if (value.type === "conflict" || value.type === "not-found") {
    return { type: value.type };
  }

  const validType =
    operation === "link"
      ? value.type === "linked" || value.type === "already-applied"
      : value.type === "unlinked";
  if (validType && value.link) {
    return {
      type: value.type,
      link: toJournalLinkMutationRecord(value.link),
    } as Extract<
      JournalLinkPersistenceOutcome,
      { type: "linked" | "already-applied" | "unlinked" }
    >;
  }

  throw new Error("Invalid journal link outcome returned by the database");
}

function mapStoredJournalDeletionOutcome(
  value: unknown,
): JournalDeletionPersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid journal deletion outcome returned by the database");
  }

  if (value.type === "deleted" || value.type === "not-found") {
    return { type: value.type };
  }

  throw new Error("Invalid journal deletion outcome returned by the database");
}
