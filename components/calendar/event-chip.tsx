import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarDisplayEvent, CalendarLayer } from "@/lib/calendar/overlay-adapter";
import { CALENDAR_LAYER_COLORS } from "@/lib/calendar/overlay-adapter";

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
  const overlayEvent = event as CalendarDisplayEvent;
  const layer = overlayEvent._layer as CalendarLayer | undefined;
  const isCompleted = overlayEvent._completed;

  // Use custom color if set, otherwise use domain or default
  const hasCustomColor = !!event.color;
  const hasLayerColor = layer && layer !== "events" && CALENDAR_LAYER_COLORS[layer];

  const bgStyle = hasCustomColor
    ? { backgroundColor: `${event.color}20` }
    : hasLayerColor
      ? { backgroundColor: `hsl(var(${CALENDAR_LAYER_COLORS[layer!].muted}))` }
      : {};
  const borderStyle = hasCustomColor && event.color
    ? { borderLeftColor: event.color }
    : hasLayerColor
      ? { borderLeftColor: `hsl(var(${CALENDAR_LAYER_COLORS[layer!].main}))` }
      : {};

  return (
    <div
      className={`
        flex items-center gap-1
        px-1.5 py-0.5 rounded-chip
        text-caption truncate
        border-l-2
        ${
          hasCustomColor || hasLayerColor
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
