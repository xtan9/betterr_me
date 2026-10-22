"use client";

/** Composes the Household Runway Runtime with its localized screens. */

import { useRef, useCallback, useEffect } from "react";

import { useTranslations, useLocale } from "next-intl";

import { HouseholdRunwayLanding } from "@/components/finance/household-runway-landing";

import { ResultExperience } from "@/components/finance/household-runway-result";

import {
  type HouseholdRunwayAnswers,
  type RunwaySnapshotSummary,
  formatCents,
  type RunwayStepId,
} from "@/lib/finance/cushion";

import { normalizeRunwayLocale, runwayRegionLabel } from "@/lib/finance/runway-regions";

import type {
  HouseholdRunwayInterviewIntent,
} from "@/lib/finance/household-runway-interview-runtime";

import type {
  HouseholdRunwayBrowserReportPresentation,
} from "@/lib/finance/household-runway-browser-adapter";

import { useHouseholdRunwayRuntime } from "@/lib/finance/household-runway-react-adapter";

import {
  RunwayHeader,
  DraftStorageControl,
  ResumeChoicePanel,
  InterviewShell,
} from "./household-runway-shell";

import { StepContent } from "./household-runway-steps";

interface HouseholdRunwayProps {
  initialAnswers: HouseholdRunwayAnswers | null;
  initialPlanRevision?: number;
  isAuthenticated: boolean;
  hasSavedPlan: boolean;
  initialSnapshots: RunwaySnapshotSummary[];
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
  const reportPresentationRef = useRef<HouseholdRunwayBrowserReportPresentation | null>(null);
  const reportPresentation = useCallback(({ country, region, currency, locale: reportLocale }: Parameters<HouseholdRunwayBrowserReportPresentation>[0]): ReturnType<HouseholdRunwayBrowserReportPresentation> => {
    return {
      location: `${country} · ${runwayRegionLabel(country, region, reportLocale) ?? region}`,
      formatMoney: (cents) =>
        formatCents(cents, reportLocale, currency),
      formatScenario: (scenario) => t(`scenarios.${scenario}`),
      formatSimulation: (simulation) =>
        simulation.sustainable
          ? t("comparison.sustainable")
          : `${(simulation.monthsCovered ?? 0).toFixed(1)} ${t("whatIf.months")}`,
      formatCashTarget: (months, cents) =>
        `${t("actionsPlan.cashTarget", { months })}: ${formatCents(cents, reportLocale, currency)}`,
      formatLargestReduction: (category, cents) =>
        `${t("actionsPlan.largest")}: ${t(`expenseCategories.${category}`)} (${formatCents(cents, reportLocale, currency)})`,
      precisionAdvice: (notice) => {
        switch (notice) {
          case "cashNotConfirmed":
            return t("precision.cash");
          case "takeHomeEstimated":
            return t("precision.takeHome");
          case "quickExpenses":
            return t("precision.expenses");
          case "coreInputsComplete":
            return t("precision.complete");
        }
      },
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
        action === "discard_work" || action === "clear_draft"
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
  const draftSyncOperation = snapshot.operations.draftSynchronization;
  const draftSyncState =
    draftSyncOperation.status === "failed"
      ? "failed"
      : draftSyncOperation.status === "pending"
        ? "pending"
        : snapshot.draft.synchronized
          ? "synchronized"
          : "idle";
  const planOperation = snapshot.operations.planPersistence;
  const planCurrentState = snapshot.plan.current ? "true" : "false";
  const saving = planOperation.status === "pending";
  const saved = snapshot.plan.current;
  const issue = snapshot.issues[0]?.code;
  const error =
    issue === "currency_change_confirmation_required" &&
    renderModel.kind === "location" &&
    renderModel.pendingCurrencyChange
      ? ""
      : issue
        ? interviewValidationMessage(t, issue)
        : "";
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
  const dispatchInterviewCommand = useCallback(
    (intent: HouseholdRunwayInterviewIntent) => send(intent),
    [send],
  );

  const landingModel = renderModel.kind === "landing" ? renderModel : null;
  const resumeModel = renderModel.kind === "resume_choice" ? renderModel : null;
  const resultModel = renderModel.kind === "result" ? renderModel : null;
  const showLanding = hydrated && !isAuthenticated && landingModel !== null;

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
  const next = () => dispatchInterviewCommand({ type: "continue" });
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
          data-runway-plan-operation={planOperation.status}
          data-runway-plan-current={planCurrentState}
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
          ) : resultModel ? (
            <ResultExperience
              t={t}
              locale={locale}
              model={resultModel}
              dispatch={(input) => {
                dispatchInterviewCommand(input);
              }}
              onStartNew={startNewInterview}
              onDiscardDraft={clearDraft}
              onRegistrationClick={() =>
                dispatchInterviewCommand({ type: "registration_clicked" })
              }
              onDownload={download}
              isAuthenticated={isAuthenticated}
              saved={saved}
              saving={saving}
              onSave={savePlan}
              error={error || operationError}
            />
          ) : (
            <InterviewShell
              t={t}
              stepId={stepId}
              renderKind={renderModel.kind}
              error={error || operationError}
              activeExpenseCategory={activeExpenseCategory}
              onBack={() => {
                dispatchInterviewCommand({ type: "back" });
              }}
              onSkip={snapshot.actions.skip.applicable ? skip : undefined}
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
