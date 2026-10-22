/** Normalizes Journal documents, dates, and link commands before persistence. */

import type { JournalLinkType } from "@/lib/db/types";

import type {
  JournalSavePersistenceRequest,
  JournalLinkRequest,
  JournalUnlinkRequest,
  JournalSaveRequest,
  JournalEntryChanges,
} from "./write-contract";

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

export function isRecord(value: unknown): value is Record<string, unknown> {
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

export function isJournalLinkType(value: unknown): value is JournalLinkType {
  return value === "habit" || value === "task" || value === "project";
}

export function normalizeLinkRequest(request: JournalLinkRequest): NormalizedLinkRequest {
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

export function normalizeUnlinkRequest(
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

export function normalizeRequest(request: JournalSaveRequest): NormalizedRequest {
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
