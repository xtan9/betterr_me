"use client";

/** Employment, earned income, and other income presentation. */

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import { Trash2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { MoneyField } from "@/components/finance/runway-money-field";

import {
  type RecurringIncomeType,
  type HouseholdRunwayAnswers,
  type RecurringIncomeSource,
  formatCents,
  type IncomeAnswer,
  type EmploymentStatus,
} from "@/lib/finance/cushion";

import type {
  HouseholdRunwayInterviewRuntimeScreen,
  HouseholdRunwayInterviewIntent,
} from "@/lib/finance/household-runway-interview-runtime";

import { ToggleMoneyCard, InfoBox, ChoiceCard } from "./household-runway-fields";

const OTHER_INCOME_TYPES: Exclude<RecurringIncomeType, "other">[] = [
  "rental_net",
  "side_business",
  "dividends_interest",
  "support",
  "pension_benefits",
];

type HouseholdRunwayIncomeRenderModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "myIncome" | "partnerIncome" }
>;

export function OtherIncomeStep({
  title,
  t,
  locale,
  currency,
  sources,
  totalMonthlyCents,
  dispatchInterviewCommand,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  currency: HouseholdRunwayAnswers["currency"] | null;
  sources: readonly RecurringIncomeSource[];
  totalMonthlyCents: number;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
}) {
  const setSource = (type: RecurringIncomeType, enabled: boolean) => {
    if (type === "other") return;
    dispatchInterviewCommand({
      type: "set_other_income_source_enabled",
      sourceType: type,
      enabled,
    });
  };
  const updateSource = (
    id: string,
    patch: Partial<Pick<RecurringIncomeSource, "label" | "monthly_cents" | "confidence">>,
  ) =>
    dispatchInterviewCommand({
      type: "update_other_income_source",
      id,
      patch,
    });
  const displayCurrency = currency ?? "USD";
  return (
    <>
      {title}
      <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
        {t("otherIncome.continuingOnly")}
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {OTHER_INCOME_TYPES.map((type) => {
          const source = sources.find((item) => item.type === type);
          return (
            <ToggleMoneyCard
              key={type}
              title={t(`otherIncome.types.${type}`)}
              description={t(`otherIncome.help.${type}`)}
              enabled={Boolean(source)}
              currency={displayCurrency}
              value={source?.monthly_cents ?? 0}
              onEnabled={(enabled) => setSource(type, enabled)}
              onChange={(value) => source && updateSource(source.id, { monthly_cents: value, confidence: "confirmed" })}
            />
          );
        })}
      </div>
      <div className="mt-5 space-y-3">
        {sources.filter((source) => source.type === "other").map((source) => (
          <div key={source.id} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_auto]">
            <label>
              <span className="mb-1 block text-xs text-slate-500">{t("otherIncome.customLabel")}</span>
              <input className="h-11 w-full rounded-xl border bg-transparent px-3" value={source.label ?? ""} onChange={(event) => updateSource(source.id, { label: event.target.value })} />
            </label>
            <MoneyField label={t("otherIncome.monthlyAmount")} currency={displayCurrency} value={source.monthly_cents} onChange={(value) => updateSource(source.id, { monthly_cents: value, confidence: "confirmed" })} />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("otherIncome.remove")}
              onClick={() =>
                dispatchInterviewCommand({
                  type: "remove_other_income_source",
                  id: source.id,
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() =>
            dispatchInterviewCommand({ type: "add_other_income_source" })
          }
        >
          <Plus />
          {t("otherIncome.addOther")}
        </Button>
      </div>
      <p className="mt-6 font-medium">{t("otherIncome.total", { amount: formatCents(totalMonthlyCents, locale, displayCurrency) })}</p>
    </>
  );
}

export function IncomeEditor({
  t,
  locale,
  location,
  income,
  estimate,
  onChange,
}: {
  t: ReturnType<typeof useTranslations>;
  locale: string;
  location: {
    country: HouseholdRunwayAnswers["country"] | null;
    region: HouseholdRunwayAnswers["region"] | null;
    currency: HouseholdRunwayAnswers["currency"] | null;
  };
  income: IncomeAnswer;
  estimate: HouseholdRunwayIncomeRenderModel["estimate"];
  onChange: (patch: Partial<IncomeAnswer>) => void;
}) {
  if (income.employment === "unemployed" || income.employment === "not_working")
    return <InfoBox>{t("income.notAsked")}</InfoBox>;
  const currency = location.currency ?? "USD";
  return (
    <div className="mt-7">
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <ChoiceCard selected={income.entered_as === "gross"} title={t("income.gross")} onClick={() => income.entered_as !== "gross" && onChange({ entered_as: "gross", take_home_source: "estimated", confidence: "estimated" })} />
        <ChoiceCard selected={income.entered_as === "net"} title={t("income.net")} onClick={() => income.entered_as !== "net" && onChange({ entered_as: "net", take_home_source: "user_confirmed", confidence: "confirmed" })} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <MoneyField label={t("income.amount")} currency={currency} value={income.entered_as === "gross" ? income.gross_amount_cents : income.net_amount_cents} onChange={(value) => onChange(income.entered_as === "gross" ? { gross_amount_cents: value, take_home_source: "estimated" } : { net_amount_cents: value, take_home_source: "user_confirmed" })} />
        <label>
          <span className="mb-2 block text-sm font-medium">{t("income.period")}</span>
          <select className="h-12 w-full rounded-xl border bg-transparent px-3" value={income.entered_as === "gross" ? income.gross_period : income.net_period} onChange={(event) => onChange(income.entered_as === "gross" ? { gross_period: event.target.value as IncomeAnswer["gross_period"], take_home_source: "estimated" } : { net_period: event.target.value as IncomeAnswer["net_period"], take_home_source: "user_confirmed" })}>
            <option value="annual">{t("income.annual")}</option>
            <option value="monthly">{t("income.monthly")}</option>
          </select>
        </label>
      </div>
      {estimate ? (
        <div className="mt-5 rounded-2xl bg-emerald-50 p-5 dark:bg-emerald-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{t("income.estimate")}</p>
          <p className="mt-2 text-2xl font-semibold">{formatCents(estimate.monthly_take_home_cents, locale, currency)} <span className="text-sm font-normal">/ {t("income.month")}</span></p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant={income.take_home_source === "estimated" ? "default" : "outline"} onClick={() => onChange({ monthly_take_home_cents: estimate.monthly_take_home_cents, estimated_monthly_take_home_cents: estimate.monthly_take_home_cents, take_home_source: "estimated", confidence: "estimated", estimate_rule_version: estimate.rule_version })}>{t("income.useEstimate")}</Button>
            <Button size="sm" variant={income.take_home_source === "user_confirmed" ? "default" : "outline"} onClick={() => onChange({ take_home_source: "user_confirmed", confidence: "confirmed", monthly_take_home_cents: income.monthly_take_home_cents || estimate.monthly_take_home_cents })}>{t("income.enterActual")}</Button>
          </div>
          {income.take_home_source === "user_confirmed" ? (
            <div className="mt-4 max-w-sm">
              <MoneyField label={t("income.actualMonthly")} currency={currency} value={income.monthly_take_home_cents} onChange={(value) => onChange({ monthly_take_home_cents: value, take_home_source: "user_confirmed", confidence: "confirmed" })} />
            </div>
          ) : null}
          <details className="mt-5 rounded-xl border border-emerald-200 p-3 text-sm dark:border-emerald-500/20">
            <summary className="cursor-pointer font-semibold">{t("income.howCalculated")}</summary>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-2 text-slate-600 dark:text-slate-300">
              <dt>{t("income.enteredGross")}</dt><dd>{formatCents(income.entered_amount_cents, locale, currency)} · {t(`income.${income.entered_period}`)}</dd>
              <dt>{t("income.annualGross")}</dt><dd>{formatCents(estimate.annual_gross_cents, locale, currency)}</dd>
              <dt>{t("income.monthlyGross")}</dt><dd>{formatCents(estimate.monthly_gross_cents, locale, currency)}</dd>
              <dt>{t("income.federalTax")}</dt><dd>{formatCents(estimate.annual_federal_income_tax_cents, locale, currency)}</dd>
              <dt>{t("income.stateTax")}</dt><dd>{formatCents(estimate.annual_state_income_tax_cents, locale, currency)}</dd>
              <dt>{t("income.socialSecurity")}</dt><dd>{formatCents(estimate.annual_social_security_cents, locale, currency)}</dd>
              <dt>{t("income.medicare")}</dt><dd>{formatCents(estimate.annual_medicare_cents, locale, currency)}</dd>
              <dt>{t("income.monthlyDeductions")}</dt><dd>{formatCents(estimate.monthly_estimated_deductions_cents, locale, currency)}</dd>
              <dt>{t("income.ruleVersion", { version: estimate.rule_version })}</dt><dd>{estimate.federal_rule_version}</dd>
            </dl>
            {location.country === "US" ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-medium">{t("income.filingStatus")}</span><select className="h-10 w-full rounded-lg border bg-transparent px-2" value={income.tax_filing_status} onChange={(event) => onChange({ tax_filing_status: event.target.value as IncomeAnswer["tax_filing_status"], take_home_source: "estimated" })}>{(["single", "married_joint", "married_separate", "head_household"] as const).map((status) => <option key={status} value={status}>{t(`income.filingStatuses.${status}`)}</option>)}</select></label><MoneyField label={t("income.otherDeductions")} currency={currency} value={income.annual_other_deductions_cents} onChange={(value) => onChange({ annual_other_deductions_cents: value, take_home_source: "estimated" })} /></div> : null}
            <p className="mt-3 text-xs text-slate-500">{t("income.estimateDisclaimer")}</p>
          </details>
        </div>
      ) : null}
    </div>
  );
}

export function EmploymentPicker({
  t,
  label,
  value,
  onChange,
}: {
  t: ReturnType<typeof useTranslations>;
  label: string;
  value: EmploymentStatus;
  onChange: (status: EmploymentStatus) => void;
}) {
  return (
    <div className="mt-7">
      <p className="mb-3 font-medium">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["employed", "self_employed", "unemployed", "not_working"] as EmploymentStatus[]).map((status) => (
          <ChoiceCard key={status} selected={value === status} title={t(`employment.${status}`)} onClick={() => onChange(status)} />
        ))}
      </div>
    </div>
  );
}
