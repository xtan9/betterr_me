"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Trash2 } from "lucide-react";
import type { ReminderSourceType } from "@/lib/db/types";

export interface ReminderRowData {
  id?: string;
  tempId: string;
  reminderType: "relative" | "absolute";
  relativeMinutes: number | null;
  absoluteTime: string | null;
  channels: ("push" | "email")[];
}

export const RELATIVE_PRESETS = [
  { labelKey: "reminders.5min", value: 5 },
  { labelKey: "reminders.15min", value: 15 },
  { labelKey: "reminders.30min", value: 30 },
  { labelKey: "reminders.1hour", value: 60 },
  { labelKey: "reminders.1day", value: 1440 },
  { labelKey: "reminders.custom", value: -1 },
] as const;

export const SMART_DEFAULTS: Record<
  ReminderSourceType,
  { relativeMinutes: number; channels: ("push" | "email")[] }
> = {
  calendar_event: { relativeMinutes: 15, channels: ["push"] },
  task: { relativeMinutes: 60, channels: ["push"] },
  habit: { relativeMinutes: 480, channels: ["push"] },
  bill: { relativeMinutes: 4320, channels: ["push", "email"] },
};

interface ReminderRowsProps {
  rows: ReminderRowData[];
  onChange: (rows: ReminderRowData[]) => void;
  disabled?: boolean;
}

export function ReminderRows({ rows, onChange, disabled }: ReminderRowsProps) {
  const t = useTranslations("calendar");

  const addRow = () => {
    const newRow: ReminderRowData = {
      tempId: crypto.randomUUID(),
      reminderType: "relative",
      relativeMinutes: 15,
      absoluteTime: null,
      channels: ["push"],
    };
    onChange([...rows, newRow]);
  };

  const removeRow = (tempId: string) => {
    onChange(rows.filter((r) => r.tempId !== tempId));
  };

  const updateRow = (tempId: string, updates: Partial<ReminderRowData>) => {
    onChange(
      rows.map((r) => (r.tempId === tempId ? { ...r, ...updates } : r))
    );
  };

  const handleTypeChange = (tempId: string, value: string) => {
    if (value === "absolute") {
      updateRow(tempId, {
        reminderType: "absolute",
        relativeMinutes: null,
        absoluteTime: null,
      });
    } else {
      const minutes = parseInt(value, 10);
      if (minutes === -1) {
        // Custom: keep relative type, set null for custom entry
        updateRow(tempId, {
          reminderType: "relative",
          relativeMinutes: null,
        });
      } else {
        updateRow(tempId, {
          reminderType: "relative",
          relativeMinutes: minutes,
          absoluteTime: null,
        });
      }
    }
  };

  const toggleChannel = (
    tempId: string,
    channel: "push" | "email",
    currentChannels: ("push" | "email")[]
  ) => {
    const has = currentChannels.includes(channel);
    let newChannels: ("push" | "email")[];
    if (has) {
      newChannels = currentChannels.filter((c) => c !== channel);
    } else {
      newChannels = [...currentChannels, channel];
    }
    // Must have at least one channel
    if (newChannels.length === 0) return;
    updateRow(tempId, { channels: newChannels });
  };

  const getSelectValue = (row: ReminderRowData): string => {
    if (row.reminderType === "absolute") return "absolute";
    if (row.relativeMinutes === null) return "-1";
    const preset = RELATIVE_PRESETS.find(
      (p) => p.value === row.relativeMinutes
    );
    return preset ? String(preset.value) : "-1";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {t("reminders.title")}
        </span>
      </div>

      {rows.map((row) => (
        <div
          key={row.tempId}
          className="flex flex-wrap items-center gap-2 rounded-card border p-2"
        >
          <Select
            value={getSelectValue(row)}
            onValueChange={(val) => handleTypeChange(row.tempId, val)}
            disabled={disabled}
          >
            <SelectTrigger className="w-[160px]" aria-label={t("reminders.typeLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RELATIVE_PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={String(preset.value)}>
                  {t(preset.labelKey)}
                </SelectItem>
              ))}
              <SelectItem value="absolute">
                {t("reminders.absolute")}
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Custom minutes input */}
          {row.reminderType === "relative" &&
            row.relativeMinutes === null && (
              <Input
                type="number"
                min={1}
                placeholder={t("reminders.customMinutes")}
                className="w-[100px]"
                disabled={disabled}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val > 0) {
                    updateRow(row.tempId, { relativeMinutes: val });
                  }
                }}
                aria-label={t("reminders.customMinutes")}
              />
            )}

          {/* Absolute time input */}
          {row.reminderType === "absolute" && (
            <Input
              type="datetime-local"
              className="w-[200px]"
              disabled={disabled}
              value={row.absoluteTime || ""}
              onChange={(e) =>
                updateRow(row.tempId, { absoluteTime: e.target.value })
              }
              aria-label={t("reminders.absoluteTime")}
            />
          )}

          {/* Channel toggles */}
          <div className="flex items-center gap-3 ml-auto">
            <label className="flex items-center gap-1 text-xs">
              <Checkbox
                checked={row.channels.includes("push")}
                onCheckedChange={() =>
                  toggleChannel(row.tempId, "push", row.channels)
                }
                disabled={disabled}
                aria-label="Push"
              />
              {t("reminders.push")}
            </label>
            <label className="flex items-center gap-1 text-xs">
              <Checkbox
                checked={row.channels.includes("email")}
                onCheckedChange={() =>
                  toggleChannel(row.tempId, "email", row.channels)
                }
                disabled={disabled}
                aria-label="Email"
              />
              {t("reminders.email")}
            </label>
          </div>

          {/* Remove button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => removeRow(row.tempId)}
            disabled={disabled}
            aria-label={t("reminders.remove")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
        className="gap-1"
      >
        <Bell className="h-3 w-3" />
        {t("reminders.add")}
      </Button>
    </div>
  );
}
