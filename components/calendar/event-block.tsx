import { memo } from "react";
import type {
  CalendarDisplayItem,
  CalendarLayer,
} from "@/lib/calendar/display";
import { CALENDAR_LAYER_COLORS } from "@/lib/calendar/display";

interface EventBlockProps {
  item: CalendarDisplayItem;
  /** Top offset in pixels from the grid top */
  top: number;
  /** Height in pixels (proportional to duration) */
  height: number;
  /** CSS left percentage (e.g., "0%", "50%") for overlap column positioning */
  left: string;
  /** CSS width percentage (e.g., "100%", "50%") for overlap column sizing */
  width: string;
  /** Callback when the block is clicked */
  onClick?: (item: CalendarDisplayItem) => void;
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return "";
  const fmtStart = start.slice(0, 5); // HH:MM
  if (!end) return fmtStart;
  const fmtEnd = end.slice(0, 5);
  return `${fmtStart} \u2013 ${fmtEnd}`;
}

export const EventBlock = memo(function EventBlock({
  item,
  top,
  height,
  left,
  width,
  onClick,
}: EventBlockProps) {
  const layer: CalendarLayer = item.kind === "overlay" ? item.layer : "events";
  const isCompleted = item.kind === "overlay" && item.completed;

  const hasCustomColor = !!item.color;
  const hasLayerColor = layer !== "events" && CALENDAR_LAYER_COLORS[layer];
  const isShort = height < 30;

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
    <button
      type="button"
      className={`
        absolute rounded-chip px-1.5 py-0.5
        border-l-2 overflow-hidden
        text-caption text-left cursor-pointer
        hover:opacity-80 transition-opacity
        ${hasCustomColor || hasLayerColor ? "" : "bg-[hsl(var(--calendar-event-muted))] border-l-[hsl(var(--calendar-event))]"}
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
        onClick?.(item);
      }}
      title={item.title}
    >
      {isShort ? (
        <span className="truncate block">{item.title}</span>
      ) : (
        <>
          <span className="font-medium truncate block">{item.title}</span>
          <span className="text-muted-foreground truncate block">
            {formatTimeRange(item.start_time, item.end_time)}
          </span>
        </>
      )}
    </button>
  );
});
