"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Download, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/finance/runway-money-field";
import {
  BalanceChart,
  RunwayHistory,
} from "@/components/finance/household-runway-result-parts";
import { formatCents } from "@/lib/finance/cushion";
import type {
  HouseholdRunwayAdjustmentProjection,
  HouseholdRunwayAdviceFact,
  HouseholdRunwayFocusedRuntimeSimulation,
  HouseholdRunwayInterviewIntent,
  HouseholdRunwayInterviewRuntimeScreen,
  HouseholdRunwayPrecisionNotice,
  HouseholdRunwayResultOutcome,
  HouseholdRunwayRuntimeComparisonFact,
} from "@/lib/finance/household-runway-interview-runtime";

type ResultModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "result" }
>;

function primarySentence(
  outcome: HouseholdRunwayResultOutcome,
  t: ReturnType<typeof useTranslations>,
) {
  if (outcome.kind === "sustainable") return t("result.sustainable");
  if (outcome.depletion.kind === "outsideDateRange") {
    return t("result.primaryOver", {
      months: outcome.monthsCovered.toFixed(0),
    });
  }
  return t("result.primary", {
    months: outcome.monthsCovered.toFixed(1),
    date: outcome.depletion.date,
  });
}

function guidanceKey(
  simulation: HouseholdRunwayFocusedRuntimeSimulation,
): "urgent" | "limited" | "stronger" {
  switch (simulation.guidance) {
    case "underThree":
      return "urgent";
    case "threeToUnderSix":
      return "limited";
    case "sixPlus":
    case "sustainable":
      return "stronger";
  }
}

function comparisonText(
  simulation: HouseholdRunwayRuntimeComparisonFact,
  t: ReturnType<typeof useTranslations>,
) {
  return simulation.outcome.kind === "sustainable"
    ? t("comparison.sustainable")
    : t("comparison.months", {
        months: simulation.outcome.monthsCovered.toFixed(1),
      });
}

