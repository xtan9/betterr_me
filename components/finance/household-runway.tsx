"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
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
  RUNWAY_STEP_IDS,
  estimateMonthlyTakeHome,
  expenseTotals,
  formatCents,
  monthlyIncomeTotal,
  type EmploymentStatus,
  type ExpenseCategory,
  type ExpenseFrequency,
  type ExpenseLineItem,
  type HouseholdRunwayAnswers,
  type IncomeAnswer,
  type InputConfidence,
  type RecurringIncomeSource,
  type RecurringIncomeType,
  type RunwaySnapshotSummary,
  type RunwayStepId,
} from "@/lib/finance/cushion";
import {
  EXPENSE_ITEM_TYPES,
  type ExpenseItemType,
} from "@/lib/finance/runway-expenses";
import {
  HOUSEHOLD_RUNWAY_DRAFT_TTL_MS,
} from "@/lib/finance/household-runway-draft-codec";
import {
  RUNWAY_REGIONS,
  normalizeRunwayLocale,
  runwayRegionLabel,
} from "@/lib/finance/runway-regions";
import {
  type HouseholdRunwayInterviewIntent,
  type HouseholdRunwayInterviewRuntimeScreen,
} from "@/lib/finance/household-runway-interview-runtime";
import type { HouseholdRunwayBrowserReportPresentation } from "@/lib/finance/household-runway-browser-adapter";
import type { HouseholdRunwayReportPresentation } from "@/lib/finance/household-runway-download";
import { useHouseholdRunwayRuntime } from "@/lib/finance/household-runway-react-adapter";

const OPTIONAL_STEPS = new Set<RunwayStepId>([
  "otherIncome",
  "assets",
]);
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

interface HouseholdRunwayProps {
  initialAnswers: HouseholdRunwayAnswers | null;
  initialPlanRevision?: number;
  isAuthenticated: boolean;
  hasSavedPlan: boolean;
  initialSnapshots: RunwaySnapshotSummary[];
}

function newId(_prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .replace(
        /^(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})$/,
        "$1-$2-$3-$4-$5",
      );
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = token === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

function runwayAnswersForPresentation(
  interviewAnswers: HouseholdRunwayAnswers,
): HouseholdRunwayAnswers {
  return {
    ...interviewAnswers,
    country: interviewAnswers.country ?? "US",
    region: interviewAnswers.region ?? "",
    currency: interviewAnswers.currency ?? "USD",
    updated_at: interviewAnswers.updated_at ?? "1970-01-01T00:00:00.000Z",
  } as HouseholdRunwayAnswers;
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
    case "region_invalid":
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
    case "draft_timestamp_required":
    case "plan_input_invalid":
      return t("validation.assessment");
    case "plan_adjustment_pending":
      return t("save.adjustmentPending");
    case "draft_recovery":
      return t("save.draftRecovery");
    case "plan_recovery":
    case "confirmation_unavailable":
      return t("save.error");
    default:
      return "";
  }
}

type HouseholdRunwayInterviewRenderModel = HouseholdRunwayInterviewRuntimeScreen;
type HouseholdRunwayAssetsRenderModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "assets" }
>;
type HouseholdRunwayExpensesRenderModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "expenses" }
>;
type HouseholdRunwayReductionsRenderModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "reductions" }
>;
type HouseholdRunwayReviewRenderModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "review" }
>;

