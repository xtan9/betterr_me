"use client";

/** Shared presentation controls for Household Runway Interview steps. */

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

import { MoneyField } from "@/components/finance/runway-money-field";

import type { RunwayStepId, HouseholdRunwayAnswers } from "@/lib/finance/cushion";

export function StepTitle({
  step,
  t,
}: {
  step: RunwayStepId;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <>
      <h1
        id="runway-question-heading"
        tabIndex={-1}
        className="font-display text-3xl font-semibold tracking-[-.035em] outline-none sm:text-4xl"
      >
        {t(`steps.${step}.title`)}
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-500 dark:text-slate-300">
        {t(`steps.${step}.description`)}
      </p>
    </>
  );
}

export function ChoiceCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`rounded-2xl border p-4 text-left transition ${selected ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-500/10" : "hover:border-slate-400"}`}>
      <span className="flex items-center justify-between gap-3 font-medium">{title}{selected ? <Check className="h-4 w-4 text-emerald-600" /> : null}</span>
      {description ? <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span> : null}
    </button>
  );
}

export function CheckCard({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="font-medium">{label}</span>
    </label>
  );
}

export function ToggleMoneyCard({
  title,
  description,
  badge,
  enabled,
  currency,
  value,
  onEnabled,
  onChange,
}: {
  title: string;
  description: string;
  badge?: string;
  enabled: boolean;
  currency: HouseholdRunwayAnswers["currency"];
  value: number;
  onEnabled: (enabled: boolean) => void;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("householdRunway");
  return (
    <div role="group" aria-label={title} className={`rounded-2xl border p-4 ${enabled ? "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-500/5" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        {badge ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:bg-white/10">{badge}</span> : null}
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" size="sm" variant={enabled ? "default" : "outline"} onClick={() => onEnabled(true)}>{t("answers.yes")}</Button>
        <Button type="button" size="sm" variant={!enabled ? "default" : "outline"} onClick={() => onEnabled(false)}>{t("answers.no")}</Button>
      </div>
      {enabled ? (
        <div className="mt-4">
          <MoneyField label={title} currency={currency} value={value} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  return <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500 dark:bg-white/5">{children}</div>;
}

export function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
