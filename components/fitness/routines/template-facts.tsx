"use client";

import { useLocale, useTranslations } from "next-intl";
import type { TemplateDefinition } from "@/lib/validations/train-templates";
import { definitionId, definitionName, type TemplateDraft } from "./template-draft";

export function TemplateFacts({ template, definitions }: { template: TemplateDraft; definitions: TemplateDefinition[] }) {
  const t = useTranslations("routines.templates"), locale = useLocale();
  const fields = { weightKg: "load", reps: "repetitions", durationSeconds: "duration", distanceMeters: "distance" } as const;
  return <div className="space-y-4">{template.entries.map(entry => {
    const definition = definitions.find(row => definitionId(row) === entry.exerciseId);
    const captured = definition?.kind === "keyed-preset" || definition?.kind === "custom" ? definition.definition : definition;
    const labels = { ...fields, weightKg: captured && "mode" in captured && captured.mode === "assisted_bodyweight" ? "assistance" : captured && "mode" in captured && captured.mode === "weighted_bodyweight" ? "addedLoad" : "load" } as const;
    return <section key={entry.id} className="rounded-card border p-3 space-y-2">
      <h3 className="break-words font-medium">{definitionName(definition, locale) ?? t("unknown")}</h3>
      {entry.notes !== null && <p className="whitespace-pre-wrap break-words">{entry.notes}</p>}
      <p>{t("restSeconds")}: {entry.restSeconds === null ? t("unknown") : entry.restSeconds === 0 ? t("off") : entry.restSeconds}</p>
      {entry.targets.kind === "legacy-unresolved" ? <><p>{t("unresolved")}</p><p>{t("originalCount")}: {entry.legacySource?.targetSets ?? t("unknown")}</p>
        {entry.legacySource && <dl>{Object.entries(entry.legacySource.measurements).map(([field, value]) => <div key={field}><dt>{t(labels[field as keyof typeof fields])}</dt><dd>{value ?? t("blank")}</dd></div>)}</dl>}</>
        : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">{t("targets")}</th>{Object.values(labels).map(field => <th className="p-2 text-left" key={field}>{t(field)}</th>)}</tr></thead>
          <tbody>{entry.targets.items.map((target, i) => <tr key={target.id}><th className="text-left">{i + 1} · {t(target.kind === "warmup" ? "warmup" : "working")}</th>
            {Object.keys(fields).map(field => <td className="p-2 break-all" key={field}>{target.measurements[field as keyof typeof fields] ?? t("blank")}</td>)}</tr>)}</tbody></table></div>}
    </section>;
  })}</div>;
}
