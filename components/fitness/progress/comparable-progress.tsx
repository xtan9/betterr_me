"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ComparableGroup, ComparableRecord, ComparableSource } from "@/lib/fitness/history-progress";
import type { WeightUnit } from "@/lib/db/types";
import { formatWorkoutDay } from "@/lib/fitness/history-presentation";
import { formatWeight } from "@/lib/fitness/units";

/** Keep every comparison's captured meaning and tied source workouts visible. */
export function ComparableProgress({ groups, weightUnit, mode }: {
  groups: ComparableGroup[];
  weightUnit: WeightUnit;
  mode: "records" | "history";
}) {
  const locale = useLocale();
  const t = useTranslations("workouts.comparable");
  const tw = useTranslations("workouts");
  const te = useTranslations("exercises");
  const description = (group: ComparableGroup, record: ComparableRecord) => {
    if (record.metric === "durationSeconds") return t("duration", { seconds: record.value });
    if (record.metric === "loadKg") return t("loadAtReps", { load: formatWeight(record.value, weightUnit), reps: record.at!.value });
    if (record.at === null) return t("bodyweightReps", { reps: record.value });
    return t(record.at.kind === "assistanceKg" ? "repsAtAssistance"
      : group.definition.mode === "weighted_bodyweight" ? "repsAtAddedLoad" : "repsAtLoad",
    { reps: record.value, load: formatWeight(record.at.value, weightUnit) });
  };
  const sourceDate = (source: ComparableSource) => formatWorkoutDay({ workoutDay: source.workoutDay, started_at: null }, locale) ?? tw("workoutDayUnknown");
  const measurement = (group: ComparableGroup, source: ComparableSource): ComparableRecord => ({
    metric: group.definition.mode === "duration" ? "durationSeconds" : "reps",
    at: source.weightKg === null ? null : { kind: group.definition.mode === "assisted_bodyweight" ? "assistanceKg" : "loadKg", value: source.weightKg },
    value: source.durationSeconds ?? source.reps!, sources: [source],
  });
  return <div className="space-y-4">
    <p className="text-caption text-muted-foreground">{t("eligible")}</p>
    {groups.map(group => <section key={group.key} className="space-y-2 rounded-card border p-3">
      <h4 className="text-body font-medium">{typeof group.definition.name === "string" ? group.definition.name
        : locale.startsWith("zh") ? group.definition.name.zh : group.definition.name.en}</h4>
      <p className="text-caption text-muted-foreground">{te(`equipmentTypes.${group.definition.equipment}`)} · {te(`exerciseTypes.${group.definition.mode}`)}</p>
      {group.definition.convention && <p className="text-caption text-muted-foreground">{te("recordingConvention", { convention: te(`conventions.${group.definition.convention}`) })}</p>}
      <ul className="space-y-2 text-body">
        {mode === "records" ? group.records.map(record => <li key={`${record.metric}:${record.at?.kind}:${record.at?.value}`}>
          <span>{description(group, record)}</span>
          <ul className="flex flex-wrap gap-2 text-caption">
            {record.sources.map(source => <li key={`${source.workoutId}:${source.entryId}:${source.setId}`}>
              <Link className="underline" href={`/workouts/${source.workoutId}`}>{sourceDate(source)}</Link>
            </li>)}
          </ul>
        </li>) : group.history.map(source => <li key={`${source.workoutId}:${source.entryId}:${source.setId}`}>
          <Link className="underline" href={`/workouts/${source.workoutId}`}>{sourceDate(source)}</Link>
          {" · "}{description(group, measurement(group, source))}
        </li>)}
      </ul>
    </section>)}
  </div>;
}
