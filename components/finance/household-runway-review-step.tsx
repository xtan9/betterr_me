"use client";

/** Read-only review of Runtime-projected answers. */

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import { formatCents, type InputConfidence } from "@/lib/finance/cushion";

import { runwayRegionLabel } from "@/lib/finance/runway-regions";

import type {
  HouseholdRunwayInterviewRuntimeScreen,
} from "@/lib/finance/household-runway-interview-runtime";

type HouseholdRunwayReviewRenderModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "review" }
>;

export function ReviewStep({
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
  const location = model.location;
  const country = location.country ?? "US";
  const region = location.region ?? "";
  const currency = location.currency ?? "USD";
  return (
    <>
      {title}
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <ReviewRow label={t("review.location")} value={`${t(`countries.${country}`)} · ${runwayRegionLabel(country, region, locale) ?? t("confidence.needs_review")} · ${currency}`} status={location.kind === "complete" ? "confirmed" : "needs_review"} t={t} />
        <ReviewRow label={t("review.household")} value={t(model.household.adultCount === 2 ? "review.twoAdults" : "review.oneAdult")} status={model.household.confidence} t={t} />
        <ReviewRow label={t("review.cash")} value={formatCents(model.cash.cents, locale, currency)} status={model.cash.confidence} t={t} />
        <ReviewRow label={t("review.expenses")} value={`${formatCents(model.expenses.currentMonthlyCents, locale, currency)} → ${formatCents(model.expenses.interruptionMonthlyCents, locale, currency)}`} status={model.expenses.confidence} t={t} />
        <ReviewRow label={t("review.income")} value={formatCents(model.earnedIncome.monthlyCents, locale, currency)} status={model.earnedIncome.confidence} t={t} />
        <ReviewRow label={t("review.otherIncome")} value={formatCents(model.otherIncome.monthlyCents, locale, currency)} status={model.otherIncome.confidence} t={t} />
        <ReviewRow label={t("review.investments")} value={formatCents(model.liquidInvestments.cents, locale, currency)} status={model.liquidInvestments.confidence} t={t} />
        <ReviewRow label={t("review.lastResort")} value={formatCents(model.lastResortAssets.cents, locale, currency)} status={model.lastResortAssets.confidence} t={t} />
      </div>
    </>
  );
}

function ReviewRow({ label, value, status, t }: { label: string; value: string; status: InputConfidence | "complete"; t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
      <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-medium">{value}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] ${status === "confirmed" || status === "complete" ? "bg-emerald-100 text-emerald-700" : status === "estimated" || status === "needs_review" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{t(`confidence.${status}`)}</span>
    </div>
  );
}
