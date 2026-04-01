"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CalendarSidebarProps {
  currentDate: Date;
  onDateSelect: (date: Date | undefined) => void;
  weekStartDay: number;
}

const LAYERS = [
  { key: "events", cssVar: "--calendar-event", enabled: true },
  { key: "tasks", cssVar: "--calendar-task", enabled: false },
  { key: "habits", cssVar: "--calendar-habit", enabled: false },
  { key: "bills", cssVar: "--calendar-bill", enabled: false },
  { key: "workouts", cssVar: "--calendar-workout", enabled: false },
] as const;

export function CalendarSidebar({
  currentDate,
  onDateSelect,
  weekStartDay,
}: CalendarSidebarProps) {
  const t = useTranslations("calendar");
  const [enabledLayers, setEnabledLayers] = useState<Set<string>>(
    new Set(LAYERS.filter((l) => l.enabled).map((l) => l.key)),
  );

  const toggleLayer = (key: string) => {
    setEnabledLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Mini month picker */}
      <Calendar
        mode="single"
        selected={currentDate}
        onSelect={onDateSelect}
        weekStartsOn={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
        showOutsideDays
        className="p-0"
      />

      {/* Layer toggles */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t("sidebar.layers")}
        </h3>
        <div className="space-y-2">
          <TooltipProvider>
            {LAYERS.map((layer) => {
              const isDisabled = !layer.enabled;
              const isChecked = enabledLayers.has(layer.key);

              const content = (
                <label
                  key={layer.key}
                  className={`flex items-center gap-2 cursor-pointer ${
                    isDisabled ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => {
                      if (!isDisabled) {
                        toggleLayer(layer.key);
                      }
                    }}
                    disabled={isDisabled}
                    className="h-4 w-4"
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: `hsl(var(${layer.cssVar}))` }}
                  />
                  <span className="text-sm">
                    {t(`layers.${layer.key}`)}
                  </span>
                </label>
              );

              if (isDisabled) {
                return (
                  <Tooltip key={layer.key}>
                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                    <TooltipContent>
                      {t("sidebar.comingSoonPhase")}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return content;
            })}
          </TooltipProvider>
        </div>
      </div>

      {/* +New Event button */}
      <Button variant="outline" className="w-full" disabled>
        {t("sidebar.newEvent")}
      </Button>
    </div>
  );
}
