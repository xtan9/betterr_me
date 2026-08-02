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
  RUNWAY_STEP_IDS,
  createDefaultRunwayAnswers,
  currencyForCountry,
  estimateMonthlyTakeHome,
  expenseCategoryTotals,
  expenseTotals,
  formatCents,
  monthlyIncomeTotal,
  applyExpenseReduction,
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
  type RunwaySnapshotSummary,
  type RunwayStepId,
} from "@/lib/finance/cushion";
import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import { downloadHouseholdRunwayAssessment } from "@/lib/finance/household-runway-download";
import {
  EXPENSE_ITEM_TYPES,
  type ExpenseItemType,
} from "@/lib/finance/runway-expenses";
import {
  clearHouseholdRunwayInterviewDraft,
  clearRunwayDraft,
  persistHouseholdRunwayInterviewDraft,
  persistRunwayDraft,
  readHouseholdRunwayInterviewDraft,
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
import {
  createHouseholdRunwayInterview,
  dispatchHouseholdRunwayInterview,
  restoreHouseholdRunwayInterview,
  type HouseholdRunwayInterviewCommand,
  type HouseholdRunwayInterviewCommandInput,
  type HouseholdRunwayInterviewEffect,
  type HouseholdRunwayInterviewAnswers,
  type HouseholdRunwayInterviewRenderModel,
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayLocationRenderModel,
} from "@/lib/finance/household-runway-interview";

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
  initialAdjustments: RunwayAdjustments | null;
  isAuthenticated: boolean;
  hasSavedPlan: boolean;
  initialSnapshots: RunwaySnapshotSummary[];
}

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
}

function householdRunwayInterviewCommand(
  input: HouseholdRunwayInterviewCommandInput,
): HouseholdRunwayInterviewCommand {
  return {
    ...input,
    commandId: newId("runway-command"),
    occurredAt: new Date().toISOString(),
  } as HouseholdRunwayInterviewCommand;
}

