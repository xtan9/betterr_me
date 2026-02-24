"use client";

import { useTranslations } from "next-intl";
import { CalendarHeart } from "lucide-react";
import { MOODS } from "@/components/journal/journal-mood-selector";
import { getPreviewText } from "@/lib/journal/utils";

interface OnThisDayEntry {
  id: string;
  entry_date: string;
  mood: number | null;
  title: string;
  content: Record<string, unknown>;
  period: string;
}

interface JournalOnThisDayProps {
  entries: OnThisDayEntry[];
}

function getMoodEmoji(mood: number | null): string {
  if (mood === null) return "";
  const found = MOODS.find((m) => m.value === mood);
  return found?.emoji ?? "";
}

export function JournalOnThisDay({ entries }: JournalOnThisDayProps) {
  const t = useTranslations("dashboard.journal.onThisDay");

  if (entries.length === 0) {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground py-2"
        data-testid="on-this-day-empty"
      >
        <CalendarHeart className="size-4 shrink-0" aria-hidden="true" />
        <p>{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="on-this-day">
      <h4 className="text-sm font-medium text-muted-foreground">
        {t("title")}
      </h4>
      <div className="space-y-2">
        {entries.map((entry) => {
          const emoji = getMoodEmoji(entry.mood);
          const preview = getPreviewText(entry.content, 80);
          const periodLabel = entry.period ? t(entry.period) : "";

          return (
            <div
              key={entry.id}
              className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-sm"
            >
              {emoji && (
                <span className="text-base shrink-0" aria-hidden="true">
                  {emoji}
                </span>
              )}
              <div className="min-w-0 flex-1">
                {periodLabel && (
                  <span className="text-xs font-medium text-muted-foreground">
                    {periodLabel}
                  </span>
                )}
                {preview && (
                  <p className="text-muted-foreground line-clamp-2">
                    {preview}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
