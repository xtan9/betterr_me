"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LockKeyhole,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { HouseholdRunwayLanding } from "@/components/finance/household-runway-landing";
import { MoneyField } from "@/components/finance/runway-money-field";
import { ResultExperience } from "@/components/finance/household-runway-result";
import {
  EXPENSE_CATEGORIES,
  RUNWAY_MODEL_VERSION,
  RUNWAY_STEP_IDS,
  availableScenarios,
  createDefaultRunwayAnswers,
  currencyForCountry,
  estimateMonthlyTakeHome,
  expenseCategoryTotals,
  expenseTotals,
  formatCents,
  highestLeverageActions,
  monthlyIncomeTotal,
  applyExpenseReduction,
  simulateHouseholdRunway,
  withCurrentLifestyleExpenses,
  type EmploymentStatus,
  type ExpenseCategory,
  type ExpenseFrequency,
  type ExpenseLineItem,
  type HouseholdRunwayAnswers,
  type IncomeAnswer,
  type InputConfidence,
  type MoneyAnswer,
  type RecurringIncomeSource,
  type RecurringIncomeType,
  type RunwayAdjustments,
  type RunwayCountry,
  type RunwayScenario,
  type RunwaySnapshotSummary,
  type RunwayStepId,
} from "@/lib/finance/cushion";
import {
  EXPENSE_ITEM_TYPES,
  type ExpenseItemType,
} from "@/lib/finance/runway-expenses";
import {
  clearRunwayDraft,
  persistRunwayDraft,
  readRunwayDraft,
} from "@/lib/finance/runway-draft-client";
import {
  runwayAttribution,
  trackRunwayEvent,
} from "@/lib/finance/runway-analytics-client";
import {
  RUNWAY_REGIONS,
  normalizeRunwayLocale,
  runwayRegionLabel,
} from "@/lib/finance/runway-regions";

const OPTIONAL_STEPS = new Set<RunwayStepId>([
  "otherIncome",
  "assets",
]);
const EMPTY_ADJUSTMENTS: RunwayAdjustments = {
  expense_reduction_cents: 0,
  added_cash_cents: 0,
  added_monthly_income_cents: 0,
  expected_unconfirmed_funds_cents: 0,
  usable_illiquid_investments_cents: 0,
  usable_retirement_tax_deferred_cents: 0,
  usable_retirement_tax_free_cents: 0,
};
const RUNWAY_IMPORT_ACTION_KEY = "betterr.household-runway.import-action";

const OTHER_INCOME_TYPES: Exclude<RecurringIncomeType, "other">[] = [
  "rental_net",
  "side_business",
  "dividends_interest",
  "support",
  "pension_benefits",
];

const ASSET_KEYS = [
  "liquid_investments",
  "illiquid_investments",
  "home_equity",
  "retirement_tax_deferred",
  "retirement_tax_free",
] as const;
type AssetKey = (typeof ASSET_KEYS)[number];

interface HouseholdRunwayProps {
  initialAnswers: HouseholdRunwayAnswers | null;
  isAuthenticated: boolean;
  hasSavedPlan: boolean;
  initialSnapshots: RunwaySnapshotSummary[];
}

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
}

function employmentIncome(
  status: EmploymentStatus,
  existing?: IncomeAnswer,
): IncomeAnswer {
  const notWorking = status === "unemployed" || status === "not_working";
  return {
    employment: status,
    monthly_take_home_cents: notWorking
      ? 0
      : (existing?.monthly_take_home_cents ?? 0),
    estimated_monthly_take_home_cents: notWorking
      ? 0
      : (existing?.estimated_monthly_take_home_cents ?? 0),
    entered_amount_cents: notWorking
      ? 0
      : (existing?.entered_amount_cents ?? 0),
    entered_period: existing?.entered_period ?? "annual",
    entered_as: existing?.entered_as ?? "gross",
    gross_amount_cents: existing?.gross_amount_cents ?? 0,
    gross_period: existing?.gross_period ?? "annual",
    net_amount_cents: existing?.net_amount_cents ?? 0,
    net_period: existing?.net_period ?? "monthly",
    tax_filing_status: existing?.tax_filing_status ?? "single",
    annual_other_deductions_cents: existing?.annual_other_deductions_cents ?? 0,
    take_home_source: existing?.take_home_source ?? "estimated",
    confidence: notWorking ? "confirmed" : (existing?.confidence ?? "estimated"),
    estimate_rule_version: existing?.estimate_rule_version,
  };
}