function adjustmentEffectText(
  adjustment: HouseholdRunwayAdjustmentProjection,
  t: ReturnType<typeof useTranslations>,
) {
  if (!adjustment.active || adjustment.effect.kind === "none") return null;
  if (adjustment.effect.kind === "becameSustainable") {
    return t("result.sustainable");
  }
  const delta = adjustment.effect.deltaMonths;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} ${t("whatIf.months")}`;
}

function adviceLabel(
  advice: HouseholdRunwayAdviceFact,
  t: ReturnType<typeof useTranslations>,
) {
  return advice.kind === "cashTarget"
    ? t("actionsPlan.cashTarget", { months: advice.targetMonths })
    : t("actionsPlan.largest");
}

function precisionLabel(
  notice: HouseholdRunwayPrecisionNotice,
  t: ReturnType<typeof useTranslations>,
) {
  switch (notice.kind) {
    case "cashNotConfirmed":
      return t("precision.cash");
    case "takeHomeEstimated":
      return t("precision.takeHome");
    case "quickExpenses":
      return t("precision.expenses");
    case "coreInputsComplete":
      return t("precision.complete");
  }
}

type AdjustmentKey =
  | "expenseReduction"
  | "addedCash"
  | "addedMonthlyIncome"
  | "expectedUnconfirmedFunds"
  | "usableIlliquidInvestments"
  | "usableRetirementTaxDeferred"
  | "usableRetirementTaxFree";

export function ResultExperience({
  t,
  locale,
  model,
  dispatch,
  onStartNew,
  onDiscardDraft,
  onRegistrationClick,
  onDownload,
  isAuthenticated,
  saved,
  saving,
  onSave,
  error,
}: {
  t: ReturnType<typeof useTranslations>;
  locale: string;
  model: ResultModel;
  dispatch: (input: HouseholdRunwayInterviewIntent) => unknown;
  onStartNew: () => void;
  onDiscardDraft: () => void;
  onRegistrationClick: () => void;
  onDownload: () => void;
  isAuthenticated: boolean;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  error: string;
}) {
  if (model.readiness === "unavailable") {
    return (
      <section className="mx-auto max-w-4xl px-5 py-12">
        <p className="text-xs font-semibold uppercase tracking-[.22em] text-emerald-700">
          {t("result.eyebrow")}
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-[-.04em]">
          {t("validation.assessment")}
        </h1>
        {error ? <p role="alert" className="mt-4 text-sm text-red-600">{error}</p> : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={onStartNew}>{t("landing.startNew")}</Button>
          <Button variant="ghost" onClick={onDiscardDraft}>{t("actions.discardDraft")}</Button>
        </div>
      </section>
    );
  }

  const primary = model.primary;
  const adjustment = model.adjustment;
  const effectText = adjustmentEffectText(adjustment, t);
  const currency = model.currency;
  const scenario = model.scenarios.selected;
  const setAdjustment = (key: AdjustmentKey, value: number) => {
    switch (key) {
      case "expenseReduction":
        dispatch({ type: "set_plan_adjustment", patch: { expense_reduction_cents: value } });
        break;
      case "addedCash":
        dispatch({ type: "set_plan_adjustment", patch: { added_cash_cents: value } });
        break;
      case "addedMonthlyIncome":
        dispatch({ type: "set_plan_adjustment", patch: { added_monthly_income_cents: value } });
        break;
      case "expectedUnconfirmedFunds":
        dispatch({ type: "set_plan_adjustment", patch: { expected_unconfirmed_funds_cents: value } });
        break;
      case "usableIlliquidInvestments":
        dispatch({ type: "set_plan_adjustment", patch: { usable_illiquid_investments_cents: value } });
        break;
      case "usableRetirementTaxDeferred":
        dispatch({ type: "set_plan_adjustment", patch: { usable_retirement_tax_deferred_cents: value } });
        break;
      case "usableRetirementTaxFree":
        dispatch({ type: "set_plan_adjustment", patch: { usable_retirement_tax_free_cents: value } });
        break;
    }
  };

  const adjustmentFields: Array<{
    key: AdjustmentKey;
    field: HouseholdRunwayAdjustmentProjection["fields"][AdjustmentKey];
    label: string;
    help?: string;
  }> = [
    { key: "expenseReduction", field: adjustment.fields.expenseReduction, label: t("whatIf.reduceExpenses") },
    { key: "addedCash", field: adjustment.fields.addedCash, label: t("whatIf.addCash") },
    { key: "addedMonthlyIncome", field: adjustment.fields.addedMonthlyIncome, label: t("whatIf.addIncome") },
    { key: "expectedUnconfirmedFunds", field: adjustment.fields.expectedUnconfirmedFunds, label: t("whatIf.expectedFunds"), help: t("whatIf.expectedFundsHelp") },
    { key: "usableIlliquidInvestments", field: adjustment.fields.usableIlliquidInvestments, label: t("whatIf.useIlliquid") },
  ];
  const retirementFields: Array<{
    key: AdjustmentKey;
    field: HouseholdRunwayAdjustmentProjection["fields"][AdjustmentKey];
    label: string;
  }> = [
    { key: "usableRetirementTaxDeferred", field: adjustment.fields.usableRetirementTaxDeferred, label: t("whatIf.useDeferred") },
    { key: "usableRetirementTaxFree", field: adjustment.fields.usableRetirementTaxFree, label: t("whatIf.useTaxFree") },
  ];

  return (
    <section className="mx-auto max-w-6xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-[.22em] text-emerald-700">
        {t("result.eyebrow")}
      </p>
      <p className="mt-4 text-slate-500">
        {t("result.scenarioLead", { scenario: t(`scenarios.${scenario}`) })}
      </p>
      <h1 className="mt-2 max-w-5xl font-display text-3xl font-semibold tracking-[-.04em] sm:text-6xl">
        {primarySentence(primary.outcome, t)}
      </h1>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
          {t(`guidance.${guidanceKey(primary)}`)}
        </span>
        <span className="text-slate-400">
          {t(`confidence.${primary.confidence === "needsReview" ? "needs_review" : primary.confidence}`)} · {t("result.model", { version: model.modelVersion })}
        </span>
        {effectText ? <span className="font-semibold text-emerald-700">{effectText}</span> : null}
      </div>
      <div role="tablist" aria-label={t("result.scenarios")} className="mt-8 flex flex-wrap gap-2">
        {model.scenarios.available.map(({ id }) => (
          <button
            key={id}
            role="tab"
            aria-selected={id === scenario}
            onClick={() => dispatch({ type: "select_scenario", scenario: id })}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${id === scenario ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "bg-white dark:bg-white/5"}`}
          >
            {t(`scenarios.${id}`)}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        <BalanceChart t={t} locale={locale} currency={currency} simulation={primary} />
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("why.title")}</h2>
            <button
              className="text-xs font-semibold text-emerald-700"
              onClick={() => dispatch({ type: "edit_completed_plan" })}
            >
              {t("actions.review")}
            </button>
          </div>
          <div className="mt-5 space-y-4 text-sm">
            <ResultLine label={t("why.cash")} value={formatCents(model.explanation.availableCashCents, locale, currency)} />
            <ResultLine label={t("why.investments")} value={formatCents(model.explanation.liquidInvestmentsCents, locale, currency)} />
            <ResultLine label={t("why.reducible")} value={formatCents(primary.resources.reducibleExpensesCents, locale, currency)} />
            <ResultLine label={t("why.excluded")} value={formatCents(primary.resources.excludedAssetsCents, locale, currency)} />
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <ComparisonCard title={t("comparison.current")} simulation={model.comparisons.currentLifestyle} t={t} />
        <ComparisonCard title={t("comparison.interruption")} simulation={model.comparisons.interruption} t={t} featured />
        <ComparisonCard title={t("comparison.extreme")} simulation={model.comparisons.extremeMode} t={t} />
      </div>
      <div className="mt-6 rounded-3xl border bg-white p-6 dark:bg-white/5 sm:p-8">
        <h2 className="text-xl font-semibold">{t("whatIf.title")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("whatIf.description")}</p>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {adjustmentFields.map(({ key, field, label, help }) => (
            <MoneyField
              key={key}
              label={label}
              help={help}
              currency={currency}
              value={field.valueCents}
              onChange={(value) => setAdjustment(key, value)}
            />
          ))}
        </div>
        <details className="mt-5 rounded-2xl border p-4">
          <summary className="cursor-pointer font-semibold">{t("comparison.extreme")}</summary>
          <p className="mt-2 text-xs leading-5 text-slate-500">{t("whatIf.retirementHelp")}</p>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {retirementFields.map(({ key, field, label }) => (
              <MoneyField
                key={key}
                label={label}
                currency={currency}
                value={field.valueCents}
                onChange={(value) => setAdjustment(key, value)}
              />
            ))}
          </div>
        </details>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button onClick={() => dispatch({ type: "apply_plan_adjustment" })}>{t("actions.apply")}</Button>
          <Button variant="outline" onClick={() => dispatch({ type: "reset_plan_adjustment" })}><RefreshCcw />{t("actions.reset")}</Button>
          {adjustment.active && adjustment.effect.kind === "none" ? <span className="text-xs text-slate-500">{t("whatIf.noChange")}</span> : null}
        </div>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/5">
          <h2 className="font-semibold">{t("actionsPlan.title")}</h2>
          <div className="mt-4 space-y-3 text-sm">
            {model.advice.map((advice) => (
              <ResultLine
                key={advice.kind}
                label={adviceLabel(advice, t)}
                value={advice.kind === "cashTarget"
                  ? formatCents(advice.gapCents, locale, currency)
                  : `${t(`expenseCategories.${advice.category}`)} · ${formatCents(advice.reducibleCents, locale, currency)}`}
              />
            ))}
          </div>
        </div>
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/5">
          <h2 className="font-semibold">{t("save.title")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t("save.description")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" onClick={onDownload}><Download />{t("actions.download")}</Button>
            {isAuthenticated ? <Button onClick={onSave} disabled={saving || saved}>{saved ? t("save.saved") : saving ? t("save.saving") : t("save.button")}</Button> : <Button asChild><Link href="/auth/sign-up?next=/finance/cushion" onClick={onRegistrationClick}>{t("save.createAccount")}</Link></Button>}
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={onStartNew}>{t("landing.startNew")}</Button>
        <Button variant="ghost" onClick={onDiscardDraft}>{t("actions.discardDraft")}</Button>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/5">
          <h2 className="font-semibold">{t("regional.title")}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">{t(`regionalActions.${model.country}`)}</p>
        </div>
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/5">
          <h2 className="font-semibold">{t("precision.title")}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-500">
            {model.precision.notices.map((notice) => <li key={notice.kind}>{precisionLabel(notice, t)}</li>)}
          </ul>
        </div>
      </div>
      {model.history.length > 0 ? <RunwayHistory t={t} locale={locale} snapshots={model.history} /> : null}
      <details className="mt-6 rounded-3xl border bg-white p-6 dark:bg-white/5"><summary className="cursor-pointer font-semibold">{t("method.title")}</summary><p className="mt-4 text-sm leading-6 text-slate-500">{t("method.formula")}</p><p className="mt-2 text-sm leading-6 text-slate-500">{t("method.excluded")}</p><p className="mt-2 text-xs text-slate-400">{t("method.disclaimer")}</p></details>
    </section>
  );
}

function ResultLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium">{value}</span></div>;
}

function ComparisonCard({
  title,
  simulation,
  t,
  featured = false,
}: {
  title: string;
  simulation: HouseholdRunwayRuntimeComparisonFact;
  t: ReturnType<typeof useTranslations>;
  featured?: boolean;
}) {
  return <div className={`rounded-2xl border p-5 ${featured ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : "bg-white dark:bg-white/5"}`}><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-2xl font-semibold">{comparisonText(simulation, t)}</p></div>;
}
