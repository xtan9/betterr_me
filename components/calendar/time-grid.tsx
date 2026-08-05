"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { getLocalDateString } from "@/lib/utils";
import { EventBlock } from "./event-block";
import { AllDayRow } from "./all-day-row";
import { CurrentTimeIndicator } from "./current-time-indicator";
import type { CalendarDisplayItem } from "@/lib/calendar/display";

export const HOUR_HEIGHT = 48; // pixels per hour
const TOTAL_HOURS = 24;
const GRID_HEIGHT = HOUR_HEIGHT * TOTAL_HOURS; // 1152px
const SCROLL_TO_HOUR = 8; // Scroll to 8 AM on mount

interface TimeGridProps {
  /** Array of dates to display as columns (1 for day, 7 for week) */
  dates: Date[];
  /** Map of date string -> display items for that date */
  displayItems: Map<string, CalendarDisplayItem[]>;
  /** Today's date string (YYYY-MM-DD) for highlighting and current time indicator */
  today: string;
  /** Callback when a time slot is clicked */
  onTimeSlotClick?: (
    date: Date,
    time: string,
    position: { x: number; y: number },
  ) => void;
  /** Callback when a drag selection completes */
  onDragSelect?: (
    date: Date,
    startTime: string,
    endTime: string,
    position: { x: number; y: number },
  ) => void;
  /** Callback when a display item is clicked */
  onDisplayItemClick?: (item: CalendarDisplayItem) => void;
}

// --- Helper functions ---

