import type {
  CalendarDisplayItem,
  CalendarLayer,
} from "@/lib/calendar/display";
import { CALENDAR_LAYER_COLORS } from "@/lib/calendar/display";

interface EventChipProps {
  item: CalendarDisplayItem;
}

/**
 * Format time from HH:MM:SS to HH:MM for display.
 */
function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function EventChip({ item }: EventChipProps) {
  const layer: CalendarLayer = item.kind === "overlay" ? item.layer : "events";
  const isCompleted = item.kind === "overlay" && item.completed;

  // Use custom color if set, otherwise use domain or default
  const hasCustomColor = !!item.color;
  const hasLayerColor = layer !== "events" && CALENDAR_LAYER_COLORS[layer];

  const bgStyle = hasCustomColor
    ? { backgroundColor: `${item.color}20` }
    : hasLayerColor
      ? { backgroundColor: `hsl(var(${CALENDAR_LAYER_COLORS[layer!].muted}))` }
      : {};
  const borderStyle = hasCustomColor && item.color
    ? { borderLeftColor: item.color }
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
      title={item.title}
    >
      {item.start_time && (
        <span className="text-muted-foreground shrink-0">
          {formatTime(item.start_time)}
        </span>
      )}
      <span className="truncate">{item.title}</span>
    </div>
  );
}
