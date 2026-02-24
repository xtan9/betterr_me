"use client";

import { cn } from "@/lib/utils";

/**
 * Mood value to Tailwind background color class mapping.
 * 5 = amazing (green), 4 = good (emerald), 3 = okay (yellow),
 * 2 = not great (orange), 1 = awful (red).
 */
export const MOOD_COLORS: Record<number, string> = {
  5: "bg-green-500",
  4: "bg-emerald-400",
  3: "bg-yellow-400",
  2: "bg-orange-400",
  1: "bg-red-400",
};

/** Returns the Tailwind bg class for a mood value, or a muted fallback. */
export function moodDotColor(mood: number | null): string {
  if (mood === null) return "bg-muted-foreground";
  return MOOD_COLORS[mood] ?? "bg-muted-foreground";
}

interface JournalMoodDotProps {
  mood: number | null;
  className?: string;
}

/** Tiny colored dot indicator for a journal entry mood. */
export function JournalMoodDot({ mood, className }: JournalMoodDotProps) {
  return (
    <div
      className={cn("size-1.5 rounded-full", moodDotColor(mood), className)}
      aria-hidden="true"
    />
  );
}
