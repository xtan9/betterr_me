"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Download, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/finance/runway-money-field";
import { BalanceChart, RunwayHistory } from "@/components/finance/household-runway-result-parts";
import { trackRunwayEvent } from "@/lib/finance/runway-analytics-client";
import {
  RUNWAY_MODEL_VERSION,
  formatCents,
  highestLeverageActions,
  type HouseholdRunwayAnswers,
  type RunwayAdjustments,
  type RunwayScenario,
  type RunwaySimulation,
  type RunwaySnapshotSummary,
} from "@/lib/finance/cushion";

function primarySentence(simulation: RunwaySimulation, t: ReturnType<typeof useTranslations>) {
  if (simulation.sustainable) return t("result.sustainable");
  if (!simulation.depletion_date) return t("result.primaryOver", { months: simulation.months_covered?.toFixed(0) ?? "120" });
  return t("result.primary", { months: (simulation.months_covered ?? 0).toFixed(1), date: simulation.depletion_date });
}
export function ResultExperience({
  t,
  locale,
  answers,
  scenarios,
  scenario,
  setScenario,
  baseline,
  preview,
  currentLifestyle,
  extreme,
  adjustments,
  setAdjustments,
  actions,
  onApply,
  onReset,
  onEdit,
  onDownload,
  isAuthenticated,
  saved,
  saving,
  onSave,
  error,
  snapshots,
}: {
  t: ReturnType<typeof useTranslations>;
  locale: string;
  answers: HouseholdRunwayAnswers;
  scenarios: RunwayScenario[];
  scenario: RunwayScenario;
  setScenario: (scenario: RunwayScenario) => void;
  baseline: RunwaySimulation;
  preview: RunwaySimulation;
  currentLifestyle: RunwaySimulation;
  extreme: RunwaySimulation;
  adjustments: RunwayAdjustments;
  setAdjustments: (adjustments: RunwayAdjustments) => void;
  actions: ReturnType<typeof highestLeverageActions>;
  onApply: () => void;
  onReset: () => void;
  onEdit: () => void;
  onDownload: () => void;
  isAuthenticated: boolean;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  error: string;
  snapshots: RunwaySnapshotSummary[];
}) {
  const hasAdjustment = Object.values(adjustments).some((value) => value > 0);
  const delta =
    preview.months_covered !== null && baseline.months_covered !== null
      ? preview.months_covered - baseline.months_covered
      : null;
  return (
    <section className="mx-auto max-w-6xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-[.22em] text-emerald-700">{t("result.eyebrow")}</p>
      <p className="mt-4 text-slate-500">{t("result.scenarioLead", { scenario: t(`scenarios.${scenario}`) })}</p>
      <h1 className="mt-2 max-w-5xl font-display text-3xl font-semibold tracking-[-.04em] sm:text-6xl">{primarySentence(preview, t)}</h1>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">{t(`guidance.${preview.sustainable || (preview.months_covered ?? 0) >= 6 ? "stronger" : (preview.months_covered ?? 0) >= 3 ? "limited" : "urgent"}`)}</span>
        <span className="text-slate-400">{t(`confidence.${preview.confidence}`)} · {t("result.model", { version: RUNWAY_MODEL_VERSION })}</span>
        {hasAdjustment && delta !== null ? <span className="font-semibold text-emerald-700">{delta >= 0 ? "+" : ""}{delta.toFixed(1)} {t("whatIf.months")}</span> : null}
      </div>
      <div role="tablist" aria-label={t("result.scenarios")} className="mt-8 flex flex-wrap gap-2">
        {scenarios.map((item) => <button key={item} role="tab" aria-selected={item === scenario} onClick={() => setScenario(item)} className={`rounded-full border px-4 py-2 text-sm font-medium ${item === scenario ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "bg-white dark:bg-white/5"}`}>{t(`scenarios.${item}`)}</button>)}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        <BalanceChart t={t} locale={locale} currency={answers.currency} simulation={preview} />
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/5">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{t("why.title")}</h2><button className="text-xs font-semibold text-emerald-700" onClick={onEdit}>{t("actions.review")}</button></div>
          <div className="mt-5 space-y-4 text-sm">
            <ResultLine label={t("why.cash")} value={formatCents(answers.available_cash.cents, locale, answers.currency)} />
            <ResultLine label={t("why.investments")} value={formatCents(answers.assets.liquid_investments.cents, locale, answers.currency)} />
            <ResultLine label={t("why.reducible")} value={formatCents(preview.reducible_expenses_cents, locale, answers.currency)} />
            <ResultLine label={t("why.excluded")} value={formatCents(preview.excluded_assets_cents, locale, answers.currency)} />
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <ComparisonCard title={t("comparison.current")} simulation={currentLifestyle} t={t} />
        <ComparisonCard title={t("comparison.interruption")} simulation={baseline} t={t} featured />
        <ComparisonCard title={t("comparison.extreme")} simulation={extreme} t={t} />
      </div>
      <div className="mt-6 rounded-3xl border bg-white p-6 dark:bg-white/5 sm:p-8">
        <h2 className="text-xl font-semibold">{t("whatIf.title")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("whatIf.description")}</p>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <MoneyField label={t("whatIf.reduceExpenses")} currency={answers.currency} value={adjustments.expense_reduction_cents} onChange={(value) => setAdjustments({ ...adjustments, expense_reduction_cents: Math.min(value, baseline.interruption_expenses_cents) })} />
          <MoneyField label={t("whatIf.addCash")} currency={answers.currency} value={adjustments.added_cash_cents} onChange={(value) => setAdjustments({ ...adjustments, added_cash_cents: value })} />
          <MoneyField label={t("whatIf.addIncome")} currency={answers.currency} value={adjustments.added_monthly_income_cents} onChange={(value) => setAdjustments({ ...adjustments, added_monthly_income_cents: value })} />
          <MoneyField label={t("whatIf.expectedFunds")} help={t("whatIf.expectedFundsHelp")} currency={answers.currency} value={adjustments.expected_unconfirmed_funds_cents} onChange={(value) => setAdjustments({ ...adjustments, expected_unconfirmed_funds_cents: value })} />
          <MoneyField label={t("whatIf.useIlliquid")} currency={answers.currency} value={adjustments.usable_illiquid_investments_cents} onChange={(value) => setAdjustments({ ...adjustments, usable_illiquid_investments_cents: Math.min(value, answers.assets.illiquid_investments.cents) })} />
        </div>
        <details className="mt-5 rounded-2xl border p-4">
          <summary className="cursor-pointer font-semibold">{t("comparison.extreme")}</summary>
          <p className="mt-2 text-xs leading-5 text-slate-500">{t("whatIf.retirementHelp")}</p>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <MoneyField label={t("whatIf.useDeferred")} currency={answers.currency} value={adjustments.usable_retirement_tax_deferred_cents} onChange={(value) => setAdjustments({ ...adjustments, usable_retirement_tax_deferred_cents: Math.min(value, answers.assets.retirement_tax_deferred.cents) })} />
            <MoneyField label={t("whatIf.useTaxFree")} currency={answers.currency} value={adjustments.usable_retirement_tax_free_cents} onChange={(value) => setAdjustments({ ...adjustments, usable_retirement_tax_free_cents: Math.min(value, answers.assets.retirement_tax_free.cents) })} />
          </div>
        </details>
        <div className="mt-6 flex gap-2"><Button onClick={onApply}>{t("actions.apply")}</Button><Button variant="outline" onClick={onReset}><RefreshCcw />{t("actions.reset")}</Button></div>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/5">
          <h2 className="font-semibold">{t("actionsPlan.title")}</h2>
          <div className="mt-4 space-y-3 text-sm">
            {actions.cashGapCents > 0 ? <ResultLine label={t("actionsPlan.cashTarget", { months: actions.targetMonths })} value={formatCents(actions.cashGapCents, locale, answers.currency)} /> : null}
            {actions.largestReducibleCategory ? <ResultLine label={t("actionsPlan.largest")} value={`${t(`expenseCategories.${actions.largestReducibleCategory.category}`)} · ${formatCents(actions.largestReducibleCategory.reducible, locale, answers.currency)}`} /> : null}
          </div>
        </div>
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/5">
          <h2 className="font-semibold">{t("save.title")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t("save.description")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" onClick={onDownload}><Download />{t("actions.download")}</Button>
            {isAuthenticated ? <Button onClick={onSave} disabled={saving || saved}>{saved ? t("save.saved") : saving ? t("save.saving") : t("save.button")}</Button> : <Button asChild onClick={() => trackRunwayEvent("registration_clicked", "result")}><Link href="/auth/sign-up?next=/finance/cushion">{t("save.createAccount")}</Link></Button>}
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/5">
          <h2 className="font-semibold">{t("regional.title")}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">{t(`regionalActions.${answers.country}`)}</p>
        </div>
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/5">
          <h2 className="font-semibold">{t("precision.title")}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-500">
            {answers.available_cash.confidence !== "confirmed" ? <li>{t("precision.cash")}</li> : null}
            {answers.mine.take_home_source === "estimated" || answers.partner?.take_home_source === "estimated" ? <li>{t("precision.takeHome")}</li> : null}
            {answers.expense_mode === "quick" ? <li>{t("precision.expenses")}</li> : null}
            {preview.confidence === "complete" ? <li>{t("precision.complete")}</li> : null}
          </ul>
        </div>
      </div>
      {isAuthenticated && snapshots.length > 0 ? (
        <RunwayHistory t={t} locale={locale} snapshots={snapshots} />
      ) : null}
      <details className="mt-6 rounded-3xl border bg-white p-6 dark:bg-white/5"><summary className="cursor-pointer font-semibold">{t("method.title")}</summary><p className="mt-4 text-sm leading-6 text-slate-500">{t("method.formula")}</p><p className="mt-2 text-sm leading-6 text-slate-500">{t("method.excluded")}</p><p className="mt-2 text-xs text-slate-400">{t("method.disclaimer")}</p></details>
    </section>
  );
}

function ResultLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium">{value}</span></div>;
}

function ComparisonCard({ title, simulation, t, featured = false }: { title: string; simulation: RunwaySimulation; t: ReturnType<typeof useTranslations>; featured?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${featured ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : "bg-white dark:bg-white/5"}`}><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-2xl font-semibold">{simulation.sustainable ? t("comparison.sustainable") : t("comparison.months", { months: (simulation.months_covered ?? 0).toFixed(1) })}</p></div>;
}
