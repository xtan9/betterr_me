"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JournalEditorLoader } from "./journal-editor-loader";
import { JournalEditorSkeleton } from "./journal-editor-skeleton";
import { JournalMoodSelector } from "./journal-mood-selector";
import { JournalSaveStatus } from "./journal-save-status";
import { JournalDeleteDialog } from "./journal-delete-dialog";
import { JournalLinkChips } from "./journal-link-chips";
import { JournalLinkSelector } from "./journal-link-selector";
import { PromptBrowserSheet } from "./prompt-browser-sheet";
import { PromptBanner } from "./prompt-banner";
import { useJournalEntry } from "@/lib/hooks/use-journal-entry";
import { useJournalAutosave } from "@/lib/hooks/use-journal-autosave";
import { useJournalLinks, removeLink } from "@/lib/hooks/use-journal-links";
import type { MoodRating } from "@/lib/db/types";

interface JournalEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string; // YYYY-MM-DD format
}

export function JournalEntryModal({
  open,
  onOpenChange,
  date,
}: JournalEntryModalProps) {
  const t = useTranslations();
  const { entry, error: entryError, isLoading, mutate } = useJournalEntry(date);
  const { saveStatus, scheduleSave, flushNow } = useJournalAutosave(
    entry?.id ?? null,
    date,
    { onSaved: async () => { await mutate(); } }
  );

  const [mood, setMood] = useState<MoodRating | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const contentRef = useRef<Record<string, unknown> | null>(null);
  const moodRef = useRef<MoodRating | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [promptKey, setPromptKey] = useState<string | null>(null);
  const [promptSheetOpen, setPromptSheetOpen] = useState(false);
  const promptKeyRef = useRef<string | null>(null);

  const { links, mutate: mutateLinks } = useJournalLinks(entry?.id ?? null);

  const handleRemoveLink = useCallback(
    async (linkId: string) => {
      if (!entry) return;
      try {
        await removeLink(entry.id, linkId);
        await mutateLinks();
      } catch (error) {
        // Client component — console.error is intentional (no server log module)
        console.error("Failed to remove journal link", error);
        toast.error(t("journal.links.removeError"));
      }
    },
    [entry, mutateLinks, t],
  );

  const handleLinkAdded = useCallback(() => {
    mutateLinks();
  }, [mutateLinks]);

  // Keep refs in sync to avoid stale closures in Tiptap onUpdate
  useEffect(() => {
    promptKeyRef.current = promptKey;
  }, [promptKey]);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  // Show toast on fetch error
  useEffect(() => {
    if (entryError) {
      toast.error(t("journal.fetchError"));
    }
  }, [entryError, t]);

  // Reset dirty state when modal opens/date changes
  useEffect(() => {
    if (open) {
      setIsDirty(false);
    }
  }, [open, date]);

  // Sync mood and prompt from entry (runs on open and when entry loads)
  useEffect(() => {
    if (open) {
      setMood(entry?.mood ?? null);
      setPromptKey(entry?.prompt_key ?? null);
    }
  }, [open, entry]);

  const handleEditorUpdate = useCallback(
    (json: Record<string, unknown>, wc: number) => {
      contentRef.current = json;
      setWordCount(wc);

      // Skip initial onUpdate from Tiptap (Pitfall 5)
      if (!isDirty) {
        // Check if content actually differs from loaded entry
        if (
          entry?.content &&
          JSON.stringify(json) === JSON.stringify(entry.content)
        ) {
          return;
        }
        setIsDirty(true);
      }

      scheduleSave({ content: json, mood: moodRef.current, word_count: wc, prompt_key: promptKeyRef.current });
    },
    [isDirty, entry, scheduleSave]
  );

  const handleMoodChange = useCallback(
    (newMood: number | null) => {
      setMood(newMood as MoodRating | null);
      // If we have content to save (dirty or existing entry), trigger save
      if (isDirty || entry) {
        scheduleSave({
          content: contentRef.current ?? entry?.content ?? null,
          mood: newMood,
          word_count: wordCount,
          prompt_key: promptKeyRef.current,
        });
        if (!isDirty) setIsDirty(true);
      }
    },
    [isDirty, entry, scheduleSave, wordCount]
  );

  const handlePromptSelect = useCallback(
    (key: string) => {
      setPromptKey(key);
      setPromptSheetOpen(false);
      if (!isDirty) setIsDirty(true);
      scheduleSave({
        content: contentRef.current ?? entry?.content ?? null,
        mood,
        word_count: wordCount,
        prompt_key: key,
      });
    },
    [isDirty, entry, scheduleSave, mood, wordCount]
  );

  const handlePromptDismiss = useCallback(() => {
    setPromptKey(null);
    if (isDirty || entry) {
      scheduleSave({
        content: contentRef.current ?? entry?.content ?? null,
        mood,
        word_count: wordCount,
        prompt_key: null,
      });
    }
  }, [isDirty, entry, scheduleSave, mood, wordCount]);

  const handleDelete = useCallback(async () => {
    if (!entry) return;
    try {
      const res = await fetch(`/api/journal/${entry.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      await mutate();
      toast.success(t("journal.deleteConfirm.title"));
      onOpenChange(false);
    } catch (error) {
      // Client component — console.error is intentional (no server log module)
      console.error("Failed to delete journal entry", error);
      toast.error(t("journal.deleteError"));
    }
  }, [entry, mutate, onOpenChange, t]);

  const handleOpenChange = useCallback(
    async (newOpen: boolean) => {
      if (!newOpen) {
        // Closing: flush pending changes — await so we can notify on failure
        try {
          await flushNow();
        } catch (error) {
          // Client component — console.error is intentional (no server log module)
          console.error("Failed to flush journal changes on close", error);
          toast.error(t("journal.saveError"));
        }
      }
      onOpenChange(newOpen);
    },
    [flushNow, onOpenChange, t]
  );

  const title = entry ? t("journal.editEntry") : t("journal.newEntry");

  // Format date for display
  const formattedDate = (() => {
    const [year, month, day] = date.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  })();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full sm:max-w-[70vw] max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <p className="text-sm text-muted-foreground">{formattedDate}</p>
            </div>
            <div className="flex items-center gap-2">
              <JournalSaveStatus status={saveStatus} />
              {entry && <JournalDeleteDialog onDelete={handleDelete} />}
            </div>
          </div>
        </DialogHeader>

        {/* Mood selector and prompt trigger */}
        <div className="flex-shrink-0 py-2 flex items-center justify-between">
          <JournalMoodSelector value={mood} onChange={handleMoodChange} />
          <button
            type="button"
            onClick={() => setPromptSheetOpen(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Lightbulb className="size-3.5" />
            {t("journal.prompts.trigger")}
          </button>
        </div>

        {/* Prompt banner */}
        {promptKey && (
          <div className="flex-shrink-0">
            <PromptBanner promptKey={promptKey} onDismiss={handlePromptDismiss} />
          </div>
        )}

        {/* Editor area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <JournalEditorSkeleton />
          ) : (
            <JournalEditorLoader
              content={entry?.content ?? null}
              onUpdate={handleEditorUpdate}
              placeholder={t("journal.editor.placeholder")}
            />
          )}
        </div>

        {/* Linked items */}
        {entry && (
          <div className="flex-shrink-0 py-2 space-y-2" data-testid="journal-links-section">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("journal.links.title")}
              </span>
              <JournalLinkSelector
                entryId={entry.id}
                existingLinks={links}
                onLinkAdded={handleLinkAdded}
                onLinkRemoved={handleLinkAdded}
              />
            </div>
            <JournalLinkChips links={links} onRemove={handleRemoveLink} />
          </div>
        )}

        {/* Word count footer */}
        <div className="flex-shrink-0 pt-2 border-t text-xs text-muted-foreground">
          {t("journal.wordCount", { count: wordCount })}
        </div>

        {/* Prompt browser sheet */}
        <PromptBrowserSheet
          open={promptSheetOpen}
          onOpenChange={setPromptSheetOpen}
          onSelect={handlePromptSelect}
          selectedKey={promptKey}
        />
      </DialogContent>
    </Dialog>
  );
}
