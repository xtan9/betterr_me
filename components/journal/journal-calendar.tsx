"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DayContent } from "react-day-picker";
import type { DayContentProps } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { JournalMoodDot } from "@/components/journal/journal-mood-dot";
import { useJournalCalendar } from "@/lib/hooks/use-journal-calendar";
import { getLocalDateString } from "@/lib/utils";
import type { JournalCalendarDay } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Context for passing the entry map to the custom DayContent component
// ---------------------------------------------------------------------------

const EntryMapContext = createContext<Map<string, JournalCalendarDay>>(
  new Map()
);

// ---------------------------------------------------------------------------
// Custom DayContent — defined outside of render to keep stable reference
// ---------------------------------------------------------------------------

function JournalDayContent(props: DayContentProps) {
  const entryMap = useContext(EntryMapContext);
  const dateStr = getLocalDateString(props.date);
  const entry = entryMap.get(dateStr);

  return (
    <div className="relative flex flex-col items-center">
      <DayContent {...props} />
      {entry && (
        <JournalMoodDot
          mood={entry.mood}
          className="absolute -bottom-1"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JournalCalendar
// ---------------------------------------------------------------------------

interface JournalCalendarProps {
  onDayClick: (date: string) => void;
  /** Increment to trigger a refetch after create/edit/delete. */
  refreshKey?: number;
}

export function JournalCalendar({
  onDayClick,
  refreshKey,
}: JournalCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1;
  const { entries, mutate } = useJournalCalendar(year, month);

  // Build O(1) lookup map
  const entryMap = useMemo(() => {
    const map = new Map<string, JournalCalendarDay>();
    for (const entry of entries) {
      map.set(entry.entry_date, entry);
    }
    return map;
  }, [entries]);

  // Refetch when parent signals a change
  useEffect(() => {
    if (refreshKey) {
      mutate();
    }
  }, [refreshKey, mutate]);

  return (
    <EntryMapContext.Provider value={entryMap}>
      <Calendar
        month={currentMonth}
        onMonthChange={setCurrentMonth}
        onDayClick={(day) => onDayClick(getLocalDateString(day))}
        disabled={{ after: new Date() }}
        components={{ DayContent: JournalDayContent }}
      />
    </EntryMapContext.Provider>
  );
}