export function HouseholdRunway({
  initialAnswers,
  isAuthenticated,
  hasSavedPlan,
  initialSnapshots,
}: HouseholdRunwayProps) {
  const t = useTranslations("householdRunway");
  const locale = useLocale();
  const [answers, setAnswers] = useState<HouseholdRunwayAnswers>(
    () => initialAnswers ?? createDefaultRunwayAnswers(),
  );
  const [stepId, setStepId] = useState<RunwayStepId>(
    initialAnswers ? "result" : "location",
  );
  const [completed, setCompleted] = useState(Boolean(initialAnswers));
  const [hydrated, setHydrated] = useState(false);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [planExists, setPlanExists] = useState(hasSavedPlan);
  const [draftSynced, setDraftSynced] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(isAuthenticated);
  const [error, setError] = useState("");
  const [activeExpenseCategory, setActiveExpenseCategory] =
    useState<ExpenseCategory | null>(null);
  const [scenario, setScenario] = useState<RunwayScenario>(() =>
    initialAnswers ? availableScenarios(initialAnswers)[0].id : "mine_stops",
  );
  const [adjustments, setAdjustments] = useState<RunwayAdjustments>(() => ({
    ...EMPTY_ADJUSTMENTS,
    usable_illiquid_investments_cents:
      initialAnswers?.extreme_access.illiquid_investments_cents ?? 0,
    usable_retirement_tax_deferred_cents:
      initialAnswers?.extreme_access.retirement_tax_deferred_cents ?? 0,
    usable_retirement_tax_free_cents:
      initialAnswers?.extreme_access.retirement_tax_free_cents ?? 0,
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(hasSavedPlan);
  const landingTracked = useRef(false);

  useEffect(() => {
    let hydrationFrame: number | null = null;
    const syncUrlMode = () => {
      const started = new URLSearchParams(window.location.search).get("start") === "1";
      setInterviewStarted(isAuthenticated || started);
    };
    const draft = readRunwayDraft();
    if (draft && !initialAnswers) {
      setAnswers(draft.answers);
      setStepId(draft.step_id);
      setCompleted(draft.completed);
      setScenario(availableScenarios(draft.answers)[0].id);
      setHasLocalDraft(true);
      setAdjustments((current) => ({
        ...current,
        usable_illiquid_investments_cents:
          draft.answers.extreme_access.illiquid_investments_cents,
        usable_retirement_tax_deferred_cents:
          draft.answers.extreme_access.retirement_tax_deferred_cents,
        usable_retirement_tax_free_cents:
          draft.answers.extreme_access.retirement_tax_free_cents,
      }));
    }
    syncUrlMode();
    window.addEventListener("popstate", syncUrlMode);
    if (draft) {
      // Commit restored answers before enabling autosave so a locale reload
      // can never overwrite the draft with the component defaults.
      hydrationFrame = window.requestAnimationFrame(() => setHydrated(true));
    } else {
      setHydrated(true);
    }
    return () => {
      window.removeEventListener("popstate", syncUrlMode);
      if (hydrationFrame !== null) window.cancelAnimationFrame(hydrationFrame);
    };
  }, [initialAnswers, isAuthenticated]);

  useEffect(() => {
    if (draftSynced || !hydrated || (!interviewStarted && !hasLocalDraft)) return;
    persistRunwayDraft(answers, stepId, completed);
    setHasLocalDraft(true);
  }, [answers, completed, draftSynced, hasLocalDraft, hydrated, interviewStarted, stepId]);

  useEffect(() => {
    const flushDraft = () => {
      if (draftSynced || (!interviewStarted && !hasLocalDraft)) return;
      persistRunwayDraft(answers, stepId, completed);
    };
    window.addEventListener("betterr:before-locale-change", flushDraft);
    return () =>
      window.removeEventListener("betterr:before-locale-change", flushDraft);
  }, [answers, completed, draftSynced, hasLocalDraft, interviewStarted, stepId]);

  const showLanding = hydrated && !isAuthenticated && !interviewStarted;
  useEffect(() => {
    if (showLanding && !landingTracked.current) {
      landingTracked.current = true;
      trackRunwayEvent("landing_view", "landing");
    }
  }, [showLanding]);

  useEffect(() => {
    if (!hydrated || showLanding || stepId === "result") return;
    const heading = document.getElementById("runway-question-heading");
    heading?.focus({ preventScroll: true });
  }, [hydrated, showLanding, stepId]);

  const scenarios = useMemo(() => availableScenarios(answers), [answers]);
  const baseline = useMemo(
    () => simulateHouseholdRunway(answers, scenario),
    [answers, scenario],
  );
  const preview = useMemo(
    () => simulateHouseholdRunway(answers, scenario, adjustments),
    [adjustments, answers, scenario],
  );
  const currentLifestyle = useMemo(
    () => simulateHouseholdRunway(withCurrentLifestyleExpenses(answers), scenario),
    [answers, scenario],
  );
  const extreme = useMemo(
    () =>
      simulateHouseholdRunway(answers, scenario, {
        usable_illiquid_investments_cents:
          answers.extreme_access.illiquid_investments_cents,
        usable_retirement_tax_deferred_cents:
          answers.extreme_access.retirement_tax_deferred_cents,
        usable_retirement_tax_free_cents:
          answers.extreme_access.retirement_tax_free_cents,
      }),
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

  const update = (patch: Partial<HouseholdRunwayAnswers>) => {
    setSaved(false);
    setDraftSynced(false);
    setAnswers((current) => {
      const next = {
        ...current,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      if (typeof window !== "undefined" && interviewStarted) {
        persistRunwayDraft(next, stepId, completed);
      }
      return next;
    });
  };

  const updateIncome = (
    person: "mine" | "partner",
    patch: Partial<IncomeAnswer>,
  ) => {
    setSaved(false);
    setDraftSynced(false);
    setAnswers((current) => {
      const base =
        person === "mine"
          ? current.mine
          : (current.partner ?? employmentIncome("employed"));
      const next = { ...base, ...patch };
      next.entered_amount_cents = next.entered_as === "gross" ? next.gross_amount_cents : next.net_amount_cents;
      next.entered_period = next.entered_as === "gross" ? next.gross_period : next.net_period;
      if (next.entered_as === "gross" && next.gross_amount_cents > 0) {
        const estimate = estimateMonthlyTakeHome({
          country: current.country,
          region: current.region,
          amountCents: next.gross_amount_cents,
          period: next.gross_period,
          filingStatus: next.tax_filing_status,
          selfEmployed: next.employment === "self_employed",
          annualOtherDeductionsCents: next.annual_other_deductions_cents,
        });
        next.estimated_monthly_take_home_cents = estimate.monthly_take_home_cents;
        next.estimate_rule_version = estimate.rule_version;
        if (patch.take_home_source !== "user_confirmed" && patch.monthly_take_home_cents === undefined) {
          next.monthly_take_home_cents = estimate.monthly_take_home_cents;
          next.take_home_source = "estimated";
          next.confidence = "estimated";
        }
      } else if (next.entered_as === "net") {
        next.monthly_take_home_cents =
          next.net_period === "annual"
            ? Math.round(next.net_amount_cents / 12)
            : next.net_amount_cents;
        next.estimated_monthly_take_home_cents = 0;
        next.take_home_source = "user_confirmed";
        next.confidence = "confirmed";
        delete next.estimate_rule_version;
      }
      const updated = {
        ...current,
        [person]: next,
        updated_at: new Date().toISOString(),
      };
      if (typeof window !== "undefined" && interviewStarted) {
        persistRunwayDraft(updated, stepId, completed);
      }
      return updated;
    });
  };

  const startInterview = (fresh = false) => {
    if (fresh) {
      const reset = createDefaultRunwayAnswers();
      setAnswers(reset);
      setStepId("location");
      setCompleted(false);
      setHasLocalDraft(false);
      setDraftSynced(false);
      setAdjustments({ ...EMPTY_ADJUSTMENTS });
      clearRunwayDraft();
      window.localStorage.removeItem(RUNWAY_IMPORT_ACTION_KEY);
    }
    const params = new URLSearchParams(window.location.search);
    params.set("start", "1");
    window.history.pushState({}, "", `${window.location.pathname}?${params}`);
    setInterviewStarted(true);
    trackRunwayEvent("started", fresh ? "new" : hasLocalDraft ? "resume" : "new");
  };

  const confirmStartOver = () => {
    if (window.confirm(t("landing.startOverConfirm"))) startInterview(true);
  };

  const clearDraft = () => {
    if (!window.confirm(t("actions.clearConfirm"))) return;
    clearRunwayDraft();
    window.localStorage.removeItem(RUNWAY_IMPORT_ACTION_KEY);
    const reset = createDefaultRunwayAnswers();
    setAnswers(reset);
    setStepId("location");
    setCompleted(false);
    setSaved(false);
    setHasLocalDraft(false);
    setAdjustments({ ...EMPTY_ADJUSTMENTS });
    if (!isAuthenticated) {
      const params = new URLSearchParams(window.location.search);
      params.delete("start");
      const query = params.toString();
      window.history.pushState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
      setInterviewStarted(false);
    }
  };

  const adjacentStep = (current: RunwayStepId, direction: 1 | -1) => {
    let index = RUNWAY_STEP_IDS.indexOf(current) + direction;
    while (index > 0 && index < RUNWAY_STEP_IDS.length - 1) {
      const candidate = RUNWAY_STEP_IDS[index];
      const skipMine =
        candidate === "myIncome" &&
        ["unemployed", "not_working"].includes(answers.mine.employment);
      const skipPartner =
        candidate === "partnerIncome" &&
        (!answers.partner ||
          ["unemployed", "not_working"].includes(answers.partner.employment));
      if (!skipMine && !skipPartner) break;
      index += direction;
    }
    return RUNWAY_STEP_IDS[
      Math.max(0, Math.min(RUNWAY_STEP_IDS.length - 1, index))
    ];
  };

  const validateStep = () => {
    if (stepId === "location" && !answers.region) return t("validation.region");
    if (
      stepId === "myIncome" &&
      ["employed", "self_employed"].includes(answers.mine.employment) &&
      answers.mine.monthly_take_home_cents <= 0
    )
      return t("validation.income");
    if (
      stepId === "partnerIncome" &&
      answers.partner &&
      ["employed", "self_employed"].includes(answers.partner.employment) &&
      answers.partner.monthly_take_home_cents <= 0
    )
      return t("validation.income");
    if (stepId === "expenses" && expenseTotals(answers).current <= 0)
      return t("validation.expensesCurrent");
    if (stepId === "reductions" && expenseTotals(answers).interruption <= 0)
      return t("validation.expenses");
    return "";
  };

  const next = () => {
    const issue = validateStep();
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    if (stepId === "review") {
      setCompleted(true);
      setScenario(scenarios[0].id);
      trackRunwayEvent("completed", stepId);
    }
    setStepId(adjacentStep(stepId, 1));
  };

  const skip = () => {
    setError("");
    trackRunwayEvent("skipped", stepId);
    setStepId(adjacentStep(stepId, 1));
  };

  const savePlan = async () => {
    if (!isAuthenticated) return;
    setSaving(true);
    setError("");
    try {
      let actionId = window.localStorage.getItem(RUNWAY_IMPORT_ACTION_KEY);
      if (!actionId) {
        actionId = crypto.randomUUID();
        window.localStorage.setItem(RUNWAY_IMPORT_ACTION_KEY, actionId);
      }
      const response = await fetch("/api/finance/cushion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          status: "completed",
          attribution: runwayAttribution(),
          create_snapshot: true,
          snapshot_action_id: actionId,
          snapshot_trigger: planExists ? "updated" : "imported",
        }),
      });
      if (!response.ok) throw new Error("save failed");
      const payload = (await response.json()) as {
        snapshots?: RunwaySnapshotSummary[];
      };
      if (payload.snapshots) setSnapshots(payload.snapshots);
      clearRunwayDraft();
      setHasLocalDraft(false);
      setDraftSynced(true);
      setPlanExists(true);
      window.localStorage.removeItem(RUNWAY_IMPORT_ACTION_KEY);
      setSaved(true);
    } catch {
      setError(t("save.error"));
    } finally {
      setSaving(false);
    }
  };

  const applyWhatIf = () => {
    setDraftSynced(false);
    setAnswers((current) => {
      const next = {
        ...current,
        available_cash: {
          cents: current.available_cash.cents + adjustments.added_cash_cents,
          confidence: "confirmed" as InputConfidence,
        },
        extreme_access: {
          illiquid_investments_cents:
            adjustments.usable_illiquid_investments_cents,
          retirement_tax_deferred_cents:
            adjustments.usable_retirement_tax_deferred_cents,
          retirement_tax_free_cents:
            adjustments.usable_retirement_tax_free_cents,
        },
        updated_at: new Date().toISOString(),
      };
      if (adjustments.added_monthly_income_cents > 0) {
        next.other_income_sources = [
          ...current.other_income_sources,
          {
            id: newId("what-if-income"),
            type: "other" as const,
            label: t("whatIf.appliedIncome"),
            monthly_cents: adjustments.added_monthly_income_cents,
            confidence: "confirmed" as const,
          },
        ];
      }
      if (adjustments.expense_reduction_cents > 0) {
        Object.assign(next, applyExpenseReduction(next, adjustments.expense_reduction_cents));
      }
      return next;
    });
    setSaved(false);
    setAdjustments({
      ...EMPTY_ADJUSTMENTS,
      usable_illiquid_investments_cents:
        adjustments.usable_illiquid_investments_cents,
      usable_retirement_tax_deferred_cents:
        adjustments.usable_retirement_tax_deferred_cents,
      usable_retirement_tax_free_cents:
        adjustments.usable_retirement_tax_free_cents,
    });
  };

  const download = () => {
    const reportActions = [
      actions.cashGapCents > 0
        ? `${t("actionsPlan.cashTarget", { months: actions.targetMonths })}: ${formatCents(actions.cashGapCents, locale, answers.currency)}`
        : null,
      actions.largestReducibleCategory
        ? `${t("actionsPlan.largest")}: ${t(`expenseCategories.${actions.largestReducibleCategory.category}`)} (${formatCents(actions.largestReducibleCategory.reducible, locale, answers.currency)})`
        : null,
      answers.expense_mode === "quick"
        ? t("precision.expenses")
        : answers.mine.take_home_source === "estimated" ||
            answers.partner?.take_home_source === "estimated"
          ? t("precision.takeHome")
          : t("precision.complete"),
    ].filter(Boolean);
    const content = [
      "BetterR.me Household Runway",
      `Model: ${RUNWAY_MODEL_VERSION}`,
      `Location: ${answers.country} · ${runwayRegionLabel(answers.country, answers.region, locale) ?? answers.region}`,
      `Cash: ${formatCents(answers.available_cash.cents, locale, answers.currency)}`,
      `Liquid investments: ${formatCents(answers.assets.liquid_investments.cents, locale, answers.currency)}`,
      `Continuing monthly income: ${formatCents(monthlyIncomeTotal(answers), locale, answers.currency)}`,
      `Current monthly expenses: ${formatCents(expenseTotals(answers).current, locale, answers.currency)}`,
      `Interruption monthly expenses: ${formatCents(expenseTotals(answers).interruption, locale, answers.currency)}`,
      "",
      "Scenarios",
      ...scenarioResults.map(({ scenario: itemScenario, result }) =>
        `${t(`scenarios.${itemScenario}`)}: ${result.sustainable ? t("comparison.sustainable") : `${(result.months_covered ?? 0).toFixed(1)} ${t("whatIf.months")}`}`,
      ),
      "",
      "Assumptions",
      "Easy-to-withdraw investments are included at 100%.",
      `Excluded assets: ${formatCents(baseline.excluded_assets_cents, locale, answers.currency)}`,
      "What-if changes stay out of the saved baseline until you explicitly apply them.",
      "",
      "Priority actions",
      ...reportActions.slice(0, 3).map((action, index) => `${index + 1}. ${action}`),
      "",
      "Educational scenario estimate only; not tax, investment, legal, eligibility, or financial advice.",
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

  if (!hydrated) {
    return <main className="min-h-screen bg-[#f5f6f2] dark:bg-[#101310]" />;
  }

  return (
    <main className="min-h-screen bg-[#f5f6f2] text-slate-950 dark:bg-[#101310] dark:text-white">
      <RunwayHeader t={t} />
      {showLanding ? (
        <HouseholdRunwayLanding
          t={t}
          hasDraft={hasLocalDraft}
          draftCompleted={completed}
          onPrimary={() => startInterview(false)}
          onStartOver={confirmStartOver}
        />
      ) : stepId === "result" ? (
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
              usable_illiquid_investments_cents:
                answers.extreme_access.illiquid_investments_cents,
              usable_retirement_tax_deferred_cents:
                answers.extreme_access.retirement_tax_deferred_cents,
              usable_retirement_tax_free_cents:
                answers.extreme_access.retirement_tax_free_cents,
            })
          }
          onEdit={() => setStepId("review")}
          onDownload={download}
          isAuthenticated={isAuthenticated}
          saved={saved}
          saving={saving}
          onSave={savePlan}
          error={error}
          snapshots={snapshots}
        />
      ) : (
        <InterviewShell
          t={t}
          stepId={stepId}
          error={error}
          activeExpenseCategory={activeExpenseCategory}
          onBack={() => {
            setError("");
            if (activeExpenseCategory) {
              update({
                completed_expense_categories: Array.from(
                  new Set([
                    ...answers.completed_expense_categories,
                    activeExpenseCategory,
                  ]),
                ),
              });
              setActiveExpenseCategory(null);
            } else if (stepId === "location" && !isAuthenticated) {
              window.history.back();
            } else {
              setStepId(adjacentStep(stepId, -1));
            }
          }}
          onSkip={OPTIONAL_STEPS.has(stepId) ? skip : undefined}
          onContinue={next}
          onClear={clearDraft}
          continueLabel={stepId === "review" ? t("actions.reveal") : t("actions.continue")}
        >
          <StepContent
            step={stepId}
            t={t}
            locale={locale}
            answers={answers}
            update={update}
            updateIncome={updateIncome}
            activeExpenseCategory={activeExpenseCategory}
            setActiveExpenseCategory={setActiveExpenseCategory}
          />
        </InterviewShell>
      )}
    </main>
  );
}

function RunwayHeader({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <header className="border-b border-black/5 bg-[#f5f6f2]/90 backdrop-blur dark:border-white/10 dark:bg-[#101310]/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="font-display text-xl font-bold">
          BetterR<span className="text-emerald-600">.me</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <LockKeyhole className="h-3.5 w-3.5" />
            {t("privacy.local")}
          </div>
          <LanguageSwitcher showLabel />
        </div>
      </div>
    </header>
  );
}

function InterviewShell({
  t,
  stepId,
  error,
  activeExpenseCategory,
  onBack,
  onSkip,
  onContinue,
  onClear,
  continueLabel,
  children,
}: {
  t: ReturnType<typeof useTranslations>;
  stepId: RunwayStepId;
  error: string;
  activeExpenseCategory: ExpenseCategory | null;
  onBack: () => void;
  onSkip?: () => void;
  onContinue: () => void;
  onClear: () => void;
  continueLabel: string;
  children: ReactNode;
}) {
  const index = RUNWAY_STEP_IDS.indexOf(stepId);
  const isCategory = stepId === "expenses" && activeExpenseCategory;
  return (
    <section className="mx-auto min-h-[calc(100vh-65px)] max-w-4xl px-5 py-8 pb-28 sm:py-10">
      <div className="mb-5 flex items-center justify-between text-xs text-slate-400">
        <span>{isCategory ? t(`expenseCategories.${activeExpenseCategory}`) : t(`steps.${stepId}.eyebrow`)}</span>
        <span>
          {t("progress.remaining", {
            minutes: Math.max(1, Math.ceil((RUNWAY_STEP_IDS.length - index - 2) * 0.2)),
          })}
        </span>
      </div>
      <div className="grid min-h-[620px] grid-rows-[1fr_auto] rounded-3xl border border-black/5 bg-white shadow-[0_24px_80px_-45px_rgba(15,23,42,.4)] dark:border-white/10 dark:bg-white/[.04] sm:h-[680px]">
        <div className="p-6 sm:p-10">{children}</div>
        <div>
          {error ? (
            <p role="alert" className="mx-6 mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300 sm:mx-10">
              {error}
            </p>
          ) : null}
          {typeof document !== "undefined" ? createPortal(<div className="fixed inset-x-0 bottom-0 z-[1000] mx-auto flex min-h-20 w-full max-w-4xl isolate items-center justify-between gap-3 border-t bg-white/95 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_30px_-24px_rgba(15,23,42,.45)] backdrop-blur dark:border-white/10 dark:bg-[#171a17]/95 sm:rounded-t-2xl sm:px-10">
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft />
              {t("actions.back")}
            </Button>
            <div className="flex items-center gap-2">
              {!isCategory && onSkip ? (
                <Button variant="ghost" onClick={onSkip}>
                  {t("actions.skip")}
                </Button>
              ) : null}
              {isCategory ? (
                <Button onClick={onBack}>
                  <Check />
                  {t("expenses.saveCategory")}
                </Button>
              ) : (
                <Button onClick={onContinue}>
                  {continueLabel}
                  <ArrowRight />
                </Button>
              )}
            </div>
          </div>, document.body) : null}
        </div>
      </div>
      <button
        onClick={onClear}
        className="mx-auto mt-5 flex items-center gap-2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {t("actions.clear")}
      </button>
    </section>
  );
}

function StepTitle({
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

function StepContent({
  step,
  t,
  locale,
  answers,
  update,
  updateIncome,
  activeExpenseCategory,
  setActiveExpenseCategory,
}: {
  step: RunwayStepId;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  answers: HouseholdRunwayAnswers;
  update: (patch: Partial<HouseholdRunwayAnswers>) => void;
  updateIncome: (person: "mine" | "partner", patch: Partial<IncomeAnswer>) => void;
  activeExpenseCategory: ExpenseCategory | null;
  setActiveExpenseCategory: (category: ExpenseCategory | null) => void;
}) {
  const title = <StepTitle step={step} t={t} />;
  if (step === "location") {
    const regionLocale = normalizeRunwayLocale(locale);
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
                update({
                  country,
                  region: country === answers.country ? answers.region : "",
                  currency: currencyForCountry(country),
                })
              }
            />
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-medium">{t("fields.region")}</span>
            <select
              aria-label={t("fields.region")}
              className="h-12 w-full rounded-xl border bg-transparent px-3"
              value={answers.region}
              onChange={(event) => update({ region: event.target.value })}
            >
              <option value="">{t("fields.selectRegion")}</option>
              {RUNWAY_REGIONS[answers.country].map((region) => (
                <option key={region.code} value={region.code}>
                  {region.labels[regionLocale]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-medium">{t("fields.currency")}</span>
            <select
              className="h-12 w-full rounded-xl border bg-transparent px-3"
              value={answers.currency}
              onChange={(event) =>
                update({ currency: event.target.value as HouseholdRunwayAnswers["currency"] })
              }
            >
              {(["USD", "CAD", "CNY", "TWD"] as const).map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </label>
        </div>
      </>
    );
  }
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
          <CheckCard
            checked={answers.has_children}
            label={t("household.children")}
            onChange={(checked) => update({ has_children: checked })}
          />
          <CheckCard
            checked={answers.has_support_obligations}
            label={t("household.support")}
            onChange={(checked) => update({ has_support_obligations: checked })}
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
          onChange={(employment) => update({ mine: employmentIncome(employment, answers.mine) })}
        />
        {answers.shares_finances && answers.partner ? (
          <EmploymentPicker
            t={t}
            label={t("employment.partner")}
            value={answers.partner.employment}
            onChange={(employment) =>
              update({ partner: employmentIncome(employment, answers.partner ?? undefined) })
            }
          />
        ) : null}
      </>
    );
  if (step === "myIncome")
    return (
      <>
        {title}
        <IncomeEditor t={t} locale={locale} answers={answers} income={answers.mine} onChange={(patch) => updateIncome("mine", patch)} />
      </>
    );
  if (step === "partnerIncome")
    return (
      <>
        {title}
        {answers.partner ? (
          <IncomeEditor t={t} locale={locale} answers={answers} income={answers.partner} onChange={(patch) => updateIncome("partner", patch)} />
        ) : (
          <InfoBox>{t("income.noPartner")}</InfoBox>
        )}
      </>
    );
  if (step === "otherIncome")
    return (
      <OtherIncomeStep title={title} t={t} locale={locale} answers={answers} update={update} />
    );
  if (step === "cash")
    return (
      <>
        {title}
        <div className="mt-7 max-w-md">
          <MoneyField
            label={t("fields.availableCash")}
            currency={answers.currency}
            value={answers.available_cash.cents}
            help={t("fields.availableCashHelp")}
            onChange={(value) => update({ available_cash: { cents: value, confidence: "confirmed" } })}
          />
        </div>
      </>
    );
  if (step === "assets")
    return <AssetsStep title={title} t={t} answers={answers} update={update} />;
  if (step === "expenses")
    return activeExpenseCategory ? (
      <ExpenseCategoryEditor category={activeExpenseCategory} t={t} answers={answers} update={update} />
    ) : (
      <ExpenseHub title={title} t={t} locale={locale} answers={answers} update={update} onOpen={setActiveExpenseCategory} />
    );
  if (step === "reductions")
    return <ReductionStep title={title} t={t} locale={locale} answers={answers} update={update} />;
  if (step === "review")
    return <ReviewStep title={title} t={t} locale={locale} answers={answers} />;
  return null;
}

function OtherIncomeStep({
  title,
  t,
  locale,
  answers,
  update,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  answers: HouseholdRunwayAnswers;
  update: (patch: Partial<HouseholdRunwayAnswers>) => void;
}) {
  const setSource = (type: RecurringIncomeType, enabled: boolean) => {
    const existing = answers.other_income_sources.find((source) => source.type === type);
    update({
      other_income_sources: enabled
        ? existing
          ? answers.other_income_sources
          : [...answers.other_income_sources, { id: newId(type), type, monthly_cents: 0, confidence: "confirmed" }]
        : answers.other_income_sources.filter((source) => source.id !== existing?.id),
    });
  };
  const updateSource = (id: string, patch: Partial<RecurringIncomeSource>) =>
    update({ other_income_sources: answers.other_income_sources.map((source) => source.id === id ? { ...source, ...patch } : source) });
  return (
    <>
      {title}
      <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
        {t("otherIncome.continuingOnly")}
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {OTHER_INCOME_TYPES.map((type) => {
          const source = answers.other_income_sources.find((item) => item.type === type);
          return (
            <ToggleMoneyCard
              key={type}
              title={t(`otherIncome.types.${type}`)}
              description={t(`otherIncome.help.${type}`)}
              enabled={Boolean(source)}
              currency={answers.currency}
              value={source?.monthly_cents ?? 0}
              onEnabled={(enabled) => setSource(type, enabled)}
              onChange={(value) => source && updateSource(source.id, { monthly_cents: value, confidence: "confirmed" })}
            />
          );
        })}
      </div>
      <div className="mt-5 space-y-3">
        {answers.other_income_sources.filter((source) => source.type === "other").map((source) => (
          <div key={source.id} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_auto]">
            <label>
              <span className="mb-1 block text-xs text-slate-500">{t("otherIncome.customLabel")}</span>
              <input className="h-11 w-full rounded-xl border bg-transparent px-3" value={source.label ?? ""} onChange={(event) => updateSource(source.id, { label: event.target.value })} />
            </label>
            <MoneyField label={t("otherIncome.monthlyAmount")} currency={answers.currency} value={source.monthly_cents} onChange={(value) => updateSource(source.id, { monthly_cents: value, confidence: "confirmed" })} />
            <Button variant="ghost" size="icon" aria-label={t("otherIncome.remove")} onClick={() => update({ other_income_sources: answers.other_income_sources.filter((item) => item.id !== source.id) })}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => update({ other_income_sources: [...answers.other_income_sources, { id: newId("other-income"), type: "other", label: "", monthly_cents: 0, confidence: "confirmed" }] })}>
          <Plus />
          {t("otherIncome.addOther")}
        </Button>
      </div>
      <p className="mt-6 font-medium">{t("otherIncome.total", { amount: formatCents(monthlyIncomeTotal(answers), locale, answers.currency) })}</p>
    </>
  );
}

function AssetsStep({
  title,
  t,
  answers,
  update,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  answers: HouseholdRunwayAnswers;
  update: (patch: Partial<HouseholdRunwayAnswers>) => void;
}) {
  const updateAsset = (key: AssetKey, value: MoneyAnswer) =>
    update({ assets: { ...answers.assets, [key]: value } });
  return (
    <>
      {title}
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {ASSET_KEYS.map((key) => {
          const asset = answers.assets[key];
          return (
            <ToggleMoneyCard
              key={key}
              title={t(`assets.${key}.title`)}
              description={t(`assets.${key}.description`, { country: t(`countries.${answers.country}`) })}
              badge={t(`assets.${key}.${key === "liquid_investments" ? "included" : "excluded"}`)}
              enabled={asset.confidence !== "skipped"}
              currency={answers.currency}
              value={asset.cents}
              onEnabled={(enabled) => updateAsset(key, { cents: enabled ? asset.cents : 0, confidence: enabled ? "confirmed" : "skipped" })}
              onChange={(value) => updateAsset(key, { cents: value, confidence: "confirmed" })}
            />
          );
        })}
      </div>
    </>
  );
}

function ExpenseHub({
  title,
  t,
  locale,
  answers,
  update,
  onOpen,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  answers: HouseholdRunwayAnswers;
  update: (patch: Partial<HouseholdRunwayAnswers>) => void;
  onOpen: (category: ExpenseCategory) => void;
}) {
  const totals = expenseTotals(answers);
  if (answers.expense_mode === "quick")
    return (
      <>
        {title}
        <button className="mt-4 text-sm font-semibold text-emerald-700 underline" onClick={() => update({ expense_mode: "guided" })}>
          {t("expenses.useGuided")}
        </button>
        <div className="mt-7 max-w-md">
          <MoneyField label={t("expenses.currentTotal")} currency={answers.currency} value={answers.quick_expenses.current_monthly_cents} onChange={(value) => update({ quick_expenses: { ...answers.quick_expenses, current_monthly_cents: value, interruption_monthly_cents: answers.quick_expenses.interruption_monthly_cents || value, confidence: "confirmed" } })} />
        </div>
      </>
    );
  return (
    <>
      {title}
      <div className="mt-6 rounded-2xl border bg-slate-50 p-4 dark:bg-white/5">
        <MoneyField label={t("expenses.currentTotal")} currency={answers.currency} value={totals.current} help={t("expenses.totalSwitchHelp")} onChange={(value) => update({ expense_mode: "quick", quick_expenses: { ...answers.quick_expenses, current_monthly_cents: value, interruption_monthly_cents: answers.quick_expenses.interruption_monthly_cents || value, confidence: "confirmed" } })} />
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-sm font-medium">{t("expenses.runningTotal", { amount: formatCents(totals.current, locale, answers.currency) })}</p>
        <button className="text-sm font-semibold text-emerald-700 underline" onClick={() => update({ expense_mode: "quick" })}>
          {t("expenses.useTotals")}
        </button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {EXPENSE_CATEGORIES.map((category) => {
          const subtotal = expenseCategoryTotals(answers, category).current;
          const complete = answers.completed_expense_categories.includes(category);
          return (
            <button key={category} onClick={() => onOpen(category)} className="flex min-h-24 items-center justify-between gap-4 rounded-2xl border p-4 text-left transition hover:border-emerald-400">
              <div>
                <p className="font-semibold">{t(`expenseCategories.${category}`)}</p>
                <p className="mt-1 text-xs text-slate-500">{complete ? t("expenses.complete") : t("expenses.notStarted")}</p>
              </div>
              <span className="font-medium">{formatCents(subtotal, locale, answers.currency)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function ExpenseCategoryEditor({
  category,
  t,
  answers,
  update,
}: {
  category: ExpenseCategory;
  t: ReturnType<typeof useTranslations>;
  answers: HouseholdRunwayAnswers;
  update: (patch: Partial<HouseholdRunwayAnswers>) => void;
}) {
  const subtotal = answers.expense_category_subtotals[category] ?? { current_monthly_cents: 0, interruption_monthly_cents: 0, confidence: "skipped" as const };
  const updateSubtotal = (patch: Partial<typeof subtotal>) => update({
    expense_category_subtotals: { ...answers.expense_category_subtotals, [category]: { ...subtotal, ...patch, confidence: "confirmed" } },
    expense_category_modes: { ...answers.expense_category_modes, [category]: "subtotal" },
    completed_expense_categories: Array.from(new Set([...answers.completed_expense_categories, category])),
  });
  const housingTypes: ExpenseItemType[] =
    answers.housing_tenure === "own"
      ? ["mortgage", "property_tax", "homeowners_insurance", "hoa", "home_maintenance"]
      : answers.housing_tenure === "rent"
        ? ["rent", "renters_insurance", "building_parking"]
        : ["other_housing"];
  const types: readonly ExpenseItemType[] = category === "housing" ? housingTypes : EXPENSE_ITEM_TYPES[category];
  const updateItem = (type: ExpenseItemType, patch: Partial<ExpenseLineItem>) => {
    const existing = answers.expense_items.find((item) => item.category === category && item.type === type);
    const item: ExpenseLineItem = existing ?? {
      id: newId(`expense-${type}`),
      category,
      type,
      current_amount_cents: 0,
      interruption_amount_cents: 0,
      frequency: "monthly",
      confidence: "confirmed",
    };
    const next = { ...item, ...patch };
    if (!existing && patch.current_amount_cents !== undefined)
      next.interruption_amount_cents = patch.current_amount_cents;
    update({
      expense_items: existing
        ? answers.expense_items.map((candidate) => candidate.id === existing.id ? next : candidate)
        : [...answers.expense_items, next],
      completed_expense_categories: Array.from(new Set([...answers.completed_expense_categories, category])),
    });
  };
  return (
    <>
      <h1 id="runway-question-heading" tabIndex={-1} className="font-display text-3xl font-semibold tracking-[-.035em] outline-none sm:text-4xl">
        {t(`expenseCategories.${category}`)}
      </h1>
      <p className="mt-3 text-slate-500">{t(`expenses.categoryHelp.${category}`)}</p>
      <div className="mt-6 rounded-2xl border p-4">
        <MoneyField label={t("expenses.categoryTotal")} currency={answers.currency} value={subtotal.current_monthly_cents} onChange={(value) => updateSubtotal({ current_monthly_cents: value, interruption_monthly_cents: subtotal.interruption_monthly_cents || value })} />
        <details className="mt-4 max-h-[55vh] overflow-auto rounded-xl border p-3" onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) update({ expense_category_modes: { ...answers.expense_category_modes, [category]: "itemized" } }); }}>
          <summary className="cursor-pointer font-semibold">{t("expenses.itemizeInstead")}</summary>
      {category === "housing" ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {(["rent", "own", "other"] as const).map((tenure) => (
            <ChoiceCard key={tenure} selected={answers.housing_tenure === tenure} title={t(`expenses.tenure.${tenure}`)} onClick={() => update({ housing_tenure: tenure, expense_items: answers.expense_items.filter((item) => item.category !== "housing"), completed_expense_categories: answers.completed_expense_categories.filter((item) => item !== "housing") })} />
          ))}
        </div>
      ) : null}
      {category === "housing" && answers.housing_tenure === "own" ? (
        <InfoBox>{t("expenses.escrowWarning")}</InfoBox>
      ) : null}
      {category !== "housing" || answers.housing_tenure ? (
        <div className="mt-6 space-y-4">
          {types.map((type) => {
            const item = answers.expense_items.find((candidate) => candidate.category === category && candidate.type === type);
            return (
              <div key={type} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_170px]">
                <MoneyField label={t(`expenseItems.${type}`)} currency={answers.currency} value={item?.current_amount_cents ?? 0} onChange={(value) => updateItem(type, { current_amount_cents: value, confidence: "confirmed" })} />
                <label>
                  <span className="mb-2 block text-sm font-medium">{t("expenses.frequency")}</span>
                  <select aria-label={`${t(`expenseItems.${type}`)} · ${t("expenses.frequency")}`} className="h-12 w-full rounded-xl border bg-transparent px-3" value={item?.frequency ?? "monthly"} onChange={(event) => updateItem(type, { frequency: event.target.value as ExpenseFrequency })}>
                    {(["monthly", "quarterly", "annual"] as const).map((frequency) => <option key={frequency} value={frequency}>{t(`expenses.frequencies.${frequency}`)}</option>)}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      ) : null}
        </details>
      </div>
    </>
  );
}

function ReductionStep({
  title,
  t,
  locale,
  answers,
  update,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  answers: HouseholdRunwayAnswers;
  update: (patch: Partial<HouseholdRunwayAnswers>) => void;
}) {
  const totals = expenseTotals(answers);
  return (
    <>
      {title}
      <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 dark:bg-white/5">
        <SummaryValue label={t("expenses.currentTotal")} value={formatCents(totals.current, locale, answers.currency)} />
        <SummaryValue label={t("expenses.afterInterruption")} value={formatCents(totals.interruption, locale, answers.currency)} />
      </div>
      <div className="mt-5 space-y-3">
        {answers.expense_mode === "quick" ? <div className="rounded-2xl border p-4"><MoneyField label={t("expenses.afterInterruption")} currency={answers.currency} value={answers.quick_expenses.interruption_monthly_cents || answers.quick_expenses.current_monthly_cents} onChange={(value) => update({ quick_expenses: { ...answers.quick_expenses, interruption_monthly_cents: Math.min(value, answers.quick_expenses.current_monthly_cents), confidence: "confirmed" } })} /></div> : null}
        {answers.expense_mode === "guided" ? EXPENSE_CATEGORIES.filter((category) => answers.expense_category_modes[category] === "subtotal" && (answers.expense_category_subtotals[category]?.current_monthly_cents ?? 0) > 0).map((category) => { const subtotal = answers.expense_category_subtotals[category]!; return <div key={category} className="grid items-end gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_220px]"><div><p className="font-medium">{t(`expenseCategories.${category}`)}</p><p className="mt-1 text-xs text-slate-500">{formatCents(subtotal.current_monthly_cents, locale, answers.currency)}</p></div><MoneyField label={t("expenses.afterInterruption")} currency={answers.currency} value={subtotal.interruption_monthly_cents} onChange={(value) => update({ expense_category_subtotals: { ...answers.expense_category_subtotals, [category]: { ...subtotal, interruption_monthly_cents: Math.min(value, subtotal.current_monthly_cents) } } })} /></div>; }) : null}
        {answers.expense_items.filter((item) => answers.expense_category_modes[item.category] === "itemized" && item.current_amount_cents > 0).map((item) => (
          <div key={item.id} className="grid items-end gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_220px]">
            <div>
              <p className="font-medium">{t(`expenseItems.${item.type}`)}</p>
              <p className="mt-1 text-xs text-slate-500">{t("expenses.currentEntered", { amount: formatCents(item.current_amount_cents, locale, answers.currency), frequency: t(`expenses.frequencies.${item.frequency}`) })}</p>
            </div>
            <MoneyField label={t("expenses.afterInterruption")} currency={answers.currency} value={item.interruption_amount_cents} onChange={(value) => update({ expense_items: answers.expense_items.map((candidate) => candidate.id === item.id ? { ...candidate, interruption_amount_cents: Math.min(value, candidate.current_amount_cents) } : candidate) })} />
          </div>
        ))}
      </div>
    </>
  );
}

function ReviewStep({
  title,
  t,
  locale,
  answers,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  answers: HouseholdRunwayAnswers;
}) {
  const totals = expenseTotals(answers);
  const excluded = answers.assets.illiquid_investments.cents + answers.assets.home_equity.cents + answers.assets.retirement_tax_deferred.cents + answers.assets.retirement_tax_free.cents;
  return (
    <>
      {title}
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <ReviewRow label={t("review.location")} value={`${t(`countries.${answers.country}`)} · ${runwayRegionLabel(answers.country, answers.region, locale) ?? t("confidence.needs_review")} · ${answers.currency}`} status={answers.region ? "confirmed" : "needs_review"} t={t} />
        <ReviewRow label={t("review.household")} value={t(answers.partner ? "review.twoAdults" : "review.oneAdult")} status="confirmed" t={t} />
        <ReviewRow label={t("review.cash")} value={formatCents(answers.available_cash.cents, locale, answers.currency)} status={answers.available_cash.confidence} t={t} />
        <ReviewRow label={t("review.expenses")} value={`${formatCents(totals.current, locale, answers.currency)} → ${formatCents(totals.interruption, locale, answers.currency)}`} status={answers.expense_mode === "quick" ? answers.quick_expenses.confidence : "confirmed"} t={t} />
        <ReviewRow label={t("review.income")} value={formatCents(answers.mine.monthly_take_home_cents + (answers.partner?.monthly_take_home_cents ?? 0), locale, answers.currency)} status={answers.mine.confidence === "estimated" || answers.partner?.confidence === "estimated" ? "estimated" : "confirmed"} t={t} />
        <ReviewRow label={t("review.otherIncome")} value={formatCents(monthlyIncomeTotal(answers), locale, answers.currency)} status={answers.other_income_sources.length ? "confirmed" : "skipped"} t={t} />
        <ReviewRow label={t("review.investments")} value={formatCents(answers.assets.liquid_investments.cents, locale, answers.currency)} status={answers.assets.liquid_investments.confidence} t={t} />
        <ReviewRow label={t("review.lastResort")} value={formatCents(excluded, locale, answers.currency)} status={excluded ? "confirmed" : "skipped"} t={t} />
      </div>
    </>
  );
}

function IncomeEditor({
  t,
  locale,
  answers,
  income,
  onChange,
}: {
  t: ReturnType<typeof useTranslations>;
  locale: string;
  answers: HouseholdRunwayAnswers;
  income: IncomeAnswer;
  onChange: (patch: Partial<IncomeAnswer>) => void;
}) {
  if (income.employment === "unemployed" || income.employment === "not_working")
    return <InfoBox>{t("income.notAsked")}</InfoBox>;
  const estimate =
    income.entered_as === "gross" && income.gross_amount_cents > 0
      ? estimateMonthlyTakeHome({ country: answers.country, region: answers.region, amountCents: income.gross_amount_cents, period: income.gross_period, filingStatus: income.tax_filing_status, selfEmployed: income.employment === "self_employed", annualOtherDeductionsCents: income.annual_other_deductions_cents })
      : null;
  return (
    <div className="mt-7">
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <ChoiceCard selected={income.entered_as === "gross"} title={t("income.gross")} onClick={() => income.entered_as !== "gross" && onChange({ entered_as: "gross", take_home_source: "estimated", confidence: "estimated" })} />
        <ChoiceCard selected={income.entered_as === "net"} title={t("income.net")} onClick={() => income.entered_as !== "net" && onChange({ entered_as: "net", take_home_source: "user_confirmed", confidence: "confirmed" })} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <MoneyField label={t("income.amount")} currency={answers.currency} value={income.entered_as === "gross" ? income.gross_amount_cents : income.net_amount_cents} onChange={(value) => onChange(income.entered_as === "gross" ? { gross_amount_cents: value, take_home_source: "estimated" } : { net_amount_cents: value, take_home_source: "user_confirmed" })} />
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
          <p className="mt-2 text-2xl font-semibold">{formatCents(estimate.monthly_take_home_cents, locale, answers.currency)} <span className="text-sm font-normal">/ {t("income.month")}</span></p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant={income.take_home_source === "estimated" ? "default" : "outline"} onClick={() => onChange({ monthly_take_home_cents: estimate.monthly_take_home_cents, estimated_monthly_take_home_cents: estimate.monthly_take_home_cents, take_home_source: "estimated", confidence: "estimated", estimate_rule_version: estimate.rule_version })}>{t("income.useEstimate")}</Button>
            <Button size="sm" variant={income.take_home_source === "user_confirmed" ? "default" : "outline"} onClick={() => onChange({ take_home_source: "user_confirmed", confidence: "confirmed", monthly_take_home_cents: income.monthly_take_home_cents || estimate.monthly_take_home_cents })}>{t("income.enterActual")}</Button>
          </div>
          {income.take_home_source === "user_confirmed" ? (
            <div className="mt-4 max-w-sm">
              <MoneyField label={t("income.actualMonthly")} currency={answers.currency} value={income.monthly_take_home_cents} onChange={(value) => onChange({ monthly_take_home_cents: value, take_home_source: "user_confirmed", confidence: "confirmed" })} />
            </div>
          ) : null}
          <details className="mt-5 rounded-xl border border-emerald-200 p-3 text-sm dark:border-emerald-500/20">
            <summary className="cursor-pointer font-semibold">{t("income.howCalculated")}</summary>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-2 text-slate-600 dark:text-slate-300">
              <dt>{t("income.enteredGross")}</dt><dd>{formatCents(income.entered_amount_cents, locale, answers.currency)} · {t(`income.${income.entered_period}`)}</dd>
              <dt>{t("income.annualGross")}</dt><dd>{formatCents(estimate.annual_gross_cents, locale, answers.currency)}</dd>
              <dt>{t("income.monthlyGross")}</dt><dd>{formatCents(estimate.monthly_gross_cents, locale, answers.currency)}</dd>
              <dt>{t("income.federalTax")}</dt><dd>{formatCents(estimate.annual_federal_income_tax_cents, locale, answers.currency)}</dd>
              <dt>{t("income.stateTax")}</dt><dd>{formatCents(estimate.annual_state_income_tax_cents, locale, answers.currency)}</dd>
              <dt>{t("income.socialSecurity")}</dt><dd>{formatCents(estimate.annual_social_security_cents, locale, answers.currency)}</dd>
              <dt>{t("income.medicare")}</dt><dd>{formatCents(estimate.annual_medicare_cents, locale, answers.currency)}</dd>
              <dt>{t("income.monthlyDeductions")}</dt><dd>{formatCents(estimate.monthly_estimated_deductions_cents, locale, answers.currency)}</dd>
              <dt>{t("income.ruleVersion", { version: estimate.rule_version })}</dt><dd>{estimate.federal_rule_version}</dd>
            </dl>
            {answers.country === "US" ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-medium">{t("income.filingStatus")}</span><select className="h-10 w-full rounded-lg border bg-transparent px-2" value={income.tax_filing_status} onChange={(event) => onChange({ tax_filing_status: event.target.value as IncomeAnswer["tax_filing_status"], take_home_source: "estimated" })}>{(["single", "married_joint", "married_separate", "head_household"] as const).map((status) => <option key={status} value={status}>{t(`income.filingStatuses.${status}`)}</option>)}</select></label><MoneyField label={t("income.otherDeductions")} currency={answers.currency} value={income.annual_other_deductions_cents} onChange={(value) => onChange({ annual_other_deductions_cents: value, take_home_source: "estimated" })} /></div> : null}
            <p className="mt-3 text-xs text-slate-500">{t("income.estimateDisclaimer")}</p>
          </details>
        </div>
      ) : null}
    </div>
  );
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
      <p className="mb-3 font-medium">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["employed", "self_employed", "unemployed", "not_working"] as EmploymentStatus[]).map((status) => (
          <ChoiceCard key={status} selected={value === status} title={t(`employment.${status}`)} onClick={() => onChange(status)} />
        ))}
      </div>
    </div>
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
    <button type="button" aria-pressed={selected} onClick={onClick} className={`rounded-2xl border p-4 text-left transition ${selected ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-500/10" : "hover:border-slate-400"}`}>
      <span className="flex items-center justify-between gap-3 font-medium">{title}{selected ? <Check className="h-4 w-4 text-emerald-600" /> : null}</span>
      {description ? <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span> : null}
    </button>
  );
}

function CheckCard({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="font-medium">{label}</span>
    </label>
  );
}

function ToggleMoneyCard({
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

function InfoBox({ children }: { children: ReactNode }) {
  return <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-500 dark:bg-white/5">{children}</div>;
}

function ReviewRow({ label, value, status, t }: { label: string; value: string; status: InputConfidence | "complete"; t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
      <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-medium">{value}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] ${status === "confirmed" || status === "complete" ? "bg-emerald-100 text-emerald-700" : status === "estimated" || status === "needs_review" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{t(`confidence.${status}`)}</span>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
