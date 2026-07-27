"use client";

import { useTranslations } from "next-intl";
import {
  formatCents,
  type HouseholdRunwayAnswers,
  type RunwaySimulation,
  type RunwaySnapshotSummary,
} from "@/lib/finance/cushion";

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-white/50">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
export function RunwayHistory({
  t,
  locale,
  snapshots,
}: {
  t: ReturnType<typeof useTranslations>;
  locale: string;
  snapshots: RunwaySnapshotSummary[];
}) {
  return (
    <section className="mt-6 rounded-3xl border bg-white p-6 dark:bg-white/5 sm:p-8">
      <h2 className="text-xl font-semibold">{t("history.title")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("history.description")}</p>
      <div className="mt-5 divide-y dark:divide-white/10">
        {snapshots.slice(0, 6).map((snapshot, index) => {
          const previous = snapshots[index + 1];
          const delta =
            previous && snapshot.months_covered !== null && previous.months_covered !== null
              ? snapshot.months_covered - previous.months_covered
              : null;
          return (
            <div key={snapshot.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
              <div>
                <p className="font-medium">
                  {snapshot.sustainable
                    ? t("comparison.sustainable")
                    : t("comparison.months", { months: (snapshot.months_covered ?? 0).toFixed(1) })}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(snapshot.created_at))}
                  {" · "}{t(`scenarios.${snapshot.scenario}`)}
                </p>
              </div>
              {delta !== null ? (
                <span className={delta >= 0 ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-amber-700"}>
                  {delta >= 0 ? "+" : ""}{delta.toFixed(1)} {t("whatIf.months")}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function BalanceChart({ t, locale, currency, simulation }: { t: ReturnType<typeof useTranslations>; locale: string; currency: HouseholdRunwayAnswers["currency"]; simulation: RunwaySimulation }) {
  const points = simulation.months;
  const sampled = points.some(
    (point, index) => index > 0 && point.month !== points[index - 1].month + 1,
  );
  const max = Math.max(1, simulation.starting_resources_cents, ...points.map((point) => point.opening_balance_cents));
  const line = [{ month: 0, value: simulation.starting_resources_cents }, ...points.map((point) => ({ month: point.month, value: point.closing_balance_cents }))];
  const width = 640;
  const height = 280;
  const margin = { left: 72, right: 16, top: 14, bottom: 38 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const lastMonth = Math.max(1, line.at(-1)?.month ?? 1);
  const x = (month: number) => margin.left + (month / lastMonth) * plotWidth;
  const y = (value: number) => margin.top + plotHeight - (value / max) * plotHeight;
  const path = line.map((point, index) => `${index ? "L" : "M"} ${x(point.month)} ${y(point.value)}`).join(" ");
  const xTicks = Array.from(new Set([0, Math.round(lastMonth / 2), lastMonth]));
  const yTicks = [0, Math.round(max / 2), max];
  return (
    <div className="rounded-3xl bg-[#0d2b20] p-6 text-white">
      <div className="grid grid-cols-3 gap-3 text-center"><SummaryValue label={t("result.resources")} value={formatCents(simulation.starting_resources_cents, locale, currency)} /><SummaryValue label={t("result.income")} value={formatCents(simulation.continuing_monthly_income_cents, locale, currency)} /><SummaryValue label={t("result.expenses")} value={formatCents(simulation.interruption_expenses_cents, locale, currency)} /></div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-5 h-64 w-full" role="img" aria-label={t("chart.aria")}>
        {yTicks.map((tick) => <g key={tick}><line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="white" opacity=".14" /><text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" fill="white" opacity=".72" fontSize="12">{formatCents(tick, locale, currency)}</text></g>)}
        <line x1={margin.left} x2={margin.left} y1={margin.top} y2={margin.top + plotHeight} stroke="white" opacity=".45" />
        <line x1={margin.left} x2={width - margin.right} y1={margin.top + plotHeight} y2={margin.top + plotHeight} stroke="white" opacity=".45" />
        {xTicks.map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={margin.top + plotHeight} y2={margin.top + plotHeight + 5} stroke="white" opacity=".6" /><text x={x(tick)} y={height - 10} textAnchor="middle" fill="white" opacity=".72" fontSize="12">{t("chart.monthTick", { month: tick })}</text></g>)}
        <path d={`${path} L ${x(lastMonth)} ${margin.top + plotHeight} L ${margin.left} ${margin.top + plotHeight} Z`} fill="#34d399" opacity=".15" /><path d={path} fill="none" stroke="#34d399" strokeWidth="5" vectorEffect="non-scaling-stroke" />
      </svg>
      <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70"><summary className="cursor-pointer font-medium text-white">{t(sampled ? "chart.checkpointTableTitle" : "chart.tableTitle")}</summary>{sampled ? <p className="mt-2">{t("chart.checkpointHelp")}</p> : null}<div className="mt-3 max-h-48 overflow-auto"><table className="w-full text-left"><thead><tr><th>{t("chart.month")}</th><th>{t("chart.inflows")}</th><th>{t("chart.outflows")}</th><th>{t("chart.closing")}</th></tr></thead><tbody>{points.map((month) => <tr key={month.month} className="border-t border-white/10"><td className="py-2">{month.month}</td><td>{formatCents(month.continuing_income_cents + month.one_time_funds_cents, locale, currency)}</td><td>{formatCents(month.essential_outflow_cents, locale, currency)}</td><td>{formatCents(month.closing_balance_cents, locale, currency)}</td></tr>)}</tbody></table></div></details>
    </div>
  );
}
