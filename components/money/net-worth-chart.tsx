"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNetWorthHistory } from "@/lib/hooks/use-net-worth";
import { formatMoney } from "@/lib/money/arithmetic";
import type { ViewMode } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const PERIODS = ["1M", "3M", "6M", "1Y", "ALL"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABEL_KEYS: Record<Period, string> = {
  "1M": "period1M",
  "3M": "period3M",
  "6M": "period6M",
  "1Y": "period1Y",
  ALL: "periodAll",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatYAxis(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return `$${dollars.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}) {
  const t = useTranslations("money.netWorth");

  if (!active || !payload?.length) return null;

  const netWorth = payload.find((p) => p.dataKey === "total_cents");
  const assets = payload.find((p) => p.dataKey === "assets_cents");
  const liabilities = payload.find((p) => p.dataKey === "liabilities_cents");

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {netWorth && (
        <p className="tabular-nums text-[hsl(var(--money-sage))]">
          {t("netWorthLabel")}: {formatMoney(netWorth.value)}
        </p>
      )}
      {assets && (
        <p className="tabular-nums text-muted-foreground">
          {t("assets")}: {formatMoney(assets.value)}
        </p>
      )}
      {liabilities && (
        <p className="tabular-nums text-muted-foreground">
          {t("liabilities")}: {formatMoney(liabilities.value)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NetWorthChart({ view = "mine" }: { view?: ViewMode }) {
  const t = useTranslations("money.netWorth");
  const [period, setPeriod] = useState<Period>("6M");
  const { snapshots, isLoading, error } = useNetWorthHistory(period, view);

  // Check if we have assets/liabilities data
  const hasBreakdown = snapshots.some(
    (s) => s.assets_cents !== undefined && s.liabilities_cents !== undefined
  );

  return (
    <Card className="border-money-border bg-money-surface">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">
          {t("netWorthOverTime")}
        </CardTitle>

        {/* Period toggle */}
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <Button
              key={p}
              variant="ghost"
              size="sm"
              className={`h-7 px-2.5 text-xs ${
                period === p
                  ? "bg-[hsl(var(--money-sage))] text-white hover:bg-[hsl(var(--money-sage))] hover:text-white"
                  : "bg-muted hover:bg-muted/80"
              }`}
              onClick={() => setPeriod(p)}
            >
              {t(PERIOD_LABEL_KEYS[p])}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-destructive">{t("chartError")}</p>
          </div>
        )}

        {!error && isLoading && (
          <div className="flex h-[300px] items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-[hsl(var(--money-sage))]" />
          </div>
        )}

        {!error && !isLoading && snapshots.length === 0 && (
          <div className="flex h-[300px] flex-col items-center justify-center text-center">
            <TrendingUp className="size-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">{t("noData")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("noDataDescription")}
            </p>
          </div>
        )}

        {!error && !isLoading && snapshots.length > 0 && (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={snapshots}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--money-border))"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={formatYAxis}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={55}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Main net worth line */}
                <Line
                  type="monotone"
                  dataKey="total_cents"
                  name={t("netWorthLabel")}
                  stroke="hsl(var(--money-sage))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                {/* Optional dashed lines for assets and liabilities */}
                {hasBreakdown && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="assets_cents"
                      name={t("assets")}
                      stroke="hsl(var(--money-sage-light))"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="liabilities_cents"
                      name={t("liabilities")}
                      stroke="hsl(var(--money-caution))"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
