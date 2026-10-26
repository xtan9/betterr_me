"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EXERCISE_FIELD_MAP } from "@/lib/fitness/exercise-fields";
import { parseLoadInput } from "@/lib/fitness/units";
import { exactTemplateNumber, type TemplateDefinition } from "@/lib/validations/train-templates";
import { useWeightUnit } from "@/lib/hooks/use-active-workout";
import { useWeightInput } from "@/components/fitness/use-weight-input";
import { definitionName, type TemplateEntry, type TemplateTarget } from "./template-draft";

export function blankTemplateTarget(): TemplateTarget {
  return { id: crypto.randomUUID(), kind: "working", measurements: { weightKg: null, reps: null, durationSeconds: null, distanceMeters: null } };
}
export function shiftRow<T>(rows: T[], index: number, direction: -1 | 1): T[] {
  if (index + direction < 0 || index + direction >= rows.length) return rows;
  const next = [...rows]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next;
}
function TargetLoad({ target, mode, change, disabled }: { target: TemplateTarget; mode: string; change: (raw: string | null) => void; disabled: boolean }) {
  const t = useTranslations("routines.templates"), preference = useWeightUnit(), raw = target.measurements.weightKg;
  const anchor = raw === null ? null : exactTemplateNumber(raw), unsafe = raw !== null && anchor === null;
  const weight = useWeightInput(target.id, anchor, unsafe ? "kg" : preference);
  const label = t(mode === "weighted_bodyweight" ? "addedLoadWithUnit" : mode === "assisted_bodyweight" ? "assistanceWithUnit" : "loadWithUnit", { unit: weight.unit === "lbs" ? "lb" : "kg" });
  return <label className="block">{label}<Input type="text" inputMode="decimal" disabled={disabled} value={unsafe && !weight.edited ? raw : weight.value}
    aria-invalid={weight.edited && !weight.valid} pattern={weight.edited ? "(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?" : undefined}
    onChange={event => { const text = event.target.value, kg = parseLoadInput(text, weight.unit); weight.change(text); change(text === "" ? null : kg === null ? text : String(kg)); }} /></label>;
}
export function TemplateEntryEditor({ entry, definition, index, count, update, remove, move, disabled }: {
  entry: TemplateEntry; definition?: TemplateDefinition; index: number; count: number; update: (entry: TemplateEntry) => void; remove: () => void; move: (direction: -1 | 1) => void; disabled: boolean;
}) {
  const t = useTranslations("routines"), tt = useTranslations("routines.templates"), locale = useLocale();
  const name = definitionName(definition, locale) ?? tt("unknown");
  const captured = definition?.kind === "keyed-preset" || definition?.kind === "custom" ? definition.definition : definition;
  const fields = captured && "mode" in captured ? EXERCISE_FIELD_MAP[captured.mode] : null;
  const mode = captured && "mode" in captured ? captured.mode : "";
  const changeTarget = (target: TemplateTarget) => { if (entry.targets.kind === "sets") update({ ...entry, targets: { kind: "sets", items: entry.targets.items.map(row => row.id === target.id ? target : row) } }); };
  return <fieldset disabled={disabled} className="space-y-3 rounded-card border p-3"><legend className="px-1 break-words">{name} · {index + 1}</legend>
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => move(-1)}>{tt("moveUp")}</Button>
      <Button type="button" size="sm" variant="outline" disabled={index + 1 === count} onClick={() => move(1)}>{tt("moveDown")}</Button><Button type="button" size="sm" variant="ghost" onClick={remove}>{t("removeExercise")}</Button></div>
    <label className="block">{tt("exerciseNotes")}<Textarea value={entry.notes ?? ""} onChange={event => update({ ...entry, notes: event.target.value || null })} /></label>
    <label className="block">{tt("restSeconds")}<Input type="number" step="any" placeholder={tt("unknown")} value={entry.restSeconds ?? ""}
      onChange={event => update({ ...entry, restSeconds: event.target.value === "" ? null : event.target.valueAsNumber })} /></label>
    {captured && "convention" in captured && <p className="text-muted-foreground text-sm">{captured.convention === "barbell-total" ? tt("barbellTotal") : captured.convention === "per-dumbbell" ? tt("dumbbellEach") : captured.convention === null ? tt("unknownConvention") : ""}</p>}
    {entry.targets.kind === "legacy-unresolved" ? <div className="space-y-2"><p>{tt("unresolved")}</p><p>{tt("originalCount")}: {entry.legacySource?.targetSets ?? tt("unknown")}</p>
      <Button type="button" onClick={() => update({ ...entry, targets: { kind: "sets", items: [blankTemplateTarget(), blankTemplateTarget(), blankTemplateTarget()] } })}>{tt("resolveTargets")}</Button></div>
      : <>{entry.targets.items.map((target, targetIndex) => <fieldset key={target.id} className="space-y-2 rounded border p-3"><legend className="px-1">{tt("targets")} {targetIndex + 1}</legend>
        <label className="block">{tt("targets")}<select className="block w-full border rounded-md p-2 bg-background" value={target.kind} onChange={event => changeTarget({ ...target, kind: event.target.value as TemplateTarget["kind"] })}>
          <option value="working">{tt("working")}</option><option value="warmup">{tt("warmup")}</option></select></label>
        <div className="grid gap-2 sm:grid-cols-2">
          {fields?.showWeight && <TargetLoad target={target} mode={mode} disabled={disabled} change={weightKg => changeTarget({ ...target, measurements: { ...target.measurements, weightKg } })} />}
          {([['reps', 'repetitions', fields?.showReps], ['durationSeconds', 'duration', fields?.showDuration], ['distanceMeters', 'distance', fields?.showDistance]] as const).filter(([, , shown]) => shown).map(([field, label]) =>
            <label className="block" key={field}>{tt(label)}<Input type="text" inputMode={field === "distanceMeters" ? "decimal" : "numeric"} value={target.measurements[field] ?? ""}
              onChange={event => changeTarget({ ...target, measurements: { ...target.measurements, [field]: event.target.value || null } })} /></label>)}
        </div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={targetIndex === 0} onClick={() => { if (entry.targets.kind === "sets") update({ ...entry, targets: { kind: "sets", items: shiftRow(entry.targets.items, targetIndex, -1) } }); }}>{tt("moveUp")}</Button>
          <Button type="button" variant="outline" size="sm" disabled={entry.targets.kind === "sets" && targetIndex + 1 === entry.targets.items.length} onClick={() => { if (entry.targets.kind === "sets") update({ ...entry, targets: { kind: "sets", items: shiftRow(entry.targets.items, targetIndex, 1) } }); }}>{tt("moveDown")}</Button>
          <Button type="button" variant="ghost" size="sm" disabled={entry.targets.kind === "sets" && entry.targets.items.length === 1} onClick={() => { if (entry.targets.kind === "sets") update({ ...entry, targets: { kind: "sets", items: entry.targets.items.filter(row => row.id !== target.id) } }); }}>{tt("removeTarget")}</Button></div>
      </fieldset>)}<Button type="button" disabled={entry.targets.items.length >= 20} onClick={() => { if (entry.targets.kind === "sets") update({ ...entry, targets: { kind: "sets", items: [...entry.targets.items, blankTemplateTarget()] } }); }}>{tt("addTarget")}</Button></>}
  </fieldset>;
}
