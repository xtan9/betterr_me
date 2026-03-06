"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useExerciseHistory } from "@/lib/hooks/use-exercise-history";
import { displayWeight } from "@/lib/fitness/units";
import type { WeightUnit } from "@/lib/db/types";

type DateRange = "1m" | "3m" | "6m" | "all";

interface ExerciseProgressChartProps {
  exerciseId: string;
  exerciseName: string;
  weightUnit: WeightUnit;
}

function getDateCutoff(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  const months = range === "1m" ? 1 : range === "3m" ? 3 : 6;
  now.setMonth(now.getMonth() - months);
  return now;
}

export function ExerciseProgressChart({
  exerciseId,
  exerciseName: _exerciseName,
  weightUnit,
}: ExerciseProgressChartProps) {
  const t = useTranslations("workouts");
  const [dateRange, setDateRange] = useState<DateRange>("3m");

  // Fetch ALL history data once, filter client-side (avoids refetch on range change)
  const { history, error, isLoading } = useExerciseHistory(exerciseId);

  // Filter data by date range client-side
  const filteredData = useMemo(() => {
    const cutoff = getDateCutoff(dateRange);
    if (!cutoff) return history;
    const cutoffTime = cutoff.getTime();
    return history.filter(
      (entry) => new Date(entry.started_at).getTime() >= cutoffTime
    );
  }, [history, dateRange]);

  // Transform filtered data into chart format
  const chartData = useMemo(() => {
    return filteredData.map((entry) => ({
      date: new Date(entry.started_at).toLocaleDateString(),
      dateFormatted: new Date(entry.started_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      weight:
        entry.best_set_weight_kg != null
          ? displayWeight(entry.best_set_weight_kg, weightUnit)
          : null,
      volume:
        entry.total_volume != null
          ? Math.round(displayWeight(entry.total_volume, weightUnit))
          : null,
    }));
  }, [filteredData, weightUnit]);

  const chartConfig = {
    weight: {
      label: `${t("maxWeight")} (${weightUnit})`,
      color: "var(--chart-1)",
    },
    volume: {
      label: `${t("totalVolume")} (${weightUnit})`,
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig;

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{t("loadError")}</p>
      </div>
    );
  }

  // Empty state: not enough data points
  if (chartData.length < 2) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-sm text-muted-foreground">{t("notEnoughData")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("notEnoughDataDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">
          {t("progression")}
        </h4>
        <ToggleGroup
          type="single"
          value={dateRange}
          onValueChange={(value) => {
            if (value) setDateRange(value as DateRange);
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="1m" className="h-6 px-2 text-[10px]">
            {t("dateRange1m")}
          </ToggleGroupItem>
          <ToggleGroupItem value="3m" className="h-6 px-2 text-[10px]">
            {t("dateRange3m")}
          </ToggleGroupItem>
          <ToggleGroupItem value="6m" className="h-6 px-2 text-[10px]">
            {t("dateRange6m")}
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="h-6 px-2 text-[10px]">
            {t("dateRangeAll")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
        <LineChart
          accessibilityLayer
          data={chartData}
          margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="dateFormatted"
            axisLine={false}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis axisLine={false} tickLine={false} width={50} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            dataKey="weight"
            type="monotone"
            stroke="var(--color-weight)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            dataKey="volume"
            type="monotone"
            stroke="var(--color-volume)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
