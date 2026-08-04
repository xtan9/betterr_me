"use client";

import { ArrowRight, CalendarClock, Eye, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HouseholdRunwayInterviewRuntimeScreen } from "@/lib/finance/household-runway-interview-runtime";

interface HouseholdRunwayLandingProps {
  t: (key: string, values?: Record<string, string | number>) => string;
  renderModel: Extract<
    HouseholdRunwayInterviewRuntimeScreen,
    { kind: "landing" }
  >;
  onPrimary: () => void;
  onStartOver: () => void;
}

export function HouseholdRunwayLanding({
  t,
  renderModel,
  onPrimary,
  onStartOver,
}: HouseholdRunwayLandingProps) {
  const { hasDraft, draftCompleted } = renderModel;
  const primaryKey = !hasDraft
    ? "landing.cta"
    : draftCompleted
      ? "landing.viewResult"
      : "landing.resume";

  return (
    <div className="overflow-hidden" data-interview-render={renderModel.kind}>
      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.22em] text-emerald-700 dark:text-emerald-400">
            {t("landing.eyebrow")}
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold tracking-[-.045em] sm:text-6xl sm:leading-[1.02]">
            {t("landing.title")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
            {t("landing.description")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button data-testid="runway-hero-cta" size="lg" onClick={onPrimary}>
              {t(primaryKey)}
              <ArrowRight />
            </Button>
            {hasDraft ? (
              <Button variant="ghost" size="lg" onClick={onStartOver}>
                {t(draftCompleted ? "landing.startNew" : "landing.startOver")}
              </Button>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            <span>{t("landing.fast")}</span>
            <span>{t("landing.noAccount")}</span>
            <span>{t("landing.local")}</span>
          </div>
        </div>

        <div
          className="rounded-[2rem] bg-[#0d2b20] p-6 text-white shadow-[0_35px_90px_-45px_rgba(13,43,32,.8)] sm:p-8"
          aria-label={t("landing.exampleAria")}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[.18em] text-emerald-300">
                {t("landing.example")}
              </p>
              <p className="mt-2 text-sm text-white/60">
                {t("landing.exampleScenario")}
              </p>
            </div>
            <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs text-emerald-200">
              {t("landing.explainable")}
            </span>
          </div>
          <p className="mt-8 font-display text-5xl font-semibold tracking-[-.05em]">
            {t("landing.fiveMonths")}
          </p>
          <p className="mt-2 text-sm text-white/60">
            {t("landing.exampleMath")}
          </p>
          <div className="mt-7 h-44 border-b border-white/10">
            <svg viewBox="0 0 520 170" className="h-full w-full" role="img">
              <title>{t("landing.exampleChart")}</title>
              <defs>
                <linearGradient id="landing-runway-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity=".35" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M10 25 L505 160 L505 170 L10 170 Z" fill="url(#landing-runway-fill)" />
              <path
                d="M10 25 L505 160"
                fill="none"
                stroke="#34d399"
                strokeWidth="5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <ExampleStat label={t("landing.cash")} value="$30,000" />
            <ExampleStat label={t("landing.costs")} value="$6,000" />
            <ExampleStat label={t("landing.income")} value="$0" />
          </div>
        </div>
      </section>

      <section className="border-y border-black/5 bg-white/60 dark:border-white/10 dark:bg-white/[.025]">
        <div className="mx-auto grid max-w-6xl gap-4 px-5 py-10 md:grid-cols-3">
          <Benefit icon={CalendarClock} title={t("landing.benefitRunway")} body={t("landing.benefitRunwayBody")} />
          <Benefit icon={Eye} title={t("landing.benefitWhy")} body={t("landing.benefitWhyBody")} />
          <Benefit icon={ShieldCheck} title={t("landing.benefitAction")} body={t("landing.benefitActionBody")} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 text-center">
        <p className="text-sm text-slate-500">{t("landing.disclaimer")}</p>
        <Button data-testid="runway-footer-cta" className="mt-6" onClick={onPrimary}>
          {t(primaryKey)}
          <ArrowRight />
        </Button>
      </section>
    </div>
  );
}

function ExampleStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-white/45">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Benefit({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof CalendarClock;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-white/5">
      <Icon className="h-5 w-5 text-emerald-600" />
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-300">{body}</p>
    </div>
  );
}
