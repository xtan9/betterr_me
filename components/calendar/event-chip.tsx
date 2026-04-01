import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";

interface EventChipProps {
  event: ExpandedCalendarEvent;
}

/**
 * Format time from HH:MM:SS to HH:MM for display.
 */
function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function EventChip({ event }: EventChipProps) {
  // Use custom color if set, otherwise default to calendar-event teal
  const hasCustomColor = !!event.color;

  const bgStyle = hasCustomColor
    ? { backgroundColor: `${event.color}20` }
    : {};
  const borderStyle = hasCustomColor
    ? { borderLeftColor: event.color }
    : {};

  return (
    <div
      className={`
        flex items-center gap-1
        px-1.5 py-0.5 rounded-md
        text-xs truncate
        border-l-2
        ${
          hasCustomColor
            ? ""
            : "bg-[hsl(var(--calendar-event-muted))] border-l-[hsl(var(--calendar-event))]"
        }
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
