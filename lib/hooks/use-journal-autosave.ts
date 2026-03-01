"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface AutosaveOptions {
  delay?: number;
  onSaved?: () => void | Promise<void>;
}

export function useJournalAutosave(
  entryId: string | null,
  entryDate: string,
  options: AutosaveOptions = {}
) {
  const { delay = 2000, onSaved } = options;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown> | null>(null);
  const entryIdRef = useRef<string | null>(entryId);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    entryIdRef.current = entryId;
  }, [entryId]);

  const save = useCallback(
    async (data: Record<string, unknown>) => {
      setSaveStatus("saving");
      try {
        const currentId = entryIdRef.current;
        const url = currentId
          ? `/api/journal/${currentId}`
          : "/api/journal";
        const method = currentId ? "PATCH" : "POST";
        const body = currentId
          ? data
          : { ...data, entry_date: entryDate };

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error("Save failed");
        const result = await res.json();

        // After first POST, store the new entry ID for subsequent PATCH calls
        if (!currentId && result.entry?.id) {
          entryIdRef.current = result.entry.id;
        }

        pendingRef.current = null;
        setSaveStatus("saved");
        try {
          await onSavedRef.current?.();
        } catch (callbackError) {
          console.error("Journal onSaved callback failed", { entryId: entryIdRef.current, entryDate, callbackError });
        }
        return result.entry;
      } catch (error) {
        // Use console.error in client hook — log.error is server-only
        console.error("Journal autosave failed", { entryId: entryIdRef.current, entryDate, error });
        setSaveStatus("error");
        return null;
      }
    },
    [entryDate]
  );

  const scheduleSave = useCallback(
    (data: Record<string, unknown>) => {
      pendingRef.current = data;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (pendingRef.current) {
          save(pendingRef.current);
        }
      }, delay);
    },
    [save, delay]
  );

  const flushNow = useCallback(async () => {
    if (pendingRef.current) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const result = await save(pendingRef.current);
      if (result === null) {
        throw new Error("Journal flush failed");
      }
      return result;
    }
    return null;
  }, [save]);

  // beforeunload fallback: flush pending save via sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingRef.current) {
        // sendBeacon always sends POST — use upsert endpoint for both new and existing
        const body = { ...pendingRef.current, entry_date: entryDate };
        const queued = navigator.sendBeacon(
          "/api/journal",
          new Blob([JSON.stringify(body)], { type: "application/json" })
        );
        if (!queued) {
          fetch("/api/journal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            keepalive: true,
          }).catch((err) => {
            // Best-effort logging — beforeunload cannot surface UI feedback
            console.error("Journal beforeunload fallback fetch failed", err);
          });
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [entryDate]);

  return {
    saveStatus,
    scheduleSave,
    flushNow,
    savedEntryId: entryIdRef.current,
  };
}
