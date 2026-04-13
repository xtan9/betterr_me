"use client";

import { useState, useEffect } from "react";
import { HOUR_HEIGHT } from "./time-grid";

/**
 * Teal horizontal line with circle dot indicating current time.
 * Updates position every minute. Only rendered on today's column.
 */
export function CurrentTimeIndicator() {
  const [position, setPosition] = useState(() => computePosition());

  useEffect(() => {
    // Update every 60 seconds
    const interval = setInterval(() => {
      setPosition(computePosition());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none"
      style={{ top: `${position}px` }}
      aria-hidden="true"
    >
      {/* Circle dot on the left edge */}
      <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-pill bg-[hsl(var(--calendar-event))]" />
      {/* Horizontal line */}
      <div className="h-[2px] w-full bg-[hsl(var(--calendar-event))]" />
    </div>
  );
}

function computePosition(): number {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return (hours + minutes / 60) * HOUR_HEIGHT;
}
