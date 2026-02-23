"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { useJournalEntry } from "@/lib/hooks/use-journal-entry";
import { useJournalAutosave } from "@/lib/hooks/use-journal-autosave";

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
  const { entry, isLoading, mutate } = useJournalEntry(date);
  const { saveStatus, scheduleSave, flushNow } = useJournalAutosave(
    entry?.id ?? null,
    date
  );

  const [mood, setMood] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const contentRef = useRef<Record<string, unknown> | null>(null);
  const [wordCount, setWordCount] = useState(0);

  // Sync mood from loaded entry
  useEffect(() => {
    if (entry) {
      setMood(entry.mood ?? null);
    }
  }, [entry]);

  // Reset dirty state when modal opens with new data
  useEffect(() => {
    if (open) {
      setIsDirty(false);
    }
  }, [open, date]);

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

      scheduleSave({ content: json, mood, word_count: wc });
    },
    [isDirty, entry, mood, scheduleSave]
  );

  const handleMoodChange = useCallback(
    (newMood: number | null) => {
      setMood(newMood);
      // If we have content to save (dirty or existing entry), trigger save
      if (isDirty || entry) {
        scheduleSave({
          content: contentRef.current ?? entry?.content ?? null,
          mood: newMood,
          word_count: wordCount,
        });
        if (!isDirty) setIsDirty(true);
      }
    },
    [isDirty, entry, scheduleSave, wordCount]
  );

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
    } catch {
      toast.error(t("journal.saveError"));
    }
  }, [entry, mutate, onOpenChange, t]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        // Closing: flush pending changes
        flushNow();
      }
      onOpenChange(newOpen);
    },
    [flushNow, onOpenChange]
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

        {/* Mood selector */}
        <div className="flex-shrink-0 py-2">
          <JournalMoodSelector value={mood} onChange={handleMoodChange} />
        </div>

        {/* Editor area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <JournalEditorSkeleton />
          ) : (
            <JournalEditorLoader
              content={entry?.content ?? null}
              onUpdate={handleEditorUpdate}
            />
          )}
        </div>

        {/* Word count footer */}
        <div className="flex-shrink-0 pt-2 border-t text-xs text-muted-foreground">
          {t("journal.wordCount", { count: wordCount })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
