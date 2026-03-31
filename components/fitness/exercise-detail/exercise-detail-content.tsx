"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWeightUnit } from "@/lib/hooks/use-active-workout";
import { ExerciseSummaryTab } from "./exercise-summary-tab";
import { ExerciseHistoryTab } from "./exercise-history-tab";
import { ExerciseHowToTab } from "./exercise-howto-tab";
import type { Exercise } from "@/lib/db/types";

interface ExerciseDetailContentProps {
  exercise: Exercise;
}

export function ExerciseDetailContent({
  exercise,
}: ExerciseDetailContentProps) {
  const t = useTranslations("exercises");
  const weightUnit = useWeightUnit();

  const hasInstructions =
    exercise.exercise_media?.instructions &&
    exercise.exercise_media.instructions.length > 0;

  return (
    <Tabs defaultValue="summary" className="w-full">
      <TabsList>
        <TabsTrigger value="summary">
          {t("exerciseDetail.summaryTab")}
        </TabsTrigger>
        <TabsTrigger value="history">
          {t("exerciseDetail.historyTab")}
        </TabsTrigger>
        {hasInstructions && (
          <TabsTrigger value="howto">
            {t("exerciseDetail.howToTab")}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="summary" className="mt-6">
        <ExerciseSummaryTab exercise={exercise} weightUnit={weightUnit} />
      </TabsContent>

      <TabsContent value="history" className="mt-6">
        <ExerciseHistoryTab exercise={exercise} weightUnit={weightUnit} />
      </TabsContent>

      {hasInstructions && (
        <TabsContent value="howto" className="mt-6">
          <ExerciseHowToTab
            instructions={exercise.exercise_media!.instructions!}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
