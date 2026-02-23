"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export const MOODS = [
  { value: 5, emoji: "\uD83E\uDD29", label: "amazing" },
  { value: 4, emoji: "\uD83D\uDE0A", label: "good" },
  { value: 3, emoji: "\uD83D\uDE42", label: "okay" },
  { value: 2, emoji: "\uD83D\uDE15", label: "notGreat" },
  { value: 1, emoji: "\uD83D\uDE29", label: "awful" },
] as const;

interface JournalMoodSelectorProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function JournalMoodSelector({
  value,
  onChange,
}: JournalMoodSelectorProps) {
  const t = useTranslations("journal.mood");

  return (
    <div role="radiogroup" aria-label={t("label")} className="flex gap-2">
      {MOODS.map((mood) => (
        <button
          key={mood.value}
          type="button"
          role="radio"
          aria-checked={value === mood.value}
          aria-label={t(mood.label)}
          onClick={() =>
            onChange(value === mood.value ? null : mood.value)
          }
          className={cn(
            "text-2xl p-2 rounded-lg transition-all",
            value === mood.value
              ? "bg-primary/10 ring-2 ring-primary scale-110"
              : "hover:bg-muted opacity-60 hover:opacity-100"
          )}
        >
          {mood.emoji}
        </button>
      ))}
    </div>
  );
}
