"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { CalendarHeart } from "lucide-react";
import { fetcher } from "@/lib/fetcher";
import { MOODS } from "@/components/journal/journal-mood-selector";
import { getPreviewText } from "@/lib/journal/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface OnThisDayEntry {
  id: string;
  entry_date: string;
  mood: number | null;
  title: string;
  content: Record<string, unknown>;
  word_count: number;
  period: string;
}

interface OnThisDayResponse {
  entries: OnThisDayEntry[];
}

interface JournalOnThisDayFullProps {
  date: string;
}

function getMoodEmoji(mood: number | null): string {
  if (mood === null) return "";
  const found = MOODS.find((m) => m.value === mood);
  return found?.emoji ?? "";
}

export function JournalOnThisDayFull({ date }: JournalOnThisDayFullProps) {
  const t = useTranslations("journal.onThisDay");

  const { data, isLoading } = useSWR<OnThisDayResponse>(
    `/api/journal/on-this-day?date=${date}`,
    fetcher,
    { keepPreviousData: true },
  );

  const entries = data?.entries ?? [];

  if (isLoading) {
    return null;
  }

  if (entries.length === 0) {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground py-4"
        data-testid="on-this-day-full-empty"
      >
        <CalendarHeart className="size-4 shrink-0" aria-hidden="true" />
        <p>{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="on-this-day-full">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <CalendarHeart className="size-5" aria-hidden="true" />
        {t("title")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => {
          const emoji = getMoodEmoji(entry.mood);
          const preview = getPreviewText(entry.content, 200);
          const periodLabel = entry.period ? t(entry.period) : "";

          return (
            <Card key={entry.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  {periodLabel && (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {periodLabel}
                    </span>
                  )}
                  {emoji && (
                    <span className="text-lg" aria-hidden="true">
                      {emoji}
                    </span>
                  )}
                </div>
                {entry.title && (
                  <CardTitle className="text-sm">{entry.title}</CardTitle>
                )}
              </CardHeader>
              <CardContent>
                {preview && (
                  <p className="text-sm text-muted-foreground line-clamp-4">
                    {preview}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
