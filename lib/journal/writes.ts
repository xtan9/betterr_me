import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoodRating } from "@/lib/db/types";

export type JournalDocument = Record<string, unknown>;

export interface JournalEntryMutationRecord {
  id: string;
  userId: string;
  entryDate: string;
  title: string;
  content: JournalDocument;
  mood: MoodRating | null;
  wordCount: number;
  tags: string[];
  promptKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryChanges {
  title?: string;
  content?: JournalDocument;
  mood?: MoodRating | null;
  wordCount?: number;
  tags?: string[];
  promptKey?: string | null;
}

export interface JournalSaveRequest extends JournalEntryChanges {
  userId: string;
  entryId?: string;
  entryDate?: string;
}

export interface JournalSavePersistenceRequest {
  userId: string;
  entryId: string | null;
  entryDate: string | null;
  changes: JournalEntryChanges;
}

export type JournalSavePersistenceOutcome =
  | { type: "created"; entry: JournalEntryMutationRecord }
  | { type: "updated"; entry: JournalEntryMutationRecord }
  | { type: "conflict" }
  | { type: "not-found" };

export interface JournalSavePersistence {
  saveEntry(
    request: JournalSavePersistenceRequest,
  ): Promise<JournalSavePersistenceOutcome>;
}

export type JournalSaveOutcome =
  | { type: "created"; entry: JournalEntryMutationRecord }
  | { type: "updated"; entry: JournalEntryMutationRecord }
  | { type: "conflict" }
  | { type: "not-found" }
  | { type: "invalid"; field: string; message: string };

type NormalizedRequest =
  | { ok: true; request: JournalSavePersistenceRequest }
  | { ok: false; field: string; message: string };

const EMPTY_DOCUMENT = { type: "doc", content: [] };
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValue(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function invalid(field: string, message: string): NormalizedRequest {
  return { ok: false, field, message };
}

function normalizeDate(value: unknown):
  | { ok: true; value: string }
  | { ok: false; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: "Entry date is required" };
  }

  const date = value.trim();
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    return { ok: false, message: "Entry date must use YYYY-MM-DD format" };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return { ok: false, message: "Entry date is invalid" };
  }

  return { ok: true, value: date };
}

function normalizeChanges(
  request: JournalSaveRequest,
  isCreate: boolean,
):
  | { ok: true; changes: JournalEntryChanges }
  | { ok: false; field: string; message: string } {
  const changes: JournalEntryChanges = {};
  const hasChanges =
    hasValue(request, "title") ||
    hasValue(request, "content") ||
    hasValue(request, "mood") ||
    hasValue(request, "wordCount") ||
    hasValue(request, "tags") ||
    hasValue(request, "promptKey");

  if (!isCreate && !hasChanges) {
    return {
      ok: false,
      field: "changes",
      message: "At least one journal field must be provided",
    };
  }

  if (isCreate || hasValue(request, "title")) {
    if (request.title !== undefined && typeof request.title !== "string") {
      return { ok: false, field: "title", message: "Title is required" };
    }
    const title = typeof request.title === "string" ? request.title.trim() : "";
    if (title.length > 200) {
      return {
        ok: false,
        field: "title",
        message: "Title must be 200 characters or less",
      };
    }
    changes.title = title;
  }

  if (isCreate || hasValue(request, "content")) {
    if (request.content !== undefined && !isRecord(request.content)) {
      return { ok: false, field: "content", message: "Content is required" };
    }
    changes.content = request.content ?? { ...EMPTY_DOCUMENT, content: [] };
  }

  if (isCreate || hasValue(request, "mood")) {
    if (
      request.mood !== undefined &&
      request.mood !== null &&
      (typeof request.mood !== "number" ||
        !Number.isInteger(request.mood) ||
        request.mood < 1 ||
        request.mood > 5)
    ) {
      return {
        ok: false,
        field: "mood",
        message: "Mood must be between 1 and 5",
      };
    }
    changes.mood = request.mood ?? null;
  }

  if (isCreate || hasValue(request, "wordCount")) {
    if (
      request.wordCount !== undefined &&
      (typeof request.wordCount !== "number" ||
        !Number.isInteger(request.wordCount) ||
        request.wordCount < 0)
    ) {
      return {
        ok: false,
        field: "wordCount",
        message: "Word count must be a non-negative integer",
      };
    }
    changes.wordCount = request.wordCount ?? 0;
  }

  if (isCreate || hasValue(request, "tags")) {
    if (
      request.tags !== undefined &&
      (!Array.isArray(request.tags) ||
        request.tags.length > 20 ||
        request.tags.some((tag) => typeof tag !== "string" || tag.length > 50))
    ) {
      return {
        ok: false,
        field: "tags",
        message: "Tags must contain at most 20 short text values",
      };
    }
    const tags = [
      ...new Set(
        (request.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      ),
    ];
    if (tags.some((tag) => tag.length > 50)) {
      return {
        ok: false,
        field: "tags",
        message: "Tags must contain at most 20 short text values",
      };
    }
    changes.tags = tags;
  }

  if (isCreate || hasValue(request, "promptKey")) {
    if (
      request.promptKey !== undefined &&
      request.promptKey !== null &&
      (typeof request.promptKey !== "string" || request.promptKey.length > 100)
    ) {
      return {
        ok: false,
        field: "promptKey",
        message: "Prompt key must be 100 characters or less",
      };
    }
    changes.promptKey =
      typeof request.promptKey === "string"
        ? request.promptKey.trim() || null
        : null;
  }

  return { ok: true, changes };
}

function normalizeRequest(request: JournalSaveRequest): NormalizedRequest {
  if (!isRecord(request) || typeof request.userId !== "string") {
    return invalid("userId", "User identity is required");
  }

  const userId = request.userId.trim();
  if (!userId) return invalid("userId", "User identity is required");

  let entryId: string | null = null;
  if (hasValue(request, "entryId") && request.entryId !== undefined) {
    if (typeof request.entryId !== "string" || !request.entryId.trim()) {
      return invalid("entryId", "Entry identity must be text");
    }
    entryId = request.entryId.trim();
  }

  let entryDate: string | null = null;
  if (hasValue(request, "entryDate") && request.entryDate !== undefined) {
    const normalizedDate = normalizeDate(request.entryDate);
    if (!normalizedDate.ok) return invalid("entryDate", normalizedDate.message);
    entryDate = normalizedDate.value;
  }

  if (!entryId && !entryDate) {
    return invalid("entryDate", "Entry date is required when entry ID is absent");
  }

  const normalizedChanges = normalizeChanges(request, entryId === null);
  if (!normalizedChanges.ok) return normalizedChanges;

  return {
    ok: true,
    request: {
      userId,
      entryId,
      entryDate,
      changes: normalizedChanges.changes,
    },
  };
}

export class JournalWrites {
  constructor(private readonly persistence: JournalSavePersistence) {}

  async save(request: JournalSaveRequest): Promise<JournalSaveOutcome> {
    const normalized = normalizeRequest(request);
    if (!normalized.ok) {
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }

    return this.persistence.saveEntry(normalized.request);
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

export function createJournalWrites(supabase: SupabaseClient): JournalWrites {
  return new JournalWrites(new SupabaseJournalSavePersistence(supabase));
}

export class SupabaseJournalSavePersistence implements JournalSavePersistence {
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
