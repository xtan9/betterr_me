"use client";

/** Interview navigation, storage consent, and resume presentation. */

import Link from "next/link";

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import { createPortal } from "react-dom";

import { LockKeyhole, ArrowLeft, Check, ArrowRight, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { LanguageSwitcher } from "@/components/language-switcher";

import { type RunwayStepId, type ExpenseCategory, RUNWAY_STEP_IDS } from "@/lib/finance/cushion";

import {
  HOUSEHOLD_RUNWAY_DRAFT_RETENTION_DAYS,
} from "@/lib/finance/household-runway-interview-runtime";

import type { HouseholdRunwayInterviewRenderModel } from "./household-runway-steps";

export function RunwayHeader({ t }: { t: ReturnType<typeof useTranslations> }) {
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

export function DraftStorageControl({
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
              days: HOUSEHOLD_RUNWAY_DRAFT_RETENTION_DAYS,
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

export function ResumeChoicePanel({
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

export function InterviewShell({
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
