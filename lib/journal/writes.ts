import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalLinkType, MoodRating } from "@/lib/db/types";

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

export interface JournalLinkMutationRecord {
  id: string;
  entryId: string;
  linkType: JournalLinkType;
  targetId: string;
  createdAt: string;
}

export interface JournalLinkRequest {
  userId: string;
  entryId: string;
  linkType: JournalLinkType;
  targetId: string;
}

export interface JournalUnlinkRequest {
  userId: string;
  entryId: string;
  linkId: string;
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

export type JournalLinkPersistenceOutcome =
  | { type: "linked"; link: JournalLinkMutationRecord }
  | { type: "already-applied"; link: JournalLinkMutationRecord }
  | { type: "unlinked"; link: JournalLinkMutationRecord }
  | { type: "conflict" }
  | { type: "not-found" };

export interface JournalLinkPersistence {
  linkEntry(
    request: JournalLinkRequest,
  ): Promise<
    Extract<
      JournalLinkPersistenceOutcome,
      { type: "linked" | "already-applied" | "conflict" | "not-found" }
    >
  >;
  unlinkEntry(
    request: JournalUnlinkRequest,
  ): Promise<
    Extract<
      JournalLinkPersistenceOutcome,
      { type: "unlinked" | "conflict" | "not-found" }
    >
  >;
}

export type JournalMutationPersistence = Partial<
  JournalSavePersistence & JournalLinkPersistence
>;

export type JournalSaveOutcome =
  | { type: "created"; entry: JournalEntryMutationRecord }
  | { type: "updated"; entry: JournalEntryMutationRecord }
  | { type: "conflict" }
  | { type: "not-found" }
  | { type: "invalid"; field: string; message: string };

export type JournalLinkOutcome =
  | Extract<JournalLinkPersistenceOutcome, { type: "linked" | "already-applied" }>
  | { type: "conflict" }
  | { type: "not-found" }
  | { type: "invalid"; field: string; message: string };

export type JournalUnlinkOutcome =
  | Extract<JournalLinkPersistenceOutcome, { type: "unlinked" }>
  | { type: "conflict" }
  | { type: "not-found" }
  | { type: "invalid"; field: string; message: string };

type NormalizedRequest =
  | { ok: true; request: JournalSavePersistenceRequest }
  | { ok: false; field: string; message: string };

type NormalizedLinkRequest =
  | { ok: true; request: JournalLinkRequest }
  | { ok: false; field: string; message: string };

type NormalizedUnlinkRequest =
  | { ok: true; request: JournalUnlinkRequest }
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

function invalidLinkRequest(
  field: string,
  message: string,
): { ok: false; field: string; message: string } {
  return { ok: false, field, message };
}

function normalizeRequiredIdentity(
  value: unknown,
  field: string,
  message: string,
): { ok: true; value: string } | { ok: false; field: string; message: string } {
  if (typeof value !== "string" || !value.trim()) {
    return invalidLinkRequest(field, message);
  }
  return { ok: true, value: value.trim() };
}

function isJournalLinkType(value: unknown): value is JournalLinkType {
  return value === "habit" || value === "task" || value === "project";
}

function normalizeLinkRequest(request: JournalLinkRequest): NormalizedLinkRequest {
  if (!isRecord(request)) {
    return invalidLinkRequest("request", "Link request is required");
  }

  const userId = normalizeRequiredIdentity(
    request.userId,
    "userId",
    "User identity is required",
  );
  if (!userId.ok) return userId;

  const entryId = normalizeRequiredIdentity(
    request.entryId,
    "entryId",
    "Entry identity is required",
  );
  if (!entryId.ok) return entryId;

  if (!isJournalLinkType(request.linkType)) {
    return invalidLinkRequest("linkType", "Link type is invalid");
  }

  const targetId = normalizeRequiredIdentity(
    request.targetId,
    "targetId",
    "Target identity is required",
  );
  if (!targetId.ok) return targetId;

  return {
    ok: true,
    request: {
      userId: userId.value,
      entryId: entryId.value,
      linkType: request.linkType,
      targetId: targetId.value,
    },
  };
}

function normalizeUnlinkRequest(
  request: JournalUnlinkRequest,
): NormalizedUnlinkRequest {
  if (!isRecord(request)) {
    return invalidLinkRequest("request", "Unlink request is required");
  }

  const userId = normalizeRequiredIdentity(
    request.userId,
    "userId",
    "User identity is required",
  );
  if (!userId.ok) return userId;

  const entryId = normalizeRequiredIdentity(
    request.entryId,
    "entryId",
    "Entry identity is required",
  );
  if (!entryId.ok) return entryId;

  const linkId = normalizeRequiredIdentity(
    request.linkId,
    "linkId",
    "Link identity is required",
  );
  if (!linkId.ok) return linkId;

  return {
    ok: true,
    request: {
      userId: userId.value,
      entryId: entryId.value,
      linkId: linkId.value,
    },
  };
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
