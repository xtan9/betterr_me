"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { MOODS } from "@/components/journal/journal-mood-selector";
import { getPreviewText } from "@/lib/journal/utils";
import type { JournalEntry } from "@/lib/db/types";

interface JournalTimelineCardProps {
  entry: JournalEntry;
  onClick: () => void;
}

export function JournalTimelineCard({
  entry,
  onClick,
}: JournalTimelineCardProps) {
  const t = useTranslations("journal");

  const mood = MOODS.find((m) => m.value === entry.mood);
  // Use "T00:00:00" suffix to avoid timezone shift when parsing date-only strings
  const formattedDate = new Date(
    entry.entry_date + "T00:00:00"
  ).toLocaleDateString();
  const preview = getPreviewText(
    entry.content as Record<string, unknown>,
    150
  );

  return (
    <Card
      className="cursor-pointer hover:bg-accent transition-colors duration-150"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-1">
          {mood && <span className="text-lg">{mood.emoji}</span>}
          <span className="text-sm text-muted-foreground">{formattedDate}</span>
          {entry.title && (
            <span className="text-sm font-medium truncate">
              {entry.title}
            </span>
          )}
          {!entry.title && (
            <span className="text-sm font-medium text-muted-foreground italic">
              {t("untitled")}
            </span>
          )}
        </div>
        {preview && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {preview}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
