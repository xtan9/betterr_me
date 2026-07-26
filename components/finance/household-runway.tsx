"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Info,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EXPENSE_CATEGORIES,
  RUNWAY_DRAFT_STORAGE_KEY,
  availableScenarios,
  createDefaultRunwayAnswers,
  createDraftEnvelope,
  currencyForCountry,
  estimateMonthlyTakeHome,
  formatCents,
  highestLeverageActions,
  parseDraftEnvelope,
  simulateHouseholdRunway,
  type EmploymentStatus,
  type ExpenseCategory,
  type HouseholdRunwayAnswers,
  type IncomeAnswer,
  type RunwayAdjustments,
  type RunwayCountry,
  type RunwayScenario,
  type RunwaySimulation,
} from "@/lib/finance/cushion";

const STEP_IDS = [
  "welcome",
  "location",
  "household",
  "employment",
  "myIncome",
  "partnerIncome",
  "otherIncome",
  "cash",
  "confirmedFunds",
  "assets",
  "expenses",
  "temporaryIncome",
  "review",
  "result",
] as const;
const OPTIONAL_STEPS = new Set([
  "otherIncome",
  "confirmedFunds",
  "assets",
  "temporaryIncome",
]);
const EMPTY_ADJUSTMENTS: RunwayAdjustments = {
  expense_reduction_cents: 0,
  added_cash_cents: 0,
  added_monthly_income_cents: 0,
  investment_access_percent: 70,
  expected_unconfirmed_funds_cents: 0,
  include_retirement: false,
};
const RUNWAY_ANALYTICS_SESSION_KEY =
  "betterr.household-runway.analytics-session";
const RUNWAY_IMPORT_ACTION_KEY = "betterr.household-runway.import-action";

type StepId = (typeof STEP_IDS)[number];

interface HouseholdRunwayProps {
  initialAnswers: HouseholdRunwayAnswers | null;
  isAuthenticated: boolean;
  hasSavedPlan: boolean;
}

function dollars(cents: number) {
  return cents === 0 ? "" : String(cents / 100);
}

function cents(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
}

function currencySymbol(currency: string) {
  return { USD: "$", CAD: "CA$", CNY: "¥", TWD: "NT$" }[
    currency as "USD" | "CAD" | "CNY" | "TWD"
  ];
}

function MoneyField({
  label,
  value,
  currency,
  help,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  currency: string;
  help?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
        <span className="text-xs font-normal text-slate-400">{currency}</span>
      </span>
      <span className="flex h-12 items-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/15 dark:border-white/10 dark:bg-white/5">
        <span className="mr-2 text-xs text-slate-400">
          {currencySymbol(currency)}
        </span>
        <input
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-lg font-medium tabular-nums outline-none disabled:opacity-50"
          inputMode="decimal"
          min="0"
          step="0.01"
          type="number"
          value={dollars(value)}
          disabled={disabled}
          placeholder="0"
          onChange={(event) => onChange(cents(event.target.value))}
        />
      </span>
      {help ? (
        <span className="mt-1.5 block text-xs leading-5 text-slate-400">
          {help}
        </span>
      ) : null}
    </label>
  );
}

