import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { DomainCalendarEvent, FeedDomain } from "@/lib/calendar/feed-types";
import { DOMAIN_COLORS } from "@/lib/calendar/feed-types";

interface EventChipProps {
  event: ExpandedCalendarEvent;
}

/**
 * Format time from HH:MM:SS to HH:MM for display.
 */
function formatTime(time: string): string {
  return time.slice(0, 5);
}

/**
 * Get domain-specific CSS classes for background and border.
 * Returns empty strings for native calendar events (uses default teal).
 */
function getDomainClasses(event: ExpandedCalendarEvent): {
  bgClass: string;
  borderClass: string;
} {
  const domainEvent = event as DomainCalendarEvent;
  const domain = domainEvent._domain as FeedDomain | undefined;

  if (!domain || domain === "events") {
    return { bgClass: "", borderClass: "" };
  }

  const colors = DOMAIN_COLORS[domain];
  if (!colors) return { bgClass: "", borderClass: "" };

  // Return empty — we'll use inline styles instead for CSS variable access
  return { bgClass: "", borderClass: "" };
}

export function EventChip({ event }: EventChipProps) {
  const domainEvent = event as DomainCalendarEvent;
  const domain = domainEvent._domain as FeedDomain | undefined;
  const isCompleted = domainEvent._completed;

  // Use custom color if set, otherwise use domain or default
  const hasCustomColor = !!event.color;
  const hasDomainColor = domain && domain !== "events" && DOMAIN_COLORS[domain];

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
    <div
      className={`
        flex items-center gap-1
        px-1.5 py-0.5 rounded-md
        text-xs truncate
        border-l-2
        ${
          hasCustomColor || hasDomainColor
            ? ""
            : "bg-[hsl(var(--calendar-event-muted))] border-l-[hsl(var(--calendar-event))]"
        }
        ${isCompleted ? "line-through opacity-60" : ""}
      `}
      style={{ ...bgStyle, ...borderStyle }}
      title={event.title}
    >
      {event.start_time && (
        <span className="text-muted-foreground shrink-0">
          {formatTime(event.start_time)}
        </span>
      )}
      <span className="truncate">{event.title}</span>
    </div>
  );
}