function applyHouseholdRunwayInterviewEffect(
  effect: HouseholdRunwayInterviewEffect,
) {
  if (typeof window === "undefined") return;

  if (effect.type === "history") {
    if (effect.action === "back") {
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    if (effect.destination === "interview") {
      url.searchParams.set("start", "1");
    } else {
      url.searchParams.delete("start");
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (effect.action === "push") {
      window.history.pushState({}, "", nextUrl);
    } else {
      window.history.replaceState({}, "", nextUrl);
    }
    return;
  }

  const focusHeading = () => {
    document
      .getElementById("runway-question-heading")
      ?.focus({ preventScroll: true });
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(focusHeading);
  } else {
    focusHeading();
  }
}

function applyHouseholdRunwayInterviewEffects(
  effects: readonly HouseholdRunwayInterviewEffect[],
) {
  effects.forEach(applyHouseholdRunwayInterviewEffect);
}

function projectInterviewAnswers(
  current: HouseholdRunwayAnswers,
  interviewAnswers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayAnswers {
  return {
    ...current,
    ...interviewAnswers,
    country: interviewAnswers.country ?? current.country,
    region: interviewAnswers.region ?? current.region,
    currency: interviewAnswers.currency ?? current.currency,
    updated_at: interviewAnswers.updated_at ?? current.updated_at,
  } as HouseholdRunwayAnswers;
}

function interviewDraftFromRunwayAnswers(answers: HouseholdRunwayAnswers) {
  return {
    revision: 0,
    interviewId: null,
    startedAt: null,
    location: {
      country: answers.country,
      region: answers.region || null,
      currency: answers.currency,
      proposedCurrency: currencyForCountry(answers.country),
      currencySelection: "explicit" as const,
    },
    answers,
  };
}

function resumableRunwayStep(
  stage: RunwayStepId | null,
): RunwayStepId | undefined {
  return stage ?? undefined;
}

function interviewValidationMessage(
  t: ReturnType<typeof useTranslations>,
  code: string | undefined,
) {
  switch (code) {
    case "country_required":
      return t("boundary.countryRequired");
    case "region_required":
      return t("boundary.regionRequired");
    case "currency_required":
      return t("boundary.currencyRequired");
    case "currency_change_confirmation_required":
      return t("currencyChange.confirmation");
    case "income_required":
      return t("validation.income");
    case "expenses_current_required":
      return t("validation.expensesCurrent");
    case "expenses_interruption_required":
      return t("validation.expenses");
    case "assessment_required":
      return t("validation.assessment");
    default:
      return "";
  }
}

export function HouseholdRunway({
  initialAnswers,
  initialAdjustments,
  isAuthenticated,
  hasSavedPlan,
  initialSnapshots,
}: HouseholdRunwayProps) {
  const t = useTranslations("householdRunway");
  const locale = useLocale();
  const initialAssessment = useMemo(
    () =>
      initialAnswers
        ? assessHouseholdRunway({
            answers: initialAnswers,
            adjustments: initialAdjustments ?? undefined,
          })
        : null,
    [initialAdjustments, initialAnswers],
  );
  const [answers, setAnswers] = useState<HouseholdRunwayAnswers>(
    () => initialAnswers ?? createDefaultRunwayAnswers(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [planExists, setPlanExists] = useState(hasSavedPlan);
  const [draftSynced, setDraftSynced] = useState(false);
  const [interviewState, setInterviewState] =
    useState<HouseholdRunwayInterviewState>(() =>
      createHouseholdRunwayInterview(),
    );
  const [error, setError] = useState("");
  const [adjustments, setAdjustments] = useState<RunwayAdjustments>(() =>
    initialAdjustments
      ? { ...initialAdjustments }
      : {
          ...EMPTY_ADJUSTMENTS,
          usable_illiquid_investments_cents:
            initialAnswers?.extreme_access.illiquid_investments_cents ?? 0,
          usable_retirement_tax_deferred_cents:
            initialAnswers?.extreme_access.retirement_tax_deferred_cents ?? 0,
          usable_retirement_tax_free_cents:
            initialAnswers?.extreme_access.retirement_tax_free_cents ?? 0,
        },
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(hasSavedPlan);
  const landingTracked = useRef(false);
  const resumeStageRef = useRef<RunwayStepId | null>(null);
  const interviewStarted =
    isAuthenticated || interviewState.status !== "not_started";
  const stepId = (interviewState.stage ?? "location") as RunwayStepId;
  const completed =
    interviewState.status === "completed" ||
    interviewState.draft.stageStatus.result === "completed";
  const activeExpenseCategory = interviewState.draft.activeExpenseCategory;
  const scenario = interviewState.draft.selectedScenario ?? "current";
  const boundaryLocation =
    interviewState.renderModel.kind === "location"
      ? interviewState.renderModel
      : null;
  const dispatchInterviewCommand = (
    input: HouseholdRunwayInterviewCommandInput,
    sourceState: HouseholdRunwayInterviewState = interviewState,
  ) => {
    const result = dispatchHouseholdRunwayInterview(
      sourceState,
      householdRunwayInterviewCommand(input),
    );
    setInterviewState(result.state);
    persistHouseholdRunwayInterviewDraft(result.state.draft);
    setAnswers((current) =>
      projectInterviewAnswers(current, result.state.draft.answers),
    );
    applyHouseholdRunwayInterviewEffects(result.effects);
    return result;
  };

  useEffect(() => {
    let hydrationFrame: number | null = null;
    const boundaryDraft = initialAnswers
      ? null
      : readHouseholdRunwayInterviewDraft();
    let restoredBoundary = boundaryDraft
      ? restoreHouseholdRunwayInterview({
          version: 2,
          status: "not_started",
          stage: null,
          draft: boundaryDraft,
          validationIssue: null,
        })
      : createHouseholdRunwayInterview();
    const syncUrlMode = () => {
      const started = new URLSearchParams(window.location.search).get("start") === "1";
      if (isAuthenticated || started) {
        const command = householdRunwayInterviewCommand({
          type: "start",
          interviewId: newId("runway-interview"),
          stage: resumableRunwayStep(resumeStageRef.current),
        });
        setInterviewState((current) =>
          current.status === "not_started"
            ? dispatchHouseholdRunwayInterview(current, command).state
            : current,
        );
      } else {
        setInterviewState((current) =>
          current.status === "not_started"
            ? current
            : restoreHouseholdRunwayInterview({
                version: 1,
                status: "not_started",
                stage: null,
                draft: current.draft,
                validationIssue: null,
              }),
        );
      }
    };
    const draft = readRunwayDraft();
    if (draft && !initialAnswers) {
      const draftAssessment = assessHouseholdRunway({ answers: draft.answers });
      const completedDraftIsValid = draft.completed && draftAssessment.success;
      setAnswers(draft.answers);
      resumeStageRef.current =
        draft.completed && !completedDraftIsValid ? "location" : draft.step_id;
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

      if (!boundaryDraft) {
        restoredBoundary = restoreHouseholdRunwayInterview({
          version: 2,
          status: completedDraftIsValid ? "completed" : "not_started",
          stage: completedDraftIsValid ? "result" : null,
          draft: interviewDraftFromRunwayAnswers(draft.answers),
          validationIssue: null,
        });
      }
    }
    if (initialAnswers) {
      restoredBoundary = restoreHouseholdRunwayInterview({
        version: 2,
        status: initialAssessment?.success ? "completed" : "not_started",
        stage: initialAssessment?.success ? "result" : null,
        draft: interviewDraftFromRunwayAnswers(initialAnswers),
        validationIssue: null,
      });
    }
    const started = new URLSearchParams(window.location.search).get("start") === "1";
    if ((isAuthenticated || started) && restoredBoundary.status === "not_started") {
      const command = householdRunwayInterviewCommand({
        type: "start",
        interviewId: newId("runway-interview"),
        stage: resumableRunwayStep(resumeStageRef.current),
      });
      setInterviewState(
        dispatchHouseholdRunwayInterview(restoredBoundary, command).state,
      );
    } else {
      setInterviewState(restoredBoundary);
    }
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
  }, [initialAnswers, initialAssessment?.success, isAuthenticated]);

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

  const assessment = useMemo(
    () =>
      stepId === "review" || stepId === "result"
        ? assessHouseholdRunway({ answers, adjustments })
        : null,
    [adjustments, answers, stepId],
  );
  const selectedAssessment = assessment?.success
    ? (assessment.scenarios.find((item) => item.scenario === scenario) ??
      assessment.firstScenario)
    : null;

  const update = (patch: Partial<HouseholdRunwayAnswers>) => {
    setSaved(false);
    setDraftSynced(false);
    return dispatchInterviewCommand({ type: "update_answers", patch });
  };

  const updateIncome = (
    person: "mine" | "partner",
    patch: Partial<IncomeAnswer>,
  ) => {
    setSaved(false);
    setDraftSynced(false);
    return dispatchInterviewCommand({ type: "set_income", person, patch });
  };

  const startInterview = (fresh = false) => {
    if (fresh) {
      const reset = createDefaultRunwayAnswers();
      setAnswers(reset);
      setHasLocalDraft(false);
      setDraftSynced(false);
      setAdjustments({ ...EMPTY_ADJUSTMENTS });
      resumeStageRef.current = null;
      clearRunwayDraft();
      clearHouseholdRunwayInterviewDraft();
      window.localStorage.removeItem(RUNWAY_IMPORT_ACTION_KEY);
    }
    dispatchInterviewCommand({
      type: fresh ? "start_new" : "start",
      interviewId: newId("runway-interview"),
      stage: fresh
        ? undefined
        : completed
          ? "result"
          : resumableRunwayStep(resumeStageRef.current),
    });
    resumeStageRef.current = null;
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
    setSaved(false);
    setHasLocalDraft(false);
    setAdjustments({ ...EMPTY_ADJUSTMENTS });
    dispatchInterviewCommand(
      isAuthenticated
        ? {
            type: "start_new",
            interviewId: newId("runway-interview"),
          }
        : { type: "discard_draft" },
    );
  };

  const next = () => {
    if (stepId === "location" && boundaryLocation) {
      let currentInterviewState = interviewState;
      if (
        boundaryLocation.currency === null &&
        boundaryLocation.currencyProposal !== null
      ) {
        const currencyResult = dispatchInterviewCommand(
          {
            type: "select_currency",
            currency: boundaryLocation.currencyProposal,
          },
          currentInterviewState,
        );
        currentInterviewState = currencyResult.state;
      }
      const result = dispatchInterviewCommand(
        { type: "continue" },
        currentInterviewState,
      );
      setError(
        interviewValidationMessage(t, result.state.validationIssue?.code),
      );
      return;
    }
    const result = dispatchInterviewCommand({ type: "continue" });
    setError(interviewValidationMessage(t, result.state.validationIssue?.code));
    if (result.state.stage === "result") {
      trackRunwayEvent("completed", stepId);
    }
  };

  const skip = () => {
    const result = dispatchInterviewCommand({ type: "skip" });
    setError(interviewValidationMessage(t, result.state.validationIssue?.code));
    trackRunwayEvent("skipped", stepId);
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
          adjustments,
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
      clearHouseholdRunwayInterviewDraft();
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
    if (!assessment?.success) {
      setError(t("save.downloadError"));
      return;
    }
    const result = downloadHouseholdRunwayAssessment(assessment, {
      location: `${answers.country} · ${runwayRegionLabel(answers.country, answers.region, locale) ?? answers.region}`,
      formatMoney: (cents) =>
        formatCents(cents, locale, answers.currency),
      formatScenario: (itemScenario) => t(`scenarios.${itemScenario}`),
      formatSimulation: (simulation) =>
        simulation.sustainable
          ? t("comparison.sustainable")
          : `${(simulation.months_covered ?? 0).toFixed(1)} ${t("whatIf.months")}`,
      formatCashTarget: (months, cents) =>
        `${t("actionsPlan.cashTarget", { months })}: ${formatCents(cents, locale, answers.currency)}`,
      formatLargestReduction: (category, cents) =>
        `${t("actionsPlan.largest")}: ${t(`expenseCategories.${category}`)} (${formatCents(cents, locale, answers.currency)})`,
      precisionAdvice:
        answers.expense_mode === "quick"
          ? t("precision.expenses")
          : answers.mine.take_home_source === "estimated" ||
              answers.partner?.take_home_source === "estimated"
            ? t("precision.takeHome")
            : t("precision.complete"),
    });
    if (!result.success) setError(t("save.downloadError"));
  };

  if (!hydrated) {
    return (
      <main
        className={`${isAuthenticated ? "min-h-full" : "min-h-screen"} bg-[#f5f6f2] dark:bg-[#101310]`}
      />
    );
  }

  return (
    <main
      className={`${isAuthenticated ? "min-h-full" : "min-h-screen"} bg-[#f5f6f2] text-slate-950 dark:bg-[#101310] dark:text-white`}
      data-runway-presentation={isAuthenticated ? "authenticated" : "public"}
    >
      {!isAuthenticated ? <RunwayHeader t={t} /> : null}
      {showLanding ? (
        <HouseholdRunwayLanding
          t={t}
          renderModel={interviewState.renderModel}
          hasDraft={hasLocalDraft}
          draftCompleted={completed}
          onPrimary={() => startInterview(false)}
          onStartOver={confirmStartOver}
        />
      ) : stepId === "result" && assessment?.success && selectedAssessment ? (
        <ResultExperience
          t={t}
          locale={locale}
          answers={answers}
          scenarios={assessment.scenarios.map((item) => item.scenario)}
          scenario={scenario}
          setScenario={(value) => {
            dispatchInterviewCommand({ type: "select_scenario", scenario: value });
            trackRunwayEvent("result_interaction", "scenario_switch");
          }}
          baseline={selectedAssessment.baseline}
          preview={selectedAssessment.adjusted}
          currentLifestyle={selectedAssessment.comparisons.currentLifestyle}
          extreme={selectedAssessment.comparisons.extremeMode}
          adjustments={adjustments}
          setAdjustments={setAdjustments}
          actions={selectedAssessment.advice}
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
          onEdit={() => dispatchInterviewCommand({ type: "back" })}
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
              const result = update({
                completed_expense_categories: Array.from(
                  new Set([
                    ...answers.completed_expense_categories,
                    activeExpenseCategory,
                  ]),
                ),
              });
              dispatchInterviewCommand(
                { type: "set_active_expense_category", category: null },
                result.state,
              );
            } else {
              dispatchInterviewCommand({
                type: stepId === "location" ? "exit" : "back",
              });
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
            locationModel={boundaryLocation}
            renderModel={interviewState.renderModel}
            dispatchInterviewCommand={dispatchInterviewCommand}
            activeExpenseCategory={activeExpenseCategory}
          />
        </InterviewShell>
      )}
    </main>
  );
}

function RunwayHeader({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <header
      data-testid="runway-public-header"
      className="border-b border-black/5 bg-[#f5f6f2]/90 backdrop-blur dark:border-white/10 dark:bg-[#101310]/90"
    >
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
  locationModel,
  renderModel,
  dispatchInterviewCommand,
  activeExpenseCategory,
}: {
  step: RunwayStepId;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  answers: HouseholdRunwayAnswers;
  update: (patch: Partial<HouseholdRunwayAnswers>) => void;
  updateIncome: (person: "mine" | "partner", patch: Partial<IncomeAnswer>) => void;
  locationModel: HouseholdRunwayLocationRenderModel | null;
  renderModel: HouseholdRunwayInterviewRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewCommandInput) => unknown;
  activeExpenseCategory: ExpenseCategory | null;
}) {
  const title = <StepTitle step={step} t={t} />;
  const householdModel = renderModel.kind === "household" ? renderModel : null;
  const employmentModel = renderModel.kind === "employment" ? renderModel : null;
  const incomeModel =
    renderModel.kind === "myIncome" || renderModel.kind === "partnerIncome"
      ? renderModel
      : null;
  const otherIncomeModel = renderModel.kind === "otherIncome" ? renderModel : null;
  if (step === "location") {
    if (!locationModel) return title;
    const regionLocale = normalizeRunwayLocale(locale);
    return (
      <>
        {title}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {locationModel.availableCountries.map((country) => (
            <ChoiceCard
              key={country}
              selected={locationModel.country === country}
              title={t(`countries.${country}`)}
              onClick={() => dispatchInterviewCommand({ type: "select_country", country })}
            />
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-medium">{t("fields.region")}</span>
            <select
              aria-label={t("fields.region")}
              className="h-12 w-full rounded-xl border bg-transparent px-3"
              value={locationModel.region ?? ""}
              disabled={!locationModel.country}
              onChange={(event) =>
                dispatchInterviewCommand({
                  type: "select_region",
                  region: event.target.value,
                })
              }
            >
              <option value="">{t("fields.selectRegion")}</option>
              {(locationModel.country
                ? RUNWAY_REGIONS[locationModel.country]
                : []
              ).map((region) => (
                <option key={region.code} value={region.code}>
                  {region.labels[regionLocale]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-medium">{t("fields.currency")}</span>
            <select
              aria-label={t("fields.currency")}
              className="h-12 w-full rounded-xl border bg-transparent px-3"
              disabled={!locationModel.country}
              value={locationModel.currency ?? locationModel.currencyProposal ?? ""}
              onChange={(event) =>
                dispatchInterviewCommand({
                  type: "select_currency",
                  currency: event.target.value as HouseholdRunwayAnswers["currency"],
                })
              }
            >
              <option value="" disabled>
                {t("fields.currency")}
              </option>
              {locationModel.availableCurrencies.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
            {locationModel.currency === null && locationModel.currencyProposal ? (
              <p className="mt-2 text-xs text-slate-500">
                {t("boundary.currencyProposal", { currency: locationModel.currencyProposal })}
              </p>
            ) : null}
          </label>
        </div>
        {locationModel.pendingCurrencyChange ? (
          <div role="alert" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p>{t("currencyChange.confirmation")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  dispatchInterviewCommand({ type: "reset_currency_entries" })
                }
              >
                {t("currencyChange.reset")}
              </Button>
              <Button
                onClick={() =>
                  dispatchInterviewCommand({ type: "retain_currency_entries" })
                }
              >
                {t("currencyChange.retain")}
              </Button>
            </div>
          </div>
        ) : null}
      </>
    );
  }
  if (step === "household") {
    if (!householdModel) return title;
    return (
      <>
        {title}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            selected={!householdModel.sharesFinances}
            title={t("household.solo")}
            onClick={() =>
              dispatchInterviewCommand({
                type: "set_household",
                sharesFinances: false,
                hasChildren: householdModel.hasChildren,
                hasSupportObligations: householdModel.hasSupportObligations,
              })
            }
          />
          <ChoiceCard
            selected={householdModel.sharesFinances}
            title={t("household.shared")}
            description={t("household.sharedHelp")}
            onClick={() =>
              dispatchInterviewCommand({
                type: "set_household",
                sharesFinances: true,
                hasChildren: householdModel.hasChildren,
                hasSupportObligations: householdModel.hasSupportObligations,
              })
            }
          />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <CheckCard
            checked={householdModel.hasChildren}
            label={t("household.children")}
            onChange={(checked) =>
              dispatchInterviewCommand({
                type: "set_household",
                sharesFinances: householdModel.sharesFinances,
                hasChildren: checked,
                hasSupportObligations: householdModel.hasSupportObligations,
              })
            }
          />
          <CheckCard
            checked={householdModel.hasSupportObligations}
            label={t("household.support")}
            onChange={(checked) =>
              dispatchInterviewCommand({
                type: "set_household",
                sharesFinances: householdModel.sharesFinances,
                hasChildren: householdModel.hasChildren,
                hasSupportObligations: checked,
              })
            }
          />
        </div>
      </>
    );
  }
  if (step === "employment") {
    if (!employmentModel) return title;
    return (
      <>
        {title}
        <EmploymentPicker
          t={t}
          label={t("employment.me")}
          value={employmentModel.mine}
          onChange={(employment) =>
            dispatchInterviewCommand({
              type: "set_employment",
              person: "mine",
              employment,
            })
          }
        />
        {employmentModel.sharesFinances && employmentModel.partner ? (
          <EmploymentPicker
            t={t}
            label={t("employment.partner")}
            value={employmentModel.partner}
            onChange={(employment) =>
              dispatchInterviewCommand({
                type: "set_employment",
                person: "partner",
                employment,
              })
            }
          />
        ) : null}
      </>
    );
  }
  if (step === "myIncome") {
    if (!incomeModel || incomeModel.person !== "mine") return title;
    return (
      <>
        {title}
        <IncomeEditor
          t={t}
          locale={locale}
          location={incomeModel.location}
          income={incomeModel.income}
          onChange={(patch) => updateIncome("mine", patch)}
        />
      </>
    );
  }
  if (step === "partnerIncome") {
    if (!incomeModel || incomeModel.person !== "partner") return title;
    return (
      <>
        {title}
        <IncomeEditor
          t={t}
          locale={locale}
          location={incomeModel.location}
          income={incomeModel.income}
          onChange={(patch) => updateIncome("partner", patch)}
        />
      </>
    );
  }
  if (step === "otherIncome") {
    if (!otherIncomeModel) return title;
    return (
      <OtherIncomeStep
        title={title}
        t={t}
        locale={locale}
        currency={otherIncomeModel.location.currency}
        sources={otherIncomeModel.sources}
        dispatchInterviewCommand={dispatchInterviewCommand}
      />
    );
  }
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
      <ExpenseHub
        title={title}
        t={t}
        locale={locale}
        answers={answers}
        update={update}
        onOpen={(category) =>
          dispatchInterviewCommand({
            type: "set_active_expense_category",
            category,
          })
        }
      />
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
  currency,
  sources,
  dispatchInterviewCommand,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  currency: HouseholdRunwayAnswers["currency"] | null;
  sources: readonly RecurringIncomeSource[];
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewCommandInput) => unknown;
}) {
  const sendSources = (nextSources: readonly RecurringIncomeSource[]) =>
    dispatchInterviewCommand({
      type: "set_other_income_sources",
      sources: nextSources,
    });
  const setSource = (type: RecurringIncomeType, enabled: boolean) => {
    const existing = sources.find((source) => source.type === type);
    sendSources(
      enabled
        ? existing
          ? sources
          : [
              ...sources,
              { id: newId(type), type, monthly_cents: 0, confidence: "confirmed" },
            ]
        : sources.filter((source) => source.id !== existing?.id),
    );
  };
  const updateSource = (id: string, patch: Partial<RecurringIncomeSource>) =>
    sendSources(
      sources.map((source) =>
        source.id === id ? { ...source, ...patch } : source,
      ),
    );
  const total = sources.reduce((sum, source) => sum + source.monthly_cents, 0);
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
            <Button variant="ghost" size="icon" aria-label={t("otherIncome.remove")} onClick={() => sendSources(sources.filter((item) => item.id !== source.id))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => sendSources([...sources, { id: newId("other-income"), type: "other", label: "", monthly_cents: 0, confidence: "confirmed" }])}>
          <Plus />
          {t("otherIncome.addOther")}
        </Button>
      </div>
      <p className="mt-6 font-medium">{t("otherIncome.total", { amount: formatCents(total, locale, displayCurrency) })}</p>
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
  location,
  income,
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
  onChange: (patch: Partial<IncomeAnswer>) => void;
}) {
  if (income.employment === "unemployed" || income.employment === "not_working")
    return <InfoBox>{t("income.notAsked")}</InfoBox>;
  const estimate =
    income.entered_as === "gross" && income.gross_amount_cents > 0
      ? estimateMonthlyTakeHome({ country: location.country ?? "US", region: location.region ?? "", amountCents: income.gross_amount_cents, period: income.gross_period, filingStatus: income.tax_filing_status, selfEmployed: income.employment === "self_employed", annualOtherDeductionsCents: income.annual_other_deductions_cents })
      : null;
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