export function HouseholdRunway({
  initialAnswers,
  initialPlanRevision = 0,
  isAuthenticated,
  hasSavedPlan: _hasSavedPlan,
  initialSnapshots,
}: HouseholdRunwayProps) {
  const t = useTranslations("householdRunway");
  const locale = normalizeRunwayLocale(useLocale());
  const localeRef = useRef(locale);
  const landingTracked = useRef(false);
  const reportPresentationRef = useRef<HouseholdRunwayBrowserReportPresentation | null>(null);
  const reportPresentation = useCallback(({ assessment, locale: reportLocale }: Parameters<HouseholdRunwayBrowserReportPresentation>[0]): HouseholdRunwayReportPresentation => {
    const presentationAnswers = runwayAnswersForPresentation(assessment.answers);
    return {
      location: `${presentationAnswers.country} · ${runwayRegionLabel(presentationAnswers.country, presentationAnswers.region, reportLocale) ?? presentationAnswers.region}`,
      formatMoney: (cents) =>
        formatCents(cents, reportLocale, presentationAnswers.currency),
      formatScenario: (scenario) => t(`scenarios.${scenario}`),
      formatSimulation: (simulation) =>
        simulation.sustainable
          ? t("comparison.sustainable")
          : `${(simulation.months_covered ?? 0).toFixed(1)} ${t("whatIf.months")}`,
      formatCashTarget: (months, cents) =>
        `${t("actionsPlan.cashTarget", { months })}: ${formatCents(cents, reportLocale, presentationAnswers.currency)}`,
      formatLargestReduction: (category, cents) =>
        `${t("actionsPlan.largest")}: ${t(`expenseCategories.${category}`)} (${formatCents(cents, reportLocale, presentationAnswers.currency)})`,
      precisionAdvice:
        presentationAnswers.expense_mode === "quick"
          ? t("precision.expenses")
          : presentationAnswers.mine.take_home_source === "estimated" ||
              presentationAnswers.partner?.take_home_source === "estimated"
            ? t("precision.takeHome")
            : t("precision.complete"),
    };
  }, [t]);
  useEffect(() => {
    localeRef.current = locale;
    reportPresentationRef.current = reportPresentation;
  }, [locale, reportPresentation]);
  const { snapshot, send } = useHouseholdRunwayRuntime({
    authenticated: isAuthenticated,
    autoStart: isAuthenticated,
    initialPlan: initialAnswers
      ? { revision: initialPlanRevision, inputs: initialAnswers }
      : null,
    initialSnapshots,
    locale,
    localeProvider: () => localeRef.current,
    reportPresentation: (request) => reportPresentationRef.current!(request),
    confirm: ({ action }) =>
      window.confirm(
        action === "discard_draft" || action === "clear_device_draft"
          ? t("actions.clearConfirm")
          : t("landing.startOverConfirm"),
      ),
  });
  const hydrated = snapshot.lifecycle === "ready";
  const renderModel = snapshot.screen;
  const hasResumeChoice = renderModel.kind === "resume_choice";
  const stepId = (renderModel.stage ?? "location") as RunwayStepId;
  const activeExpenseCategory =
    renderModel.kind === "expenses" ? renderModel.activeCategory : null;
  const deviceStorageConsent = snapshot.draft.deviceStorageConsent;
  const planExists = snapshot.plan.exists;
  const snapshots = snapshot.assessmentHistory;
  const draftSyncOperation = snapshot.operations.draftSynchronization;
  const draftSyncState =
    draftSyncOperation.status === "succeeded"
      ? "synchronized"
      : draftSyncOperation.status === "failed"
        ? "failed"
        : "pending";
  const planOperation = snapshot.operations.planPersistence;
  const planOperationState =
    planOperation.status === "pending"
      ? "saving"
      : planOperation.status === "succeeded" ||
          (planExists && !snapshot.draft.current)
        ? "saved"
        : planOperation.status === "failed"
          ? "failed"
          : planOperation.status === "dirty"
            ? "dirty"
            : "idle";
  const saving = planOperation.status === "pending";
  const saved = planOperationState === "saved";
  const issue = snapshot.issues[0]?.code;
  const error = issue ? interviewValidationMessage(t, issue) : "";
  const operationError =
    planOperation.status === "failed"
      ? planOperation.error === "authentication_required"
        ? t("save.authenticationRequired")
        : planOperation.error === "conflict"
          ? t("save.stale")
          : t("save.error")
      : snapshot.operations.reportDownload.status === "failed"
        ? t("save.downloadError")
        : draftSyncOperation.status === "failed"
          ? t("save.draftSyncError")
          : snapshot.operations.deviceDraft.status === "failed"
            ? t("save.draftSyncError")
        : "";
  const boundaryLocation = renderModel.kind === "location" ? renderModel : null;
  const dispatchInterviewCommand = useCallback(
    (intent: HouseholdRunwayInterviewIntent) => send(intent),
    [send],
  );

  const landingModel = renderModel.kind === "landing" ? renderModel : null;
  const resumeModel = renderModel.kind === "resume_choice" ? renderModel : null;
  const resultModel = renderModel.kind === "stage" ? renderModel : null;
  const assessment = snapshot.derived.assessment ?? resultModel?.assessment ?? null;
  const showLanding = hydrated && !isAuthenticated && landingModel !== null;

  useEffect(() => {
    if (showLanding && !landingTracked.current) {
      landingTracked.current = true;
      dispatchInterviewCommand({
        type: "request_analytics",
        eventName: "landing_view",
        stage: "landing",
      });
    }
  }, [dispatchInterviewCommand, showLanding]);

  const startInterview = () => {
    const stage = landingModel?.resumeStage;
    dispatchInterviewCommand({
      type: "start",
      ...(stage ? { stage } : {}),
    });
  };
  const startNewInterview = () => dispatchInterviewCommand({ type: "start_new" });
  const clearDraft = () => dispatchInterviewCommand({ type: "discard_draft" });
  const rememberDraft = () => dispatchInterviewCommand({ type: "remember_draft" });
  const forgetDeviceDraft = () =>
    dispatchInterviewCommand({ type: "clear_device_draft" });
  const next = () => {
    if (boundaryLocation?.currency === null && boundaryLocation.currencyProposal) {
      dispatchInterviewCommand({
        type: "select_currency",
        currency: boundaryLocation.currencyProposal,
      });
    }
    dispatchInterviewCommand({ type: "continue" });
  };
  const skip = () => dispatchInterviewCommand({ type: "skip" });
  const savePlan = () => dispatchInterviewCommand({ type: "save_plan" });
  const download = () => dispatchInterviewCommand({ type: "request_report_download" });

  return (
    <>
      {!hydrated ? (
        <main
          className={`${isAuthenticated ? "min-h-full" : "min-h-screen"} bg-[#f5f6f2] dark:bg-[#101310]`}
        />
      ) : (
        <main
          className={`${isAuthenticated ? "min-h-full" : "min-h-screen"} bg-[#f5f6f2] text-slate-950 dark:bg-[#101310] dark:text-white`}
          data-runway-presentation={isAuthenticated ? "authenticated" : "public"}
          data-runway-progress={snapshot.interviewStatus}
          data-runway-draft-sync={draftSyncState}
          data-runway-plan-operation={planOperationState}
        >
          {!isAuthenticated ? <RunwayHeader t={t} /> : null}
          {!showLanding ? (
            <DraftStorageControl
              t={t}
              deviceStorageConsent={deviceStorageConsent}
              onRemember={rememberDraft}
              onForget={forgetDeviceDraft}
            />
          ) : null}
          {(showLanding || hasResumeChoice) && (error || operationError) ? (
            <div className="mx-auto max-w-6xl px-5 pt-3" role="alert" data-testid="runway-draft-recovery">
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
                {error || operationError}
              </div>
            </div>
          ) : null}
          {resumeModel ? (
            <ResumeChoicePanel
              t={t}
              model={resumeModel}
              onDraft={() => dispatchInterviewCommand({ type: "resume_draft" })}
              onPlan={() => dispatchInterviewCommand({ type: "resume_committed_plan" })}
            />
          ) : showLanding ? (
            <HouseholdRunwayLanding
              t={t}
              renderModel={landingModel!}
              onPrimary={startInterview}
              onStartOver={startNewInterview}
            />
          ) : resultModel && assessment ? (
            <ResultExperience
              t={t}
              locale={locale}
              model={resultModel}
              dispatch={(input) => {
                dispatchInterviewCommand(input);
                if (input.type === "select_scenario") {
                  dispatchInterviewCommand({
                    type: "request_analytics",
                    eventName: "result_interaction",
                    stage: "scenario_switch",
                  });
                }
              }}
              onStartNew={startNewInterview}
              onDiscardDraft={clearDraft}
              onRegistrationClick={() =>
                dispatchInterviewCommand({
                  type: "request_analytics",
                  eventName: "registration_clicked",
                  stage: "result",
                })
              }
              onDownload={download}
              isAuthenticated={isAuthenticated}
              saved={saved}
              saving={saving}
              onSave={savePlan}
              error={error || operationError}
              snapshots={[...snapshots]}
            />
          ) : (
            <InterviewShell
              t={t}
              stepId={stepId}
              renderKind={renderModel.kind}
              error={error || operationError}
              activeExpenseCategory={activeExpenseCategory}
              onBack={() => {
                if (activeExpenseCategory) {
                  dispatchInterviewCommand({
                    type: "complete_expense_category",
                    category: activeExpenseCategory,
                  });
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
                t={t}
                locale={locale}
                renderModel={renderModel}
                dispatchInterviewCommand={dispatchInterviewCommand}
              />
            </InterviewShell>
          )}
        </main>
      )}
    </>
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

function DraftStorageControl({
  t,
  deviceStorageConsent,
  onRemember,
  onForget,
}: {
  t: ReturnType<typeof useTranslations>;
  deviceStorageConsent: boolean;
  onRemember: () => void;
  onForget: () => void;
}) {
  return (
    <div
      className="mx-auto max-w-6xl px-5 pt-3"
      data-runway-storage-scope={deviceStorageConsent ? "device" : "session"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/5 bg-white/65 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[.04] dark:text-slate-300">
        <p>
          {t(
            deviceStorageConsent
              ? "privacy.remembered"
              : "privacy.session",
            )}
        </p>
        {!deviceStorageConsent ? (
          <p
            className="basis-full text-xs text-slate-500"
            data-testid="runway-expiry-disclosure"
          >
            {t("privacy.expiryDisclosure", {
              days: Math.round(HOUSEHOLD_RUNWAY_DRAFT_TTL_MS / 86_400_000),
            })}
          </p>
        ) : null}
        {deviceStorageConsent ? (
          <Button type="button" variant="ghost" size="sm" onClick={onForget}>
            {t("privacy.forget")}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onRemember}>
            {t("privacy.remember")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ResumeChoicePanel({
  t,
  model,
  onDraft,
  onPlan,
}: {
  t: ReturnType<typeof useTranslations>;
  model: Extract<
    HouseholdRunwayInterviewRenderModel,
    { kind: "resume_choice" }
  >;
  onDraft: () => void;
  onPlan: () => void;
}) {
  return (
    <section
      className="mx-auto max-w-4xl px-5 py-12"
      data-testid="runway-resume-choice"
      data-runway-resume-recommended={model.recommended}
    >
      <div className="rounded-3xl border bg-white p-7 shadow-sm dark:border-white/10 dark:bg-white/[.04] sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-700 dark:text-emerald-400">
          {t("resume.eyebrow")}
        </p>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-[-.04em]">
          {t("resume.title")}
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600 dark:text-slate-300">
          {t("resume.description")}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            data-testid="runway-resume-draft"
            data-recommended={model.recommended === "draft" ? "true" : "false"}
            onClick={onDraft}
            className="rounded-2xl border p-5 text-left transition hover:border-emerald-500"
          >
            <span className="flex items-center justify-between gap-3 font-semibold">
              {t("resume.draft")}
              {model.recommended === "draft" ? (
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-700">
                  {t("resume.recommended")}
                </span>
              ) : null}
            </span>
            <span className="mt-2 block text-sm text-slate-500">
              {t("resume.draftDescription")}
            </span>
          </button>
          <button
            type="button"
            data-testid="runway-resume-plan"
            data-recommended={model.recommended === "plan" ? "true" : "false"}
            onClick={onPlan}
            className="rounded-2xl border p-5 text-left transition hover:border-emerald-500"
          >
            <span className="flex items-center justify-between gap-3 font-semibold">
              {t("resume.plan")}
              {model.recommended === "plan" ? (
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-700">
                  {t("resume.recommended")}
                </span>
              ) : null}
            </span>
            <span className="mt-2 block text-sm text-slate-500">
              {t("resume.planDescription")}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

function InterviewShell({
  t,
  stepId,
  renderKind,
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
  renderKind: HouseholdRunwayInterviewRenderModel["kind"];
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
    <section
      className="mx-auto min-h-[calc(100vh-65px)] max-w-4xl px-5 py-8 pb-28 sm:py-10"
      data-interview-stage={stepId}
      data-interview-render={renderKind}
    >
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
        className="relative z-[1001] mx-auto mt-5 flex items-center gap-2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white"
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
  t,
  locale,
  renderModel,
  dispatchInterviewCommand,
}: {
  t: ReturnType<typeof useTranslations>;
  locale: string;
  renderModel: HouseholdRunwayInterviewRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
}) {
  if (renderModel.stage === null) return null;
  const step = renderModel.stage as RunwayStepId;
  const title = <StepTitle step={step} t={t} />;
  const householdModel = renderModel.kind === "household" ? renderModel : null;
  const employmentModel = renderModel.kind === "employment" ? renderModel : null;
  const incomeModel =
    renderModel.kind === "myIncome" || renderModel.kind === "partnerIncome"
      ? renderModel
      : null;
  const otherIncomeModel = renderModel.kind === "otherIncome" ? renderModel : null;
  const cashModel = renderModel.kind === "cash" ? renderModel : null;
  const assetsModel = renderModel.kind === "assets" ? renderModel : null;
  const expensesModel = renderModel.kind === "expenses" ? renderModel : null;
  const reductionsModel = renderModel.kind === "reductions" ? renderModel : null;
  const reviewModel = renderModel.kind === "review" ? renderModel : null;
  if (step === "location") {
    const locationModel = renderModel.kind === "location" ? renderModel : null;
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
          onChange={(patch) =>
            dispatchInterviewCommand({ type: "set_income", person: "mine", patch })
          }
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
          onChange={(patch) =>
            dispatchInterviewCommand({ type: "set_income", person: "partner", patch })
          }
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
        {cashModel ? (
          <div className="mt-7 max-w-md">
            <MoneyField
              label={t("fields.availableCash")}
              currency={cashModel.location.currency ?? "USD"}
              value={cashModel.availableCash.cents}
              help={t("fields.availableCashHelp")}
              onChange={(value) =>
                dispatchInterviewCommand({
                  type: "set_cash",
                  value: { cents: value, confidence: "confirmed" },
                })
              }
            />
          </div>
        ) : null}
      </>
    );
  if (step === "assets")
    return assetsModel ? (
      <AssetsStep title={title} t={t} model={assetsModel} dispatchInterviewCommand={dispatchInterviewCommand} />
    ) : title;
  if (step === "expenses")
    return expensesModel?.activeCategory ? (
      <ExpenseCategoryEditor
        category={expensesModel.activeCategory}
        t={t}
        model={expensesModel}
        dispatchInterviewCommand={dispatchInterviewCommand}
      />
    ) : (
      expensesModel ? <ExpenseHub
        title={title}
        t={t}
        locale={locale}
        model={expensesModel}
        dispatchInterviewCommand={dispatchInterviewCommand}
        onOpen={(category) =>
          dispatchInterviewCommand({
            type: "set_active_expense_category",
            category,
          })
        }
      /> : title
    );
  if (step === "reductions")
    return reductionsModel ? (
      <ReductionStep title={title} t={t} locale={locale} model={reductionsModel} dispatchInterviewCommand={dispatchInterviewCommand} />
    ) : title;
  if (step === "review")
    return reviewModel ? <ReviewStep title={title} t={t} locale={locale} model={reviewModel} /> : title;
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
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
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
  model,
  dispatchInterviewCommand,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  model: HouseholdRunwayAssetsRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
}) {
  const currency = model.location.currency ?? "USD";
  const country = model.location.country ?? "US";
  return (
    <>
      {title}
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {ASSET_KEYS.map((key) => {
          const asset = model.assets[key];
          return (
            <ToggleMoneyCard
              key={key}
              title={t(`assets.${key}.title`)}
              description={t(`assets.${key}.description`, { country: t(`countries.${country}`) })}
              badge={t(`assets.${key}.${key === "liquid_investments" ? "included" : "excluded"}`)}
              enabled={asset.confidence !== "skipped"}
              currency={currency}
              value={asset.cents}
              onEnabled={(enabled) =>
                dispatchInterviewCommand({
                  type: "set_asset",
                  asset: key,
                  value: {
                    cents: enabled ? asset.cents : 0,
                    confidence: enabled ? "confirmed" : "skipped",
                  },
                })
              }
              onChange={(value) =>
                dispatchInterviewCommand({
                  type: "set_asset",
                  asset: key,
                  value: { cents: value, confidence: "confirmed" },
                })
              }
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
  model,
  dispatchInterviewCommand,
  onOpen,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  model: HouseholdRunwayExpensesRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
  onOpen: (category: ExpenseCategory) => void;
}) {
  const currency = model.location.currency ?? "USD";
  if (model.mode === "quick")
    return (
      <>
        {title}
        <button className="mt-4 text-sm font-semibold text-emerald-700 underline" onClick={() => dispatchInterviewCommand({ type: "set_expense_mode", mode: "guided" })}>
          {t("expenses.useGuided")}
        </button>
        <div className="mt-7 max-w-md">
          <MoneyField
            label={t("expenses.currentTotal")}
            currency={currency}
            value={model.quickExpenses.current_monthly_cents}
            onChange={(value) =>
              dispatchInterviewCommand({
                type: "set_quick_expenses",
                patch: { current_monthly_cents: value, confidence: "confirmed" },
              })
            }
          />
        </div>
      </>
    );
  return (
    <>
      {title}
      <div className="mt-6 rounded-2xl border bg-slate-50 p-4 dark:bg-white/5">
        <MoneyField
          label={t("expenses.currentTotal")}
          currency={currency}
          value={model.totals.current}
          help={t("expenses.totalSwitchHelp")}
          onChange={(value) =>
            dispatchInterviewCommand({
              type: "set_quick_expenses",
              patch: { current_monthly_cents: value, confidence: "confirmed" },
            })
          }
        />
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-sm font-medium">{t("expenses.runningTotal", { amount: formatCents(model.totals.current, locale, currency) })}</p>
        <button className="text-sm font-semibold text-emerald-700 underline" onClick={() => dispatchInterviewCommand({ type: "set_expense_mode", mode: "quick" })}>
          {t("expenses.useTotals")}
        </button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {model.categories.map((progress) => {
          const { category } = progress;
          return (
            <button key={category} onClick={() => onOpen(category)} className="flex min-h-24 items-center justify-between gap-4 rounded-2xl border p-4 text-left transition hover:border-emerald-400">
              <div>
                <p className="font-semibold">{t(`expenseCategories.${category}`)}</p>
                <p className="mt-1 text-xs text-slate-500">{progress.completed ? t("expenses.complete") : t("expenses.notStarted")}</p>
              </div>
              <span className="font-medium">{formatCents(progress.currentMonthlyCents, locale, currency)}</span>
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
  model,
  dispatchInterviewCommand,
}: {
  category: ExpenseCategory;
  t: ReturnType<typeof useTranslations>;
  model: HouseholdRunwayExpensesRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
}) {
  const currency = model.location.currency ?? "USD";
  const subtotal = model.categorySubtotals[category] ?? {
    current_monthly_cents: 0,
    interruption_monthly_cents: 0,
    confidence: "skipped" as const,
  };
  const housingTypes: ExpenseItemType[] =
    model.housingTenure === "own"
      ? ["mortgage", "property_tax", "homeowners_insurance", "hoa", "home_maintenance"]
      : model.housingTenure === "rent"
        ? ["rent", "renters_insurance", "building_parking"]
        : ["other_housing"];
  const types: readonly ExpenseItemType[] = category === "housing" ? housingTypes : EXPENSE_ITEM_TYPES[category];
  const updateItem = (type: ExpenseItemType, patch: Partial<ExpenseLineItem>) => {
    const existing = model.expenseItems.find(
      (item) => item.category === category && item.type === type,
    );
    dispatchInterviewCommand({
      type: "set_expense_item",
      category,
      itemType: type,
      itemId: existing?.id ?? `expense-${category}-${type}`,
      patch,
    });
  };
  return (
    <>
      <h1 id="runway-question-heading" tabIndex={-1} className="font-display text-3xl font-semibold tracking-[-.035em] outline-none sm:text-4xl">
        {t(`expenseCategories.${category}`)}
      </h1>
      <p className="mt-3 text-slate-500">{t(`expenses.categoryHelp.${category}`)}</p>
      <div className="mt-6 rounded-2xl border p-4">
        <MoneyField
          label={t("expenses.categoryTotal")}
          currency={currency}
          value={subtotal.current_monthly_cents}
          onChange={(value) =>
            dispatchInterviewCommand({
              type: "set_expense_category_subtotal",
              category,
              patch: {
                current_monthly_cents: value,
                interruption_monthly_cents:
                  subtotal.interruption_monthly_cents || value,
                confidence: "confirmed",
              },
            })
          }
        />
        <details
          className="mt-4 max-h-[55vh] overflow-auto rounded-xl border p-3"
          onToggle={(event) => {
            if ((event.currentTarget as HTMLDetailsElement).open) {
              dispatchInterviewCommand({
                type: "set_expense_category_mode",
                category,
                mode: "itemized",
              });
            }
          }}
        >
          <summary className="cursor-pointer font-semibold">{t("expenses.itemizeInstead")}</summary>
      {category === "housing" ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {(["rent", "own", "other"] as const).map((tenure) => (
            <ChoiceCard
              key={tenure}
              selected={model.housingTenure === tenure}
              title={t(`expenses.tenure.${tenure}`)}
              onClick={() =>
                dispatchInterviewCommand({
                  type: "set_housing_tenure",
                  tenure,
                })
              }
            />
          ))}
        </div>
      ) : null}
      {category === "housing" && model.housingTenure === "own" ? (
        <InfoBox>{t("expenses.escrowWarning")}</InfoBox>
      ) : null}
      {category !== "housing" || model.housingTenure ? (
        <div className="mt-6 space-y-4">
          {types.map((type) => {
            const item = model.expenseItems.find((candidate) => candidate.category === category && candidate.type === type);
            return (
              <div key={type} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_170px]">
                <MoneyField label={t(`expenseItems.${type}`)} currency={currency} value={item?.current_amount_cents ?? 0} onChange={(value) => updateItem(type, { current_amount_cents: value, confidence: "confirmed" })} />
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
  model,
  dispatchInterviewCommand,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  model: HouseholdRunwayReductionsRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
}) {
  const currency = model.location.currency ?? "USD";
  return (
    <>
      {title}
      <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 dark:bg-white/5">
        <SummaryValue label={t("expenses.currentTotal")} value={formatCents(model.totals.current, locale, currency)} />
        <SummaryValue label={t("expenses.afterInterruption")} value={formatCents(model.totals.interruption, locale, currency)} />
      </div>
      <div className="mt-5 space-y-3">
        {model.mode === "quick" ? (
          <div className="rounded-2xl border p-4">
            <MoneyField
              label={t("expenses.afterInterruption")}
              currency={currency}
              value={model.quickExpenses.interruption_monthly_cents}
              onChange={(value) =>
                dispatchInterviewCommand({
                  type: "set_reduction",
                  target: { kind: "quick" },
                  interruptionMonthlyCents: value,
                })
              }
            />
          </div>
        ) : null}
        {model.mode === "guided"
          ? Object.entries(model.categorySubtotals)
              .filter(
                ([category, subtotal]) =>
                  model.categoryModes[category as ExpenseCategory] === "subtotal" &&
                  (subtotal?.current_monthly_cents ?? 0) > 0,
              )
              .map(([category, subtotal]) => {
                if (!subtotal) return null;
                const expenseCategory = category as ExpenseCategory;
                return (
                  <div key={category} className="grid items-end gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_220px]">
                    <div>
                      <p className="font-medium">{t(`expenseCategories.${category}`)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatCents(subtotal.current_monthly_cents, locale, currency)}</p>
                    </div>
                    <MoneyField
                      label={t("expenses.afterInterruption")}
                      currency={currency}
                      value={subtotal.interruption_monthly_cents}
                      onChange={(value) =>
                        dispatchInterviewCommand({
                          type: "set_reduction",
                          target: { kind: "category", category: expenseCategory },
                          interruptionMonthlyCents: value,
                        })
                      }
                    />
                  </div>
                );
              })
          : null}
        {model.expenseItems
          .filter(
            (item) =>
              model.categoryModes[item.category] === "itemized" &&
              item.current_amount_cents > 0,
          )
          .map((item) => (
          <div key={item.id} className="grid items-end gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_220px]">
            <div>
              <p className="font-medium">{t(`expenseItems.${item.type}`)}</p>
              <p className="mt-1 text-xs text-slate-500">{t("expenses.currentEntered", { amount: formatCents(item.current_amount_cents, locale, currency), frequency: t(`expenses.frequencies.${item.frequency}`) })}</p>
            </div>
            <MoneyField
              label={t("expenses.afterInterruption")}
              currency={currency}
              value={item.interruption_amount_cents}
              onChange={(value) =>
                dispatchInterviewCommand({
                  type: "set_reduction",
                  target: { kind: "item", itemId: item.id },
                  interruptionMonthlyCents: value,
                })
              }
            />
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
  model,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  model: HouseholdRunwayReviewRenderModel;
}) {
  const answers = runwayAnswersForPresentation(
    model.answers as unknown as HouseholdRunwayAnswers,
  );
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
