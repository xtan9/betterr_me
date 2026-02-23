"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useJournalAutosave(
  entryId: string | null,
  entryDate: string,
  delay = 2000
) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown> | null>(null);
  const entryIdRef = useRef<string | null>(entryId);

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
        return result.entry;
      } catch {
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
      return save(pendingRef.current);
    }
    return null;
  }, [save]);

  // beforeunload fallback: flush pending save via sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingRef.current) {
        const currentId = entryIdRef.current;
        const url = currentId
          ? `/api/journal/${currentId}`
          : "/api/journal";
        const body = currentId
          ? pendingRef.current
          : { ...pendingRef.current, entry_date: entryDate };

        navigator.sendBeacon(
          url,
          new Blob([JSON.stringify(body)], { type: "application/json" })
        );
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