function ChoiceCard({
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-2xl border p-4 text-left transition ${selected ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/10 dark:bg-emerald-500/10" : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[.03]"}`}
    >
      <span className="flex items-center justify-between gap-3 text-sm font-semibold">
        {title}
        {selected ? <Check className="h-4 w-4 text-emerald-600" /> : null}
      </span>
      {description ? (
        <span className="mt-1.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </span>
      ) : null}
    </button>
  );
}

function RunwayChart({
  simulation,
  currency,
  locale,
  t,
}: {
  simulation: RunwaySimulation;
  currency: HouseholdRunwayAnswers["currency"];
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const horizon = Math.max(
    12,
    Math.min(60, Math.ceil((simulation.months_covered ?? 12) + 1)),
  );
  const points = simulation.months.filter((month) => month.month <= horizon);
  const width = 700;
  const height = 220;
  const max = Math.max(
    1,
    simulation.starting_resources_cents,
    ...points.map((point) => point.opening_balance_cents),
  );
  const path =
    points.length === 0
      ? ""
      : [
          `M0,${(height - (simulation.starting_resources_cents / max) * (height - 18)).toFixed(1)}`,
          ...points.map((point) => {
            const x = (point.month / horizon) * width;
            const y =
              height - (point.closing_balance_cents / max) * (height - 18);
            return `L${x.toFixed(1)},${Math.max(8, y).toFixed(1)}`;
          }),
        ].join(" ");
  const ticks = [
    0,
    Math.round(horizon / 3),
    Math.round((horizon * 2) / 3),
    horizon,
  ];
  return (
    <div>
      <div
        className="relative h-60"
        role="img"
        aria-label={t("chart.aria")}
      >
        <div className="absolute inset-x-0 top-0 flex h-[220px] flex-col justify-between">
          {[0, 1, 2, 3].map((line) => (
            <i key={line} className="border-t border-dashed border-white/15" />
          ))}
        </div>
        <svg
          className="absolute inset-x-0 top-0 h-[220px] w-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="runwayArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#34d399" stopOpacity=".35" />
              <stop offset="1" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
          </defs>
          {path ? (
            <>
              <path
                d={`${path} L${width},${height} L0,${height} Z`}
                fill="url(#runwayArea)"
              />
              <path
                d={path}
                fill="none"
                stroke="#34d399"
                strokeWidth="4"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-white/50">
          {ticks.map((tick) => (
            <span key={tick}>
              {tick === 0
                ? t("chart.now")
                : t("chart.monthShort", { month: tick })}
            </span>
          ))}
        </div>
      </div>
      <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
        <summary className="cursor-pointer font-medium text-white">
          {t("chart.tableTitle")}
        </summary>
        <div className="mt-3 max-h-48 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="pb-2">{t("chart.month")}</th>
                <th>{t("chart.inflows")}</th>
                <th>{t("chart.outflows")}</th>
                <th>{t("chart.closing")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((month) => (
                <tr key={month.month} className="border-t border-white/10">
                  <td className="py-2">{month.month}</td>
                  <td>
                    {formatCents(
                      month.continuing_income_cents +
                        month.confirmed_funds_cents +
                        month.temporary_income_cents,
                      locale,
                      currency,
                    )}
                  </td>
                  <td>
                    {formatCents(
                      month.essential_outflow_cents,
                      locale,
                      currency,
                    )}
                  </td>
                  <td>
                    {formatCents(month.closing_balance_cents, locale, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function employmentIncome(
  status: EmploymentStatus,
  existing?: IncomeAnswer,
): IncomeAnswer {
  return {
    employment: status,
    monthly_take_home_cents:
      status === "unemployed" || status === "not_working"
        ? 0
        : (existing?.monthly_take_home_cents ?? 0),
    entered_amount_cents:
      status === "unemployed" || status === "not_working"
        ? 0
        : (existing?.entered_amount_cents ?? 0),
    entered_period: existing?.entered_period ?? "annual",
    entered_as: existing?.entered_as ?? "gross",
    confidence:
      status === "unemployed" || status === "not_working"
        ? "confirmed"
        : (existing?.confidence ?? "estimated"),
    take_home_reviewed:
      status === "unemployed" || status === "not_working"
        ? true
        : (existing?.take_home_reviewed ?? false),
    estimate_rule_version: existing?.estimate_rule_version,
  };
}

export function HouseholdRunway({
  initialAnswers,
  isAuthenticated,
  hasSavedPlan,
}: HouseholdRunwayProps) {
  const t = useTranslations("householdRunway");
  const locale = useLocale();
  const [answers, setAnswers] = useState<HouseholdRunwayAnswers>(
    () => initialAnswers ?? createDefaultRunwayAnswers(),
  );
  const [step, setStep] = useState(initialAnswers ? STEP_IDS.length - 1 : 0);
  const [hydrated, setHydrated] = useState(false);
  const [completed, setCompleted] = useState(Boolean(initialAnswers));
  const [error, setError] = useState("");
  const [detailedExpenses, setDetailedExpenses] = useState(false);
  const [scenario, setScenario] = useState<RunwayScenario>(() =>
    initialAnswers ? availableScenarios(initialAnswers)[0].id : "mine_stops",
  );
  const [adjustments, setAdjustments] = useState<RunwayAdjustments>(() => ({
    ...EMPTY_ADJUSTMENTS,
    investment_access_percent: initialAnswers?.investment_access_percent ?? 70,
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(hasSavedPlan);

  useEffect(() => {
    const draft = parseDraftEnvelope(
      window.localStorage.getItem(RUNWAY_DRAFT_STORAGE_KEY),
    );
    if (draft) {
      setAnswers(draft.answers);
      setStep(Math.min(draft.step, STEP_IDS.length - 1));
      setCompleted(draft.completed);
      setScenario(availableScenarios(draft.answers)[0].id);
      setAdjustments((current) => ({
        ...current,
        investment_access_percent: draft.answers.investment_access_percent,
      }));
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      RUNWAY_DRAFT_STORAGE_KEY,
      JSON.stringify(createDraftEnvelope(answers, step, completed)),
    );
  }, [answers, completed, hydrated, step]);

  const stepId = STEP_IDS[step];
  const scenarios = useMemo(() => availableScenarios(answers), [answers]);
  const baseline = useMemo(
    () => simulateHouseholdRunway(answers, scenario),
    [answers, scenario],
  );
  const preview = useMemo(
    () => simulateHouseholdRunway(answers, scenario, adjustments),
    [answers, adjustments, scenario],
  );
  const currentLifestyle = useMemo(() => {
    const currentExpenseAnswers: HouseholdRunwayAnswers = {
      ...answers,
      expenses: Object.fromEntries(
        EXPENSE_CATEGORIES.map((category) => [
          category,
          {
            ...answers.expenses[category],
            interruption_cents: answers.expenses[category].current_cents,
          },
        ]),
      ) as HouseholdRunwayAnswers["expenses"],
    };
    return simulateHouseholdRunway(currentExpenseAnswers, scenario);
  }, [answers, scenario]);
  const extreme = useMemo(
    () => simulateHouseholdRunway(answers, scenario, { include_retirement: true }),
    [answers, scenario],
  );
  const scenarioResults = useMemo(
    () =>
      scenarios.map((option) => ({
        scenario: option.id,
        result: simulateHouseholdRunway(answers, option.id),
      })),
    [answers, scenarios],
  );
  const actions = useMemo(
    () => highestLeverageActions(answers, preview),
    [answers, preview],
  );
  const totalCurrent = EXPENSE_CATEGORIES.reduce(
    (sum, key) => sum + answers.expenses[key].current_cents,
    0,
  );
  const totalInterruption = EXPENSE_CATEGORIES.reduce(
    (sum, key) => sum + answers.expenses[key].interruption_cents,
    0,
  );

  const update = (patch: Partial<HouseholdRunwayAnswers>) => {
    setSaved(false);
    setAnswers((current) => ({
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    }));
  };
  const updateIncome = (
    person: "mine" | "partner",
    patch: Partial<IncomeAnswer>,
  ) => {
    setSaved(false);
    setAnswers((current) => {
      const base =
        person === "mine"
          ? current.mine
          : (current.partner ?? employmentIncome("employed"));
      const next = { ...base, ...patch };
      if (next.entered_as === "gross" && next.entered_amount_cents > 0) {
        const estimate = estimateMonthlyTakeHome({
          country: current.country,
          region: current.region,
          amountCents: next.entered_amount_cents,
          period: next.entered_period,
        });
        next.monthly_take_home_cents = estimate.monthlyTakeHomeCents;
        next.estimate_rule_version = estimate.ruleVersion;
        next.confidence = "estimated";
        next.take_home_reviewed = patch.take_home_reviewed ?? false;
      } else if (next.entered_as === "net") {
        next.monthly_take_home_cents =
          next.entered_period === "annual"
            ? Math.round(next.entered_amount_cents / 12)
            : next.entered_amount_cents;
        next.confidence = "confirmed";
        next.take_home_reviewed = true;
        delete next.estimate_rule_version;
      }
      return {
        ...current,
        [person]: next,
        updated_at: new Date().toISOString(),
      };
    });
  };
  const updateExpense = (
    category: ExpenseCategory,
    patch: Partial<HouseholdRunwayAnswers["expenses"][ExpenseCategory]>,
  ) => {
    setSaved(false);
    setAnswers((current) => ({
      ...current,
      expenses: {
        ...current.expenses,
        [category]: {
          ...current.expenses[category],
          ...patch,
          confidence: "confirmed",
        },
      },
      updated_at: new Date().toISOString(),
    }));
  };

  const validateStep = () => {
    if (stepId === "location" && !answers.region.trim())
      return t("validation.region");
    if (
      stepId === "myIncome" &&
      ["employed", "self_employed"].includes(answers.mine.employment) &&
      answers.mine.monthly_take_home_cents <= 0
    )
      return t("validation.income");
    if (
      stepId === "myIncome" &&
      answers.mine.entered_as === "gross" &&
      !answers.mine.take_home_reviewed
    )
      return t("validation.reviewEstimate");
    if (
      stepId === "partnerIncome" &&
      answers.partner &&
      ["employed", "self_employed"].includes(answers.partner.employment) &&
      answers.partner.monthly_take_home_cents <= 0
    )
      return t("validation.income");
    if (
      stepId === "partnerIncome" &&
      answers.partner?.entered_as === "gross" &&
      !answers.partner.take_home_reviewed
    )
      return t("validation.reviewEstimate");
    if (stepId === "expenses" && totalInterruption <= 0)
      return t("validation.expenses");
    return "";
  };
  const adjacentStep = (current: number, direction: 1 | -1) => {
    let candidate = current + direction;
    while (candidate > 0 && candidate < STEP_IDS.length - 1) {
      const candidateId = STEP_IDS[candidate];
      const skipMineIncome =
        candidateId === "myIncome" &&
        ["unemployed", "not_working"].includes(answers.mine.employment);
      const skipPartnerIncome =
        candidateId === "partnerIncome" &&
        (!answers.partner ||
          ["unemployed", "not_working"].includes(answers.partner.employment));
      if (!skipMineIncome && !skipPartnerIncome) break;
      candidate += direction;
    }
    return Math.max(0, Math.min(STEP_IDS.length - 1, candidate));
  };
  const next = () => {
    const issue = validateStep();
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    if (stepId === "welcome") trackRunwayEvent("started", stepId);
    if (stepId === "review") {
      setCompleted(true);
      setScenario(scenarios[0].id);
      trackRunwayEvent("completed", stepId);
    }
    setStep((current) => adjacentStep(current, 1));
  };
  const skip = () => {
    setError("");
    trackRunwayEvent("skipped", stepId);
    setStep((current) => adjacentStep(current, 1));
  };
  const clearDraft = () => {
    window.localStorage.removeItem(RUNWAY_DRAFT_STORAGE_KEY);
    window.localStorage.removeItem(RUNWAY_IMPORT_ACTION_KEY);
    const reset = createDefaultRunwayAnswers();
    setAnswers(reset);
    setStep(0);
    setCompleted(false);
    setSaved(false);
    setAdjustments({ ...EMPTY_ADJUSTMENTS });
  };

  const applyWhatIf = () => {
    let remainingReduction = adjustments.expense_reduction_cents;
    const expenses = { ...answers.expenses };
    const ordered = [...EXPENSE_CATEGORIES].sort(
      (a, b) => expenses[b].interruption_cents - expenses[a].interruption_cents,
    );
    for (const key of ordered) {
      const reduction = Math.min(
        remainingReduction,
        expenses[key].interruption_cents,
      );
      expenses[key] = {
        ...expenses[key],
        interruption_cents: expenses[key].interruption_cents - reduction,
      };
      remainingReduction -= reduction;
      if (remainingReduction <= 0) break;
    }
    update({
      available_cash: {
        cents: answers.available_cash.cents + adjustments.added_cash_cents,
        confidence: "confirmed",
      },
      other_monthly_income: {
        cents:
          answers.other_monthly_income.cents +
          adjustments.added_monthly_income_cents,
        confidence: "confirmed",
      },
      investment_access_percent: adjustments.investment_access_percent,
      expenses,
    });
    trackRunwayEvent("result_interaction", "what_if_apply");
    setAdjustments({
      ...EMPTY_ADJUSTMENTS,
      investment_access_percent: adjustments.investment_access_percent,
    });
  };

  const savePlan = async () => {
    setSaving(true);
    setError("");
    try {
      const existingActionId = window.localStorage.getItem(
        RUNWAY_IMPORT_ACTION_KEY,
      );
      const snapshotActionId = existingActionId ?? crypto.randomUUID();
      if (!existingActionId)
        window.localStorage.setItem(
          RUNWAY_IMPORT_ACTION_KEY,
          snapshotActionId,
        );
      const response = await fetch("/api/finance/cushion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          status: "completed",
          attribution: getAttribution(),
          create_snapshot: true,
          snapshot_action_id: snapshotActionId,
          snapshot_trigger: hasSavedPlan ? "updated" : "imported",
        }),
      });
      if (!response.ok) throw new Error(t("save.error"));
      setSaved(true);
      window.localStorage.removeItem(RUNWAY_DRAFT_STORAGE_KEY);
      window.localStorage.removeItem(RUNWAY_IMPORT_ACTION_KEY);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("save.error"),
      );
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    const resultLine = (result: RunwaySimulation) =>
      result.sustainable
        ? "continuing income covers essential expenses"
        : `${result.months_covered?.toFixed(1) ?? "—"} months${result.depletion_date ? ` (estimated depletion ${result.depletion_date})` : ""}`;
    const content = [
      "BetterR.me Household Runway",
      "",
      primarySentence(preview, t),
      "",
      "APPLICABLE INCOME INTERRUPTION SCENARIOS",
      ...scenarioResults.map(
        ({ scenario: scenarioId, result }) =>
          `${t(`scenarios.${scenarioId}`)}: ${resultLine(result)}`,
      ),
      "",
      "PLAN COMPARISON",
      `Current lifestyle: ${resultLine(currentLifestyle)}`,
      `Interruption plan: ${resultLine(baseline)}`,
      `Extreme mode (retirement at 30% haircut): ${resultLine(extreme)}`,
      "",
      "INPUT SUMMARY",
      `Starting resources: ${formatCents(preview.starting_resources_cents, locale, answers.currency)}`,
      `Continuing monthly income: ${formatCents(preview.continuing_monthly_income_cents, locale, answers.currency)}`,
      `Interruption monthly expenses: ${formatCents(preview.interruption_expenses_cents, locale, answers.currency)}`,
      `Excluded assets: ${formatCents(preview.excluded_assets_cents, locale, answers.currency)}`,
      "",
      "ASSUMPTIONS",
      `Country / region / currency: ${answers.country} / ${answers.region} / ${answers.currency}`,
      `Taxable investment access: ${answers.investment_access_percent}%`,
      "Confirmed future money is added only in its stated arrival month.",
      "Retirement and home equity are excluded from the main answer.",
      "",
      "HIGHEST-LEVERAGE ACTIONS",
      `Next target: ${actions.targetMonths} months`,
      `Additional cash needed: ${formatCents(actions.cashGapCents, locale, answers.currency)}`,
      ...(actions.largestReducibleCategory
        ? [
            `Largest reducible category: ${t(`expenseCategories.${actions.largestReducibleCategory.category}`)} (${formatCents(actions.largestReducibleCategory.reducible, locale, answers.currency)})`,
          ]
        : []),
      "",
      "Educational scenario estimate only; not tax, investment, legal, or financial advice.",
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "household-runway-plan.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-[#f5f6f2] text-slate-950 dark:bg-[#101310] dark:text-white">
      <header className="border-b border-black/5 bg-[#f5f6f2]/90 backdrop-blur dark:border-white/10 dark:bg-[#101310]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="font-display text-xl font-bold">
            BetterR<span className="text-emerald-600">.me</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <LockKeyhole className="h-3.5 w-3.5" />
            {t("privacy.local")}
          </div>
        </div>
      </header>
      {stepId === "result" ? (
        <ResultExperience
          t={t}
          locale={locale}
          answers={answers}
          scenarios={scenarios.map((item) => item.id)}
          scenario={scenario}
          setScenario={(value) => {
            setScenario(value);
            trackRunwayEvent("result_interaction", "scenario_switch");
          }}
          baseline={baseline}
          preview={preview}
          currentLifestyle={currentLifestyle}
          extreme={extreme}
          adjustments={adjustments}
          setAdjustments={setAdjustments}
          actions={actions}
          onApply={applyWhatIf}
          onReset={() =>
            setAdjustments({
              ...EMPTY_ADJUSTMENTS,
              investment_access_percent: answers.investment_access_percent,
            })
          }
          onEdit={() => setStep(STEP_IDS.indexOf("review"))}
          onDownload={download}
          isAuthenticated={isAuthenticated}
          saved={saved}
          saving={saving}
          onSave={savePlan}
          error={error}
        />
      ) : (
        <section className="mx-auto flex min-h-[calc(100vh-65px)] max-w-3xl flex-col px-5 py-8 sm:justify-center sm:py-12">
          {stepId !== "welcome" ? (
            <div className="mb-8 flex items-center justify-between text-xs text-slate-400">
              <span>{t(`steps.${stepId}.eyebrow`)}</span>
              <span>
                {t("progress.remaining", {
                  minutes: Math.max(
                    1,
                    Math.ceil((STEP_IDS.length - step - 2) * 0.15),
                  ),
                })}
              </span>
            </div>
          ) : null}
          <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-[0_24px_80px_-45px_rgba(15,23,42,.4)] dark:border-white/10 dark:bg-white/[.04] sm:p-10">
            <StepContent
              step={stepId}
              t={t}
              answers={answers}
              update={update}
              updateIncome={updateIncome}
              updateExpense={updateExpense}
              detailedExpenses={detailedExpenses}
              setDetailedExpenses={setDetailedExpenses}
              totalCurrent={totalCurrent}
              totalInterruption={totalInterruption}
            />
            {error ? (
              <p
                role="alert"
                className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
              >
                {error}
              </p>
            ) : null}
            <div className="mt-8 flex items-center justify-between gap-3">
              <div>
                {step > 0 ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setError("");
                      setStep((current) => adjacentStep(current, -1));
                    }}
                  >
                    <ArrowLeft />
                    {t("actions.back")}
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {OPTIONAL_STEPS.has(stepId) ? (
                  <Button variant="ghost" onClick={skip}>
                    {t("actions.skip")}
                  </Button>
                ) : null}
                <Button onClick={next}>
                  {stepId === "welcome"
                    ? t("actions.start")
                    : stepId === "review"
                      ? t("actions.reveal")
                      : t("actions.continue")}
                  <ArrowRight />
                </Button>
              </div>
            </div>
          </div>
          {step > 0 ? (
            <button
              onClick={clearDraft}
              className="mx-auto mt-6 flex items-center gap-2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("actions.clear")}
            </button>
          ) : null}
        </section>
      )}
    </main>
  );
}

function StepContent({
  step,
  t,
  answers,
  update,
  updateIncome,
  updateExpense,
  detailedExpenses,
  setDetailedExpenses,
  totalCurrent,
  totalInterruption,
}: {
  step: StepId;
  t: ReturnType<typeof useTranslations>;
  answers: HouseholdRunwayAnswers;
  update: (patch: Partial<HouseholdRunwayAnswers>) => void;
  updateIncome: (
    person: "mine" | "partner",
    patch: Partial<IncomeAnswer>,
  ) => void;
  updateExpense: (
    category: ExpenseCategory,
    patch: Partial<HouseholdRunwayAnswers["expenses"][ExpenseCategory]>,
  ) => void;
  detailedExpenses: boolean;
  setDetailedExpenses: (value: boolean) => void;
  totalCurrent: number;
  totalInterruption: number;
}) {
  const confirmedFund = answers.confirmed_funds[0];
  const title = (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-[-.035em] sm:text-4xl">
        {t(`steps.${step}.title`)}
      </h1>
      <p className="mt-3 max-w-xl leading-7 text-slate-500 dark:text-slate-300">
        {t(`steps.${step}.description`)}
      </p>
    </>
  );
  if (step === "welcome")
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <ShieldCheck />
        </div>
        {title}
        <div className="mx-auto mt-8 grid max-w-lg gap-3 text-left sm:grid-cols-3">
          {["private", "fast", "explainable"].map((key) => (
            <div
              key={key}
              className="rounded-2xl bg-slate-50 p-4 text-sm dark:bg-white/5"
            >
              {t(`welcome.${key}`)}
            </div>
          ))}
        </div>
      </div>
    );
  if (step === "location")
    return (
      <>
        {title}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {(["US", "CA", "CN", "TW"] as RunwayCountry[]).map((country) => (
            <ChoiceCard
              key={country}
              selected={answers.country === country}
              title={t(`countries.${country}`)}
              onClick={() =>
                update({ country, currency: currencyForCountry(country) })
              }
            />
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              {t("fields.region")}
            </span>
            <input
              className="h-12 w-full rounded-xl border bg-transparent px-3"
              value={answers.region}
              onChange={(event) => update({ region: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              {t("fields.currency")}
            </span>
            <select
              className="h-12 w-full rounded-xl border bg-transparent px-3"
              value={answers.currency}
              onChange={(event) =>
                update({
                  currency: event.target
                    .value as HouseholdRunwayAnswers["currency"],
                })
              }
            >
              {["USD", "CAD", "CNY", "TWD"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      </>
    );
  if (step === "household")
    return (
      <>
        {title}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            selected={!answers.shares_finances}
            title={t("household.solo")}
            onClick={() => update({ shares_finances: false, partner: null })}
          />
          <ChoiceCard
            selected={answers.shares_finances}
            title={t("household.shared")}
            description={t("household.sharedHelp")}
            onClick={() =>
              update({
                shares_finances: true,
                partner: answers.partner ?? employmentIncome("employed"),
              })
            }
          />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            selected={answers.has_children}
            title={t("household.children")}
            onClick={() => update({ has_children: !answers.has_children })}
          />
          <ChoiceCard
            selected={answers.has_support_obligations}
            title={t("household.support")}
            onClick={() =>
              update({
                has_support_obligations: !answers.has_support_obligations,
              })
            }
          />
        </div>
      </>
    );
  if (step === "employment")
    return (
      <>
        {title}
        <EmploymentPicker
          t={t}
          label={t("employment.me")}
          value={answers.mine.employment}
          onChange={(employment) =>
            update({ mine: employmentIncome(employment, answers.mine) })
          }
        />
        {answers.partner ? (
          <EmploymentPicker
            t={t}
            label={t("employment.partner")}
            value={answers.partner.employment}
            onChange={(employment) =>
              update({
                partner: employmentIncome(
                  employment,
                  answers.partner ?? undefined,
                ),
              })
            }
          />
        ) : null}
      </>
    );
  if (step === "myIncome")
    return (
      <>
        {title}
        <IncomeEditor
          t={t}
          answers={answers}
          income={answers.mine}
          onChange={(patch) => updateIncome("mine", patch)}
        />
      </>
    );
  if (step === "partnerIncome")
    return answers.partner ? (
      <>
        {title}
        <IncomeEditor
          t={t}
          answers={answers}
          income={answers.partner}
          onChange={(patch) => updateIncome("partner", patch)}
        />
      </>
    ) : (
      <>
        {title}
        <p className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500 dark:bg-white/5">
          {t("income.noPartner")}
        </p>
      </>
    );
  if (step === "otherIncome")
    return (
      <>
        {title}
        <div className="mt-7">
          <MoneyField
            label={t("fields.otherIncome")}
            help={t("fields.otherIncomeHelp")}
            currency={answers.currency}
            value={answers.other_monthly_income.cents}
            onChange={(value) =>
              update({
                other_monthly_income: {
                  cents: value,
                  confidence: value ? "confirmed" : "skipped",
                },
              })
            }
          />
        </div>
      </>
    );
  if (step === "cash")
    return (
      <>
        {title}
        <div className="mt-7">
          <MoneyField
            label={t("fields.availableCash")}
            help={t("fields.availableCashHelp")}
            currency={answers.currency}
            value={answers.available_cash.cents}
            onChange={(value) =>
              update({
                available_cash: { cents: value, confidence: "confirmed" },
              })
            }
          />
        </div>
      </>
    );
  if (step === "confirmedFunds")
    return (
      <>
        {title}
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <MoneyField
            label={t("fields.confirmedAmount")}
            currency={answers.currency}
            value={confirmedFund?.amount_cents ?? 0}
            onChange={(value) =>
              update({
                confirmed_funds: value
                  ? [
                      {
                        id: confirmedFund?.id ?? crypto.randomUUID(),
                        amount_cents: value,
                        arrives_month: confirmedFund?.arrives_month ?? 1,
                        confidence: "confirmed",
                      },
                    ]
                  : [],
              })
            }
          />
          <label>
            <span className="mb-2 block text-sm font-medium">
              {t("fields.arrivalMonth")}
            </span>
            <input
              aria-label={t("fields.arrivalMonth")}
              type="number"
              min="1"
              max="120"
              className="h-12 w-full rounded-xl border bg-transparent px-3"
              value={confirmedFund?.arrives_month ?? 1}
              onChange={(event) =>
                confirmedFund &&
                update({
                  confirmed_funds: [
                    {
                      ...confirmedFund,
                      arrives_month: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    },
                  ],
                })
              }
            />
          </label>
        </div>
        <p className="mt-4 flex gap-2 text-xs leading-5 text-slate-400">
          <Info className="h-4 w-4 shrink-0" />
          {t("fields.confirmedHelp")}
        </p>
      </>
    );
  if (step === "assets")
    return (
      <>
        {title}
        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <MoneyField
            label={t("fields.investments")}
            currency={answers.currency}
            value={answers.taxable_investments.cents}
            onChange={(value) =>
              update({
                taxable_investments: {
                  cents: value,
                  confidence: value ? "confirmed" : "skipped",
                },
              })
            }
          />
          <MoneyField
            label={t("fields.retirement")}
            currency={answers.currency}
            value={answers.retirement_accounts.cents}
            onChange={(value) =>
              update({
                retirement_accounts: {
                  cents: value,
                  confidence: value ? "confirmed" : "skipped",
                },
              })
            }
          />
          <MoneyField
            label={t("fields.homeEquity")}
            currency={answers.currency}
            value={answers.home_equity.cents}
            onChange={(value) =>
              update({
                home_equity: {
                  cents: value,
                  confidence: value ? "confirmed" : "skipped",
                },
              })
            }
          />
        </div>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
          <label className="flex justify-between text-sm font-medium">
            <span>{t("fields.investmentAccess")}</span>
            <span className="text-emerald-600">
              {answers.investment_access_percent}%
            </span>
          </label>
          <input
            aria-label={t("fields.investmentAccess")}
            type="range"
            min="0"
            max="100"
            step="5"
            className="mt-3 w-full accent-emerald-600"
            value={answers.investment_access_percent}
            onChange={(event) =>
              update({ investment_access_percent: Number(event.target.value) })
            }
          />
        </div>
      </>
    );
  if (step === "expenses")
    return (
      <>
        {title}
        <button
          className="mt-6 flex items-center gap-2 text-sm font-semibold text-emerald-700"
          onClick={() => setDetailedExpenses(!detailedExpenses)}
        >
          {detailedExpenses
            ? t("expenses.useTotals")
            : t("expenses.addDetails")}
          <ChevronDown
            className={`h-4 w-4 ${detailedExpenses ? "rotate-180" : ""}`}
          />
        </button>
        {detailedExpenses ? (
          <div className="mt-5">
            <div className="mb-2 grid grid-cols-[1fr_110px_110px] gap-2 text-xs text-slate-400">
              <span>{t("expenses.category")}</span>
              <span>{t("expenses.current")}</span>
              <span>{t("expenses.interruption")}</span>
            </div>
            {EXPENSE_CATEGORIES.map((category) => (
              <div
                key={category}
                className="grid grid-cols-[1fr_110px_110px] items-center gap-2 border-t py-3"
              >
                <span className="text-sm">
                  {t(`expenseCategories.${category}`)}
                </span>
                <input
                  aria-label={`${t(`expenseCategories.${category}`)} ${t("expenses.current")}`}
                  type="number"
                  min="0"
                  className="h-10 rounded-lg border bg-transparent px-2"
                  value={dollars(answers.expenses[category].current_cents)}
                  onChange={(event) =>
                    updateExpense(category, {
                      current_cents: cents(event.target.value),
                    })
                  }
                />
                <input
                  aria-label={`${t(`expenseCategories.${category}`)} ${t("expenses.interruption")}`}
                  type="number"
                  min="0"
                  className="h-10 rounded-lg border bg-transparent px-2"
                  value={dollars(answers.expenses[category].interruption_cents)}
                  onChange={(event) =>
                    updateExpense(category, {
                      interruption_cents: cents(event.target.value),
                    })
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <MoneyField
              label={t("expenses.currentTotal")}
              currency={answers.currency}
              value={totalCurrent}
              onChange={(value) => {
                const reset = Object.fromEntries(
                  EXPENSE_CATEGORIES.map((key) => [
                    key,
                    {
                      current_cents: 0,
                      interruption_cents: 0,
                      confidence: "skipped",
                    },
                  ]),
                ) as HouseholdRunwayAnswers["expenses"];
                reset.other = {
                  ...reset.other,
                  current_cents: value,
                  interruption_cents: Math.min(value, totalInterruption),
                  confidence: "confirmed",
                };
                update({ expenses: reset });
              }}
            />
            <MoneyField
              label={t("expenses.interruptionTotal")}
              currency={answers.currency}
              value={totalInterruption}
              onChange={(value) =>
                updateExpense("other", {
                  current_cents: Math.max(totalCurrent, value),
                  interruption_cents: value,
                })
              }
            />
          </div>
        )}
      </>
    );
  if (step === "temporaryIncome")
    return (
      <>
        {title}
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <MoneyField
            label={t("fields.temporaryIncome")}
            currency={answers.currency}
            value={answers.temporary_income?.monthly_cents ?? 0}
            onChange={(value) =>
              update({
                temporary_income: value
                  ? {
                      monthly_cents: value,
                      remaining_months:
                        answers.temporary_income?.remaining_months ?? 1,
                      confidence: "confirmed",
                    }
                  : null,
              })
            }
          />
          <label>
            <span className="mb-2 block text-sm font-medium">
              {t("fields.remainingMonths")}
            </span>
            <input
              aria-label={t("fields.remainingMonths")}
              type="number"
              min="1"
              max="120"
              className="h-12 w-full rounded-xl border bg-transparent px-3"
              value={answers.temporary_income?.remaining_months ?? 1}
              onChange={(event) =>
                answers.temporary_income &&
                update({
                  temporary_income: {
                    ...answers.temporary_income,
                    remaining_months: Math.max(
                      1,
                      Number(event.target.value) || 1,
                    ),
                  },
                })
              }
            />
          </label>
        </div>
      </>
    );
  if (step === "review")
    return (
      <>
        {title}
        <div className="mt-7 grid gap-3">
          <ReviewRow
            label={t("review.location")}
            value={`${t(`countries.${answers.country}`)} · ${answers.region} · ${answers.currency}`}
            status="confirmed"
            t={t}
          />
          <ReviewRow
            label={t("review.household")}
            value={
              answers.partner ? t("review.twoAdults") : t("review.oneAdult")
            }
            status="confirmed"
            t={t}
          />
          <ReviewRow
            label={t("review.cash")}
            value={formatCents(
              answers.available_cash.cents,
              "en",
              answers.currency,
            )}
            status={answers.available_cash.confidence}
            t={t}
          />
          <ReviewRow
            label={t("review.expenses")}
            value={`${formatCents(totalCurrent, "en", answers.currency)} → ${formatCents(totalInterruption, "en", answers.currency)}`}
            status={totalInterruption ? "confirmed" : "skipped"}
            t={t}
          />
          <ReviewRow
            label={t("review.income")}
            value={formatCents(
              answers.mine.monthly_take_home_cents +
                (answers.partner?.monthly_take_home_cents ?? 0),
              "en",
              answers.currency,
            )}
            status={answers.mine.confidence}
            t={t}
          />
          <ReviewRow
            label={t("review.otherIncome")}
            value={formatCents(
              answers.other_monthly_income.cents,
              "en",
              answers.currency,
            )}
            status={answers.other_monthly_income.confidence}
            t={t}
          />
          <ReviewRow
            label={t("review.confirmedFunds")}
            value={formatCents(
              answers.confirmed_funds.reduce(
                (sum, fund) => sum + fund.amount_cents,
                0,
              ),
              "en",
              answers.currency,
            )}
            status={answers.confirmed_funds.length ? "confirmed" : "skipped"}
            t={t}
          />
          <ReviewRow
            label={t("review.investments")}
            value={formatCents(
              answers.taxable_investments.cents,
              "en",
              answers.currency,
            )}
            status={answers.taxable_investments.confidence}
            t={t}
          />
          <ReviewRow
            label={t("review.lastResort")}
            value={`${formatCents(answers.retirement_accounts.cents, "en", answers.currency)} · ${formatCents(answers.home_equity.cents, "en", answers.currency)}`}
            status={
              answers.retirement_accounts.confidence === "skipped" &&
              answers.home_equity.confidence === "skipped"
                ? "skipped"
                : "confirmed"
            }
            t={t}
          />
          <ReviewRow
            label={t("review.temporaryIncome")}
            value={formatCents(
              answers.temporary_income?.monthly_cents ?? 0,
              "en",
              answers.currency,
            )}
            status={answers.temporary_income?.confidence ?? "skipped"}
            t={t}
          />
        </div>
      </>
    );
  return title;
}

function EmploymentPicker({
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
      <h2 className="mb-3 text-sm font-semibold">{label}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            "employed",
            "self_employed",
            "unemployed",
            "not_working",
          ] as EmploymentStatus[]
        ).map((status) => (
          <ChoiceCard
            key={status}
            selected={value === status}
            title={t(`employment.${status}`)}
            onClick={() => onChange(status)}
          />
        ))}
      </div>
    </div>
  );
}

function IncomeEditor({
  t,
  answers,
  income,
  onChange,
}: {
  t: ReturnType<typeof useTranslations>;
  answers: HouseholdRunwayAnswers;
  income: IncomeAnswer;
  onChange: (patch: Partial<IncomeAnswer>) => void;
}) {
  if (income.employment === "unemployed" || income.employment === "not_working")
    return (
      <div className="mt-7 rounded-2xl bg-slate-50 p-5 text-sm leading-6 text-slate-500 dark:bg-white/5">
        {t("income.notAsked")}
      </div>
    );
  return (
    <div className="mt-7">
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          selected={income.entered_as === "gross"}
          title={t("income.gross")}
          onClick={() =>
            income.entered_as !== "gross" &&
            onChange({
              entered_as: "gross",
              entered_amount_cents: 0,
              monthly_take_home_cents: 0,
              take_home_reviewed: false,
            })
          }
        />
        <ChoiceCard
          selected={income.entered_as === "net"}
          title={t("income.net")}
          onClick={() =>
            income.entered_as !== "net" &&
            onChange({
              entered_as: "net",
              entered_amount_cents: 0,
              monthly_take_home_cents: 0,
              take_home_reviewed: true,
            })
          }
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <MoneyField
          label={t("income.amount")}
          currency={answers.currency}
          value={income.entered_amount_cents}
          onChange={(value) => onChange({ entered_amount_cents: value })}
        />
        <label>
          <span className="mb-2 block text-sm font-medium">
            {t("income.period")}
          </span>
          <select
            className="h-12 w-full rounded-xl border bg-transparent px-3"
            value={income.entered_period}
            onChange={(event) =>
              onChange({
                entered_period: event.target
                  .value as IncomeAnswer["entered_period"],
              })
            }
          >
            <option value="annual">{t("income.annual")}</option>
            <option value="monthly">{t("income.monthly")}</option>
          </select>
        </label>
      </div>
      {income.entered_as === "gross" && income.monthly_take_home_cents > 0 ? (
        <div className="mt-5 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            {t("income.estimate")}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {formatCents(
              income.monthly_take_home_cents,
              "en",
              answers.currency,
            )}{" "}
            <span className="text-sm font-normal">/ {t("income.month")}</span>
          </p>
          <button
            className="mt-2 text-xs font-semibold underline disabled:no-underline disabled:opacity-70"
            disabled={income.take_home_reviewed}
            onClick={() => onChange({ take_home_reviewed: true })}
          >
            {income.take_home_reviewed
              ? t("income.estimateReviewed")
              : t("income.confirmEstimate")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ReviewRow({
  label,
  value,
  status,
  t,
}: {
  label: string;
  value: string;
  status: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-1 font-medium">{value}</p>
      </div>
      <span
        className={`rounded-full px-2.5 py-1 text-[11px] ${status === "confirmed" ? "bg-emerald-100 text-emerald-700" : status === "estimated" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}
      >
        {t(`confidence.${status}`)}
      </span>
    </div>
  );
}

