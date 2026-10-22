/** Transport-neutral Journal entry, link, and persistence contracts. */

import type { MoodRating, JournalLinkType } from "@/lib/db/types";

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

export interface JournalDeletionRequest {
  userId: string;
  entryId: string;
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

export type JournalDeletionPersistenceOutcome =
  | { type: "deleted" }
  | { type: "not-found" };

export interface JournalDeletionPersistence {
  deleteEntry(
    request: JournalDeletionRequest,
  ): Promise<JournalDeletionPersistenceOutcome>;
}

export type JournalMutationPersistence = Partial<
  JournalSavePersistence & JournalLinkPersistence & JournalDeletionPersistence
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

export type JournalDeletionOutcome = JournalDeletionPersistenceOutcome;
