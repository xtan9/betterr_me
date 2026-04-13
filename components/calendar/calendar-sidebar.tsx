"use client";

import { useTranslations } from "next-intl";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface CalendarSidebarProps {
  currentDate: Date;
  onDateSelect: (date: Date | undefined) => void;
  weekStartDay: number;
  onNewEvent?: () => void;
  enabledLayers: Set<string>;
  onToggleLayer: (key: string) => void;
}

const LAYERS = [
  { key: "events", cssVar: "--calendar-event" },
  { key: "tasks", cssVar: "--calendar-task" },
  { key: "habits", cssVar: "--calendar-habit" },
  { key: "bills", cssVar: "--calendar-bill" },
  { key: "workouts", cssVar: "--calendar-workout" },
] as const;

export function CalendarSidebar({
  currentDate,
  onDateSelect,
  weekStartDay,
  onNewEvent,
  enabledLayers,
  onToggleLayer,
}: CalendarSidebarProps) {
  const t = useTranslations("calendar");

  return (
    <div className="flex flex-col gap-section-gap">
      {/* Mini month picker */}
      <Calendar
        mode="single"
        selected={currentDate}
        onSelect={onDateSelect}
        weekStartsOn={Math.max(0, Math.min(6, weekStartDay)) as 0 | 1 | 2 | 3 | 4 | 5 | 6}
        showOutsideDays
        className="p-0"
      />

      {/* Layer toggles */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t("sidebar.layers")}
        </h3>
        <div className="space-y-2">
          {LAYERS.map((layer) => {
            const isChecked = enabledLayers.has(layer.key);

            return (
              <label
                key={layer.key}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => onToggleLayer(layer.key)}
                  className="h-4 w-4"
                />
                <span
                  className="h-2.5 w-2.5 rounded-pill shrink-0"
                  style={{ backgroundColor: `hsl(var(${layer.cssVar}))` }}
                />
                <span className="text-sm">
                  {t(`layers.${layer.key}`)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* +New Event button */}
      <Button variant="outline" className="w-full" onClick={onNewEvent}>
        {t("sidebar.newEvent")}
      </Button>
    </div>
  );
}