function primarySentence(
  simulation: RunwaySimulation,
  t: ReturnType<typeof useTranslations>,
) {
  if (simulation.sustainable) return t("result.sustainable");
  if (!simulation.depletion_date)
    return t("result.primaryOver", {
      months: simulation.months_covered?.toFixed(0) ?? "120",
    });
  return t("result.primary", {
    months: (simulation.months_covered ?? 0).toFixed(1),
    date: simulation.depletion_date ?? "—",
  });
}

function ResultExperience({
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
}: {
  t: ReturnType<typeof useTranslations>;
  locale: string;
  answers: HouseholdRunwayAnswers;
  scenarios: RunwayScenario[];
  scenario: RunwayScenario;
  setScenario: (value: RunwayScenario) => void;
  baseline: RunwaySimulation;
  preview: RunwaySimulation;
  currentLifestyle: RunwaySimulation;
  extreme: RunwaySimulation;
  adjustments: RunwayAdjustments;
  setAdjustments: (value: RunwayAdjustments) => void;
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
}) {
  const delta =
    preview.months_covered !== null && baseline.months_covered !== null
      ? preview.months_covered - baseline.months_covered
      : null;
  const hasAdjustments =
    adjustments.expense_reduction_cents > 0 ||
    adjustments.added_cash_cents > 0 ||
    adjustments.added_monthly_income_cents > 0 ||
    adjustments.expected_unconfirmed_funds_cents > 0 ||
    adjustments.include_retirement ||
    adjustments.investment_access_percent !==
      answers.investment_access_percent;
  const guidance =
    preview.months_covered === null || preview.months_covered >= 6
      ? "stronger"
      : preview.months_covered >= 3
        ? "limited"
        : "urgent";
  const precisionQuestions = [
    answers.available_cash.confidence === "skipped"
      ? t("precision.cash")
      : null,
    answers.mine.confidence === "estimated" ||
    answers.partner?.confidence === "estimated"
      ? t("precision.takeHome")
      : null,
    EXPENSE_CATEGORIES.filter(
      (category) => answers.expenses[category].confidence === "skipped",
    ).length > 3
      ? t("precision.expenses")
      : null,
  ]
    .filter((question): question is string => Boolean(question))
    .slice(0, 2);
  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-600">
          {t("result.eyebrow")}
        </p>
        <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold leading-tight tracking-[-.04em] sm:text-5xl">
          <span className="mb-2 block font-sans text-sm font-semibold tracking-normal text-slate-500">
            {t("result.scenarioLead", { scenario: t(`scenarios.${scenario}`) })}
          </span>
          {primarySentence(preview, t)}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            {t(`guidance.${guidance}`)}
          </span>
          <span className="text-xs text-slate-400">
            {t(`confidence.${preview.confidence}`)} · {t("result.model")}
          </span>
        </div>
      </div>
      <div
        className="mb-6 flex flex-wrap gap-2"
        role="tablist"
        aria-label={t("result.scenarios")}
      >
        {scenarios.map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={scenario === item}
            onClick={() => setScenario(item)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${scenario === item ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "border bg-white dark:bg-white/5"}`}
          >
            {t(`scenarios.${item}`)}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-3xl bg-[#11261c] p-6 text-white shadow-xl sm:p-8">
          <div className="grid grid-cols-3 gap-3 border-b border-white/10 pb-5 text-center">
            <Metric
              label={t("result.resources")}
              value={formatCents(
                preview.starting_resources_cents,
                locale,
                answers.currency,
              )}
            />
            <Metric
              label={t("result.income")}
              value={formatCents(
                preview.continuing_monthly_income_cents,
                locale,
                answers.currency,
              )}
            />
            <Metric
              label={t("result.expenses")}
              value={formatCents(
                preview.interruption_expenses_cents,
                locale,
                answers.currency,
              )}
            />
          </div>
          <RunwayChart
            simulation={preview}
            currency={answers.currency}
            locale={locale}
            t={t}
          />
        </div>
        <div className="space-y-5">
          <div className="rounded-3xl border bg-white p-6 dark:bg-white/[.04]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("why.title")}</h2>
              <button
                onClick={onEdit}
                className="text-xs font-semibold text-emerald-700"
              >
                {t("actions.review")}
              </button>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <Breakdown
                label={t("why.cash")}
                value={formatCents(
                  answers.available_cash.cents,
                  locale,
                  answers.currency,
                )}
              />
              <Breakdown
                label={t("why.investments")}
                value={formatCents(
                  Math.round(
                    (answers.taxable_investments.cents *
                      adjustments.investment_access_percent) /
                      100,
                  ),
                  locale,
                  answers.currency,
                )}
              />
              <Breakdown
                label={t("why.reducible")}
                value={formatCents(
                  preview.reducible_expenses_cents,
                  locale,
                  answers.currency,
                )}
              />
              <Breakdown
                label={t("why.excluded")}
                value={formatCents(
                  preview.excluded_assets_cents,
                  locale,
                  answers.currency,
                )}
              />
              {precisionQuestions.length > 0 ? (
                <div className="border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("precision.title")}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-500">
                    {precisionQuestions.map((question) => (
                      <li key={question}>• {question}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-3xl border bg-white p-6 dark:bg-white/[.04]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold">
                {t("actionsPlan.title")}
              </h2>
            </div>
            <div className="mt-5 space-y-4 text-sm">
              {actions.cashGapCents > 0 ? (
                <p>
                  <strong>
                    {t("actionsPlan.cashTarget", {
                      months: actions.targetMonths,
                    })}
                  </strong>
                  <br />
                  <span className="text-slate-500">
                    {formatCents(
                      actions.cashGapCents,
                      locale,
                      answers.currency,
                    )}
                  </span>
                </p>
              ) : null}
              {actions.largestReducibleCategory ? (
                <p>
                  <strong>{t("actionsPlan.largest")}</strong>
                  <br />
                  <span className="text-slate-500">
                    {t(
                      `expenseCategories.${actions.largestReducibleCategory.category}`,
                    )}{" "}
                    ·{" "}
                    {formatCents(
                      actions.largestReducibleCategory.reducible,
                      locale,
                      answers.currency,
                    )}
                  </span>
                </p>
              ) : null}
              <p className="text-xs leading-5 text-slate-400">
                {t(`regionalActions.${answers.country}`)}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-3xl border bg-white p-6 dark:bg-white/[.04] sm:p-8">
        <div>
          <h2 className="text-xl font-semibold">{t("comparison.title")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("comparison.description")}
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <ComparisonCard
            label={t("comparison.current")}
            simulation={currentLifestyle}
            t={t}
          />
          <ComparisonCard
            label={t("comparison.interruption")}
            simulation={baseline}
            emphasized
            t={t}
          />
          <ComparisonCard
            label={t("comparison.extreme")}
            simulation={extreme}
            help={t("comparison.extremeHelp")}
            t={t}
          />
        </div>
      </div>
      <div className="mt-6 rounded-3xl border bg-white p-6 dark:bg-white/[.04] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{t("whatIf.title")}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("whatIf.description")}
            </p>
          </div>
          {hasAdjustments && delta !== null ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)} {t("whatIf.months")}
            </span>
          ) : null}
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <MoneyField
            label={t("whatIf.reduceExpenses")}
            currency={answers.currency}
            value={adjustments.expense_reduction_cents}
            onChange={(value) =>
              setAdjustments({ ...adjustments, expense_reduction_cents: value })
            }
          />
          <MoneyField
            label={t("whatIf.addCash")}
            currency={answers.currency}
            value={adjustments.added_cash_cents}
            onChange={(value) =>
              setAdjustments({ ...adjustments, added_cash_cents: value })
            }
          />
          <MoneyField
            label={t("whatIf.addIncome")}
            currency={answers.currency}
            value={adjustments.added_monthly_income_cents}
            onChange={(value) =>
              setAdjustments({
                ...adjustments,
                added_monthly_income_cents: value,
              })
            }
          />
          <MoneyField
            label={t("whatIf.expectedFunds")}
            currency={answers.currency}
            value={adjustments.expected_unconfirmed_funds_cents}
            onChange={(value) =>
              setAdjustments({
                ...adjustments,
                expected_unconfirmed_funds_cents: value,
              })
            }
          />
          <label className="block">
            <span className="mb-2 flex justify-between text-sm font-medium">
              <span>{t("whatIf.investmentAccess")}</span>
              <span>{adjustments.investment_access_percent}%</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              className="w-full accent-emerald-600"
              value={adjustments.investment_access_percent}
              onChange={(event) =>
                setAdjustments({
                  ...adjustments,
                  investment_access_percent: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border p-4 text-sm">
            <input
              type="checkbox"
              checked={adjustments.include_retirement}
              onChange={(event) =>
                setAdjustments({
                  ...adjustments,
                  include_retirement: event.target.checked,
                })
              }
            />
            <span>
              {t("whatIf.retirement")}
              <small className="mt-1 block text-slate-400">
                {t("whatIf.retirementHelp")}
              </small>
            </span>
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={onApply}>{t("actions.apply")}</Button>
          <Button variant="outline" onClick={onReset}>
            <RefreshCcw />
            {t("actions.reset")}
          </Button>
        </div>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <details className="rounded-3xl border bg-white p-6 dark:bg-white/[.04]">
          <summary className="cursor-pointer font-semibold">
            {t("method.title")}
          </summary>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-500">
            <p>{t("method.formula")}</p>
            <p>{t("method.excluded")}</p>
            <p>
              {t("method.updated", {
                date: new Date(answers.updated_at).toLocaleDateString(locale),
              })}
            </p>
            <p>{t("method.disclaimer")}</p>
          </div>
        </details>
        <div className="rounded-3xl border bg-white p-6 dark:bg-white/[.04]">
          <h2 className="font-semibold">{t("save.title")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t("save.description")}
          </p>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={onDownload}>
              <Download />
              {t("actions.download")}
            </Button>
            {isAuthenticated ? (
              <Button onClick={onSave} disabled={saving || saved}>
                {saved
                  ? t("save.saved")
                  : saving
                    ? t("save.saving")
                    : t("save.button")}
              </Button>
            ) : (
              <Button asChild>
                <Link
                  href="/auth/sign-up?next=/finance/cushion"
                  onClick={() =>
                    trackRunwayEvent("registration_clicked", "result")
                  }
                >
                  <Users />
                  {t("save.createAccount")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-slate-400">
        {t("method.disclaimer")}
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-white/50">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums sm:text-base">
        {value}
      </p>
    </div>
  );
}
function Breakdown({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ComparisonCard({
  label,
  simulation,
  help,
  emphasized,
  t,
}: {
  label: string;
  simulation: RunwaySimulation;
  help?: string;
  emphasized?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const value = simulation.sustainable
    ? t("comparison.sustainable")
    : simulation.depletion_date
      ? t("comparison.months", {
          months: simulation.months_covered?.toFixed(1) ?? "—",
        })
      : t("comparison.over", { months: simulation.months_covered ?? 120 });
  return (
    <div
      className={`rounded-2xl border p-5 ${emphasized ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : "border-slate-200 dark:border-white/10"}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      {help ? (
        <p className="mt-2 text-xs leading-5 text-slate-400">{help}</p>
      ) : null}
    </div>
  );
}
function getAttribution() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    video: params.get("video") ?? undefined,
    campaign: params.get("campaign") ?? undefined,
    cta: params.get("cta") ?? undefined,
    landing_variant: params.get("variant") ?? undefined,
    language: document.documentElement.lang,
  };
}

function trackRunwayEvent(
  eventName:
    | "started"
    | "skipped"
    | "completed"
    | "result_interaction"
    | "registration_clicked",
  stepId?: string,
) {
  if (typeof window === "undefined") return;
  let sessionId = window.localStorage.getItem(RUNWAY_ANALYTICS_SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.localStorage.setItem(RUNWAY_ANALYTICS_SESSION_KEY, sessionId);
  }
  void fetch("/api/finance/cushion/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      action_id: crypto.randomUUID(),
      session_id: sessionId,
      event_name: eventName,
      step_id: stepId,
      locale: document.documentElement.lang,
      attribution: getAttribution(),
    }),
  }).catch(() => undefined);
}
