"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import type { ReminderSourceType, ReminderChannel } from "@/lib/db/types";

const SOURCE_TYPES: ReminderSourceType[] = [
  "calendar_event",
  "task",
  "habit",
];

const RELATIVE_PRESETS = [
  { value: 5, labelKey: "reminderDefaults.5min" },
  { value: 15, labelKey: "reminderDefaults.15min" },
  { value: 30, labelKey: "reminderDefaults.30min" },
  { value: 60, labelKey: "reminderDefaults.1hour" },
  { value: 1440, labelKey: "reminderDefaults.1day" },
] as const;

const SYSTEM_DEFAULTS: Record<
  ReminderSourceType,
  { relativeMinutes: number; channels: ReminderChannel[] }
> = {
  calendar_event: { relativeMinutes: 15, channels: ["push"] },
  task: { relativeMinutes: 60, channels: ["push"] },
  habit: { relativeMinutes: 480, channels: ["push"] },
};

interface SourceTypeConfig {
  relativeMinutes: number;
  channels: ReminderChannel[];
  dirty: boolean;
}

export function ReminderDefaultsSettings() {
  const t = useTranslations("settings.notifications");
  const { data, mutate } = useSWR("/api/reminder-defaults", fetcher);
  const [configs, setConfigs] = useState<Record<ReminderSourceType, SourceTypeConfig>>(
    () => buildInitialConfigs(null)
  );
  const [saving, setSaving] = useState(false);

  // Sync from server
  useEffect(() => {
    if (data?.defaults) {
      setConfigs(buildInitialConfigs(data.defaults));
    }
  }, [data]);

  const updateConfig = (
    sourceType: ReminderSourceType,
    updates: Partial<SourceTypeConfig>
  ) => {
    setConfigs((prev) => ({
      ...prev,
      [sourceType]: { ...prev[sourceType], ...updates, dirty: true },
    }));
  };

  const toggleChannel = (
    sourceType: ReminderSourceType,
    channel: ReminderChannel
  ) => {
    const current = configs[sourceType].channels;
    const has = current.includes(channel);
    let newChannels: ReminderChannel[];
    if (has) {
      newChannels = current.filter((c) => c !== channel);
    } else {
      newChannels = [...current, channel];
    }
    // Must have at least one channel
    if (newChannels.length === 0) return;
    updateConfig(sourceType, { channels: newChannels });
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const dirtyTypes = SOURCE_TYPES.filter((st) => configs[st].dirty);

      const results = await Promise.allSettled(
        dirtyTypes.map(async (sourceType) => {
          const res = await fetch("/api/reminder-defaults", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source_type: sourceType,
              relative_minutes: configs[sourceType].relativeMinutes,
              channels: configs[sourceType].channels,
            }),
          });
          if (!res.ok) throw new Error(`Failed to save defaults for ${sourceType}`);
          return sourceType;
        })
      );

      const failedTypes: string[] = [];
      const succeededTypes: ReminderSourceType[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          succeededTypes.push(result.value);
        } else {
          failedTypes.push(String(result.reason));
          console.error("Failed to save reminder defaults:", result.reason);
        }
      }

      mutate();
      // Mark succeeded types as clean
      if (succeededTypes.length > 0) {
        setConfigs((prev) => {
          const next = { ...prev };
          for (const st of succeededTypes) {
            next[st] = { ...next[st], dirty: false };
          }
          return next;
        });
      }

      if (failedTypes.length > 0) {
        toast.error(t("reminderDefaults.saveError"));
      } else {
        toast.success(t("reminderDefaults.saved"));
      }
    } catch (error) {
      console.error("Failed to save reminder defaults:", error);
      toast.error(t("reminderDefaults.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const hasDirty = SOURCE_TYPES.some((st) => configs[st].dirty);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t("reminderDefaults.title")}
        </CardTitle>
        <CardDescription>
          {t("reminderDefaults.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {SOURCE_TYPES.map((sourceType) => (
          <div
            key={sourceType}
            className="flex flex-wrap items-center gap-3 rounded-control border p-3"
          >
            <span className="text-body font-medium w-[120px]">
              {t(`reminderDefaults.sourceType.${sourceType}`)}
            </span>

            <Select
              value={String(configs[sourceType].relativeMinutes)}
              onValueChange={(val) =>
                updateConfig(sourceType, {
                  relativeMinutes: parseInt(val, 10),
                })
              }
            >
              <SelectTrigger
                className="w-[140px]"
                aria-label={`${sourceType} reminder time`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIVE_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={String(preset.value)}>
                    {t(preset.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-3 ml-auto">
              <label className="flex items-center gap-1 text-caption">
                <Checkbox
                  checked={configs[sourceType].channels.includes("push")}
                  onCheckedChange={() => toggleChannel(sourceType, "push")}
                  aria-label={`${sourceType} push`}
                />
                {t("reminderDefaults.push")}
              </label>
              <label className="flex items-center gap-1 text-caption">
                <Checkbox
                  checked={configs[sourceType].channels.includes("email")}
                  onCheckedChange={() => toggleChannel(sourceType, "email")}
                  aria-label={`${sourceType} email`}
                />
                {t("reminderDefaults.email")}
              </label>
            </div>
          </div>
        ))}

        <Button
          size="sm"
          onClick={handleSaveAll}
          disabled={saving || !hasDirty}
        >
          {t("reminderDefaults.saveAll")}
        </Button>
      </CardContent>
    </Card>
  );
}

function buildInitialConfigs(
  defaults: Array<{
    source_type: ReminderSourceType;
    relative_minutes: number;
    channels: ReminderChannel[];
  }> | null
): Record<ReminderSourceType, SourceTypeConfig> {
  const result = {} as Record<ReminderSourceType, SourceTypeConfig>;
  for (const st of SOURCE_TYPES) {
    const saved = defaults?.find((d) => d.source_type === st);
    result[st] = {
      relativeMinutes: saved?.relative_minutes ?? SYSTEM_DEFAULTS[st].relativeMinutes,
      channels: saved?.channels ? [...saved.channels] : [...SYSTEM_DEFAULTS[st].channels],
      dirty: false,
    };
  }
  return result;
}
