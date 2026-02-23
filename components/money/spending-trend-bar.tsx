"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money/arithmetic";

interface TrendDataPoint {
  month: string; // e.g., "Feb", "Mar"
  budget: number; // cents
  spent: number; // cents
}

interface SpendingTrendBarProps {
  data: TrendDataPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="tabular-nums"
          style={{ color: entry.color }}
        >
          {entry.name}: {formatMoney(entry.value)}
        </p>
      ))}
    </div>
  );
}

function formatYAxis(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1000) return `${(dollars / 1000).toFixed(0)}k`;
  return `${dollars.toFixed(0)}`;
}

export function SpendingTrendBar({ data }: SpendingTrendBarProps) {
  const t = useTranslations("money.budgets");

  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        {t("noSpendingData")}
      </div>
    );
  }

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--money-border))"
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar
            dataKey="budget"
            name={t("budgetVsSpent")}
            fill="hsl(var(--money-sage-light))"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="spent"
            name={t("spent")}
            fill="hsl(var(--money-sage))"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
