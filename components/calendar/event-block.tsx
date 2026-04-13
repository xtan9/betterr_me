import { memo } from "react";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { DomainCalendarEvent, FeedDomain } from "@/lib/calendar/feed-types";
import { DOMAIN_COLORS } from "@/lib/calendar/feed-types";

interface EventBlockProps {
  event: ExpandedCalendarEvent;
  /** Top offset in pixels from the grid top */
  top: number;
  /** Height in pixels (proportional to duration) */
  height: number;
  /** CSS left percentage (e.g., "0%", "50%") for overlap column positioning */
  left: string;
  /** CSS width percentage (e.g., "100%", "50%") for overlap column sizing */
  width: string;
  /** Callback when the block is clicked */
  onClick?: (event: ExpandedCalendarEvent) => void;
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return "";
  const fmtStart = start.slice(0, 5); // HH:MM
  if (!end) return fmtStart;
  const fmtEnd = end.slice(0, 5);
  return `${fmtStart} \u2013 ${fmtEnd}`;
}

export const EventBlock = memo(function EventBlock({
  event,
  top,
  height,
  left,
  width,
  onClick,
}: EventBlockProps) {
  const domainEvent = event as DomainCalendarEvent;
  const domain = domainEvent._domain as FeedDomain | undefined;
  const isCompleted = domainEvent._completed;

  const hasCustomColor = !!event.color;
  const hasDomainColor = domain && domain !== "events" && DOMAIN_COLORS[domain];
  const isShort = height < 30;

  const bgStyle = hasCustomColor
    ? { backgroundColor: `${event.color}20` }
    : hasDomainColor
      ? { backgroundColor: `hsl(var(${DOMAIN_COLORS[domain!].muted}))` }
      : {};
  const borderStyle = hasCustomColor && event.color
    ? { borderLeftColor: event.color }
    : hasDomainColor
      ? { borderLeftColor: `hsl(var(${DOMAIN_COLORS[domain!].main}))` }
      : {};

  return (
    <button
      type="button"
      className={`
        absolute rounded-control px-1.5 py-0.5
        border-l-2 overflow-hidden
        text-xs text-left cursor-pointer
        hover:opacity-80 transition-opacity
        ${hasCustomColor || hasDomainColor ? "" : "bg-[hsl(var(--calendar-event-muted))] border-l-[hsl(var(--calendar-event))]"}
        ${isCompleted ? "line-through opacity-60" : ""}
      `}
      style={{
        top: `${top}px`,
        height: `${Math.max(height, 20)}px`, // minimum 20px height
        left,
        width,
        ...bgStyle,
        ...borderStyle,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(event);
      }}
      title={event.title}
    >
      {isShort ? (
        <span className="truncate block">{event.title}</span>
      ) : (
        <>
          <span className="font-medium truncate block">{event.title}</span>
          <span className="text-muted-foreground truncate block">
            {formatTimeRange(event.start_time, event.end_time)}
          </span>
        </>
      )}
    </button>
  );
});
