"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MOODS } from "@/components/journal/journal-mood-selector";
import { JournalStreakBadge } from "@/components/journal/journal-streak-badge";
import { JournalOnThisDay } from "@/components/journal/journal-on-this-day";
import { useJournalWidget } from "@/lib/hooks/use-journal-widget";
import { getPreviewText } from "@/lib/journal/utils";
import type { MoodRating } from "@/lib/db/types";

function getMoodEmoji(mood: MoodRating | null): string {
  if (mood === null) return "";
  const found = MOODS.find((m) => m.value === mood);
  return found?.emoji ?? "";
}

export function JournalWidget() {
  const t = useTranslations("dashboard.journal");
  const router = useRouter();
  const { entry, streak, onThisDay, error, isLoading } = useJournalWidget();

  if (error && !isLoading) {
    return (
      <Card data-testid="journal-widget-error">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" aria-hidden="true" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("fetchError")}</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card data-testid="journal-widget-loading">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="journal-widget">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" aria-hidden="true" />
            {t("title")}
          </CardTitle>
          <JournalStreakBadge streak={streak} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {entry ? (
          /* Entry exists state */
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              {entry.mood !== null && (
                <span className="text-2xl shrink-0" aria-hidden="true">
                  {getMoodEmoji(entry.mood)}
                </span>
              )}
              <p className="text-sm text-muted-foreground line-clamp-3">
                {getPreviewText(entry.content, 150)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="px-0 text-primary hover:text-primary/80"
              onClick={() => router.push("/journal")}
              data-testid="journal-view-entry"
            >
              {t("viewEntry")}
            </Button>
          </div>
        ) : (
          /* No entry state */
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("prompt")}</p>
            <div className="flex gap-1" aria-hidden="true">
              {MOODS.map((mood) => (
                <span
                  key={mood.value}
                  className="text-lg opacity-50"
                >
                  {mood.emoji}
                </span>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/journal")}
              data-testid="journal-start-writing"
            >
              {t("startWriting")}
            </Button>
          </div>
        )}

        {/* On This Day section */}
        <JournalOnThisDay entries={onThisDay} />
      </CardContent>
    </Card>
  );
}