/** Converts "HH:MM:SS" or "HH:MM" to total minutes since midnight */
export function timeToMinutes(time: string): number {
  const parts = time.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/** Returns display item duration in minutes (default 60 if no end_time, minimum 0) */
function getDurationMinutes(item: CalendarDisplayItem): number {
  if (!item.start_time) return 60;
  const startMin = timeToMinutes(item.start_time);
  const endMin = item.end_time ? timeToMinutes(item.end_time) : startMin + 60;
  return Math.max(endMin - startMin, 0);
}

/** Returns formatted hour label like "12 AM", "1 PM" */
function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

/** Converts minutes since midnight to "HH:MM" string */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Snap minutes to nearest 15-minute interval */
function snapTo15(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

/**
 * Computes side-by-side column assignments for overlapping display items.
 * Google Calendar style: overlapping display items share equal-width columns.
 */
export function computeOverlapColumns(
  displayItems: CalendarDisplayItem[],
): Map<string, { column: number; totalColumns: number }> {
  // Sort by start_time, then by duration descending
  const sorted = [...displayItems].sort((a, b) => {
    const cmp = (a.start_time || "").localeCompare(b.start_time || "");
    if (cmp !== 0) return cmp;
    return getDurationMinutes(b) - getDurationMinutes(a);
  });

  // For each display item, find the first available column
  const columns: {
    eventId: string;
    column: number;
    startMin: number;
    endMin: number;
  }[] = [];

  for (const item of sorted) {
    const startMin = timeToMinutes(item.start_time!);
    const endMin = item.end_time
      ? timeToMinutes(item.end_time)
      : startMin + 60;
    let col = 0;
    while (
      columns.some(
        (c) => c.column === col && c.startMin < endMin && c.endMin > startMin,
      )
    ) {
      col++;
    }
    columns.push({ eventId: item.id, column: col, startMin, endMin });
  }

  // Determine total columns per overlap group
  const result = new Map<string, { column: number; totalColumns: number }>();
  for (const entry of columns) {
    const overlapping = columns.filter(
      (c) => c.startMin < entry.endMin && c.endMin > entry.startMin,
    );
    const maxCol = Math.max(...overlapping.map((c) => c.column)) + 1;
    result.set(entry.eventId, {
      column: entry.column,
      totalColumns: maxCol,
    });
  }
  return result;
}

export function TimeGrid({
  dates,
  displayItems,
  today,
  onTimeSlotClick,
  onDragSelect,
  onDisplayItemClick,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{
    date: Date;
    minutes: number;
    colIdx: number;
  } | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  // Scroll to 8 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT;
    }
  }, []);

  // Compute timed display items per column with overlap info
  const columnsData = useMemo(() => {
    return dates.map((date) => {
      const dateStr = getLocalDateString(date);
      const dayItems = displayItems.get(dateStr) || [];
      const timedItems = dayItems.filter((item) => item.start_time !== null);
      const overlapInfo = computeOverlapColumns(timedItems);
      return { date, dateStr, timedItems, overlapInfo };
    });
  }, [dates, displayItems]);

  // Convert Y offset to minutes
  const yToMinutes = useCallback((offsetY: number): number => {
    return Math.max(0, Math.min((offsetY / GRID_HEIGHT) * 1440, 1439));
  }, []);

  // Determine which column index was clicked based on X position
  const getColumnIndex = useCallback(
    (clientX: number, gridElement: HTMLElement): number => {
      const rect = gridElement.getBoundingClientRect();
      const gutterWidth = 60;
      const relX = clientX - rect.left - gutterWidth;
      const colWidth = (rect.width - gutterWidth) / dates.length;
      return Math.max(0, Math.min(Math.floor(relX / colWidth), dates.length - 1));
    },
    [dates.length],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle left clicks on the grid area (not on display items)
      if (e.button !== 0) return;
      // Don't start drag when clicking on display blocks or buttons
      if ((e.target as HTMLElement).closest("button")) return;

      const gridEl = e.currentTarget;
      const rect = gridEl.getBoundingClientRect();
      const offsetY = e.clientY - rect.top + gridEl.scrollTop;
      const minutes = snapTo15(yToMinutes(offsetY));
      const colIdx = getColumnIndex(e.clientX, gridEl);

      setIsDragging(true);
      setDragStart({ date: dates[colIdx], minutes, colIdx });
      setDragEnd(minutes);
    },
    [dates, yToMinutes, getColumnIndex],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || !dragStart) return;

      const gridEl = e.currentTarget;
      const rect = gridEl.getBoundingClientRect();
      const offsetY = e.clientY - rect.top + gridEl.scrollTop;
      const minutes = snapTo15(yToMinutes(offsetY));

      setDragEnd(minutes);
    },
    [isDragging, dragStart, yToMinutes],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || !dragStart || dragEnd === null) {
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
        return;
      }

      const position = { x: e.clientX, y: e.clientY };
      const minMinutes = Math.min(dragStart.minutes, dragEnd);
      const maxMinutes = Math.max(dragStart.minutes, dragEnd);
      const duration = maxMinutes - minMinutes;

      if (duration >= 15 && onDragSelect) {
        // Drag selection
        onDragSelect(
          dragStart.date,
          minutesToTime(minMinutes),
          minutesToTime(maxMinutes),
          position,
        );
      } else if (onTimeSlotClick) {
        // Treat as a click
        onTimeSlotClick(
          dragStart.date,
          minutesToTime(dragStart.minutes),
          position,
        );
      }

      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    },
    [isDragging, dragStart, dragEnd, onTimeSlotClick, onDragSelect],
  );

  // Hour labels for the time gutter
  const hourLabels = useMemo(
    () => Array.from({ length: TOTAL_HOURS }, (_, i) => formatHourLabel(i)),
    [],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* All-day row */}
      <AllDayRow
        dates={dates}
        displayItems={displayItems}
        onDisplayItemClick={onDisplayItemClick}
      />

      {/* Scrollable time grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (isDragging) {
            setIsDragging(false);
            setDragStart(null);
            setDragEnd(null);
          }
        }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `60px repeat(${dates.length}, 1fr)`,
            height: `${GRID_HEIGHT}px`,
          }}
        >
          {/* Time gutter */}
          <div className="relative border-r border-border">
            {hourLabels.map((label, hour) => (
              <div
                key={hour}
                className="absolute right-2 text-caption text-muted-foreground -translate-y-1/2"
                style={{ top: `${hour * HOUR_HEIGHT}px` }}
              >
                {hour > 0 ? label : ""}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {columnsData.map(
            ({ dateStr, timedItems, overlapInfo }, colIdx) => {
              const isToday = dateStr === today;

              return (
                <div
                  key={dateStr}
                  className={`relative border-r border-border last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
                >
                  {/* Hour row lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, hour) => (
                    <div key={hour}>
                      {/* Hour line */}
                      <div
                        className="absolute left-0 right-0 border-b border-border"
                        style={{ top: `${hour * HOUR_HEIGHT}px` }}
                      />
                      {/* Half-hour dashed line */}
                      <div
                        className="absolute left-0 right-0 border-b border-dashed border-border/50"
                        style={{
                          top: `${hour * HOUR_HEIGHT + HOUR_HEIGHT / 2}px`,
                        }}
                      />
                    </div>
                  ))}

                  {/* Event blocks */}
                  {timedItems.map((item) => {
                    const info = overlapInfo.get(item.id);
                    if (!info) return null;

                    const startMin = timeToMinutes(item.start_time!);
                    const endMin = item.end_time
                      ? timeToMinutes(item.end_time)
                      : startMin + 60;
                    const top = (startMin / 60) * HOUR_HEIGHT;
                    const height = Math.max(
                      ((endMin - startMin) / 60) * HOUR_HEIGHT,
                      4,
                    );
                    const colWidth = 100 / info.totalColumns;
                    const left = `${info.column * colWidth}%`;
                    const width = `${colWidth}%`;

                    return (
                      <EventBlock
                        key={item.id}
                        item={item}
                        top={top}
                        height={height}
                        left={left}
                        width={width}
                        onClick={onDisplayItemClick}
                      />
                    );
                  })}

                  {/* Current time indicator (today's column only) */}
                  {isToday && <CurrentTimeIndicator />}

                  {/* Drag highlight overlay */}
                  {isDragging &&
                    dragStart &&
                    dragEnd !== null &&
                    dragStart.colIdx === colIdx && (
                      <div
                        className="absolute left-0 right-0 bg-primary/20 rounded pointer-events-none z-5"
                        style={{
                          top: `${(Math.min(dragStart.minutes, dragEnd) / 60) * HOUR_HEIGHT}px`,
                          height: `${(Math.abs(dragEnd - dragStart.minutes) / 60) * HOUR_HEIGHT}px`,
                        }}
                      />
                    )}
                </div>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
