"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { JournalTimelineCard } from "@/components/journal/journal-timeline-card";
import { useJournalTimeline } from "@/lib/hooks/use-journal-timeline";
import type { JournalEntry } from "@/lib/db/types";

interface JournalTimelineProps {
  onEntryClick: (date: string) => void;
  /** Increment to trigger a full reset + refetch after create/edit/delete. */
  refreshKey?: number;
}

export function JournalTimeline({
  onEntryClick,
  refreshKey,
}: JournalTimelineProps) {
  const t = useTranslations("journal");

  // Track pages of cursors fetched so far. First page has cursor = null.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const prevRefreshKey = useRef(refreshKey);

  // Detect refreshKey change synchronously during render to reset pagination
  if (
    refreshKey !== undefined &&
    refreshKey !== prevRefreshKey.current
  ) {
    prevRefreshKey.current = refreshKey;
    setCursors([null]);
  }

  // Always fetch the latest cursor (last page)
  const currentCursor = cursors[cursors.length - 1];
  const { entries, hasMore, error, isLoading, mutate } =
    useJournalTimeline(currentCursor);

  // Accumulate entries in a ref keyed by cursor, deduplicate by entry_date
  const pagesRef = useRef<Map<string | null, JournalEntry[]>>(new Map());

  // Store the latest page data
  if (entries.length > 0) {
    pagesRef.current.set(currentCursor, entries);
  }

  // When cursors reset (refreshKey change), clear stale pages
  if (cursors.length === 1 && cursors[0] === null) {
    const firstPage = pagesRef.current.get(null);
    pagesRef.current = new Map();
    if (firstPage && entries.length > 0) {
      pagesRef.current.set(null, entries);
    }
  }

  // Build deduplicated flat list from all pages in order
  const allEntries = useMemo(() => {
    const seen = new Set<string>();
    const result: JournalEntry[] = [];
    for (const c of cursors) {
      const page = pagesRef.current.get(c);
      if (page) {
        for (const entry of page) {
          if (!seen.has(entry.entry_date)) {
            seen.add(entry.entry_date);
            result.push(entry);
          }
        }
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursors, entries]);

  const handleLoadMore = useCallback(() => {
    if (allEntries.length > 0) {
      const lastDate = allEntries[allEntries.length - 1].entry_date;
      setCursors((prev) => [...prev, lastDate]);
    }
  }, [allEntries]);

  // Trigger refetch on refreshKey change
  if (
    refreshKey !== undefined &&
    refreshKey !== prevRefreshKey.current
  ) {
    mutate();
  }

  // Error state
  if (error && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">{t("fetchError")}</p>
      </div>
    );
  }

  // Empty state
  if (allEntries.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">{t("noEntries")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {allEntries.map((entry) => (
        <JournalTimelineCard
          key={entry.entry_date}
          entry={entry}
          onClick={() => onEntryClick(entry.entry_date)}
        />
      ))}

      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {hasMore && !isLoading && (
        <div className="flex justify-center py-2">
          <Button variant="outline" size="sm" onClick={handleLoadMore}>
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
