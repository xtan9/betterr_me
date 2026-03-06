"use client";

import { useTranslations } from "next-intl";
import {
  TrendingUp,
  CreditCard,
  Target,
  AlertCircle,
  CalendarCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Insight, InsightType, InsightSeverity } from "@/lib/db/types";

interface InsightCardProps {
  insight: Insight;
  onDismiss: (id: string) => void;
}

const ICON_MAP: Record<InsightType, typeof TrendingUp> = {
  spending_anomaly: TrendingUp,
  subscription_increase: CreditCard,
  goal_progress: Target,
  low_balance_warning: AlertCircle,
  bill_upcoming: CalendarCheck,
};

/**
 * Compact insight card with Calm Finance styling.
 * Uses anxiety-aware, progress-framing language (AIML-05).
 * Never says "overspent" or "danger" -- uses neutral progress framing.
 */
export function InsightCard({ insight, onDismiss }: InsightCardProps) {
  const t = useTranslations("money.insights");
  const Icon = ICON_MAP[insight.type];

  // Build the i18n message key from insight type and pass data params
  const message = getInsightMessage(t, insight);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-money-border bg-money-surface p-3",
        getSeverityBorderClass(insight.severity)
      )}
    >
      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        <Icon className="size-4 text-muted-foreground" />
      </div>

      {/* Message */}
      <p className="flex-1 text-sm text-foreground">{message}</p>

      {/* Dismiss */}
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        onClick={() => onDismiss(insight.id)}
        aria-label={t("dismiss")}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

function getSeverityBorderClass(severity: InsightSeverity): string {
  switch (severity) {
    case "attention":
      return "border-l-2 border-l-[hsl(var(--money-amber))]";
    case "positive":
      return "border-l-2 border-l-[hsl(var(--money-sage))]";
    case "info":
    default:
      return "";
  }
}

/**
 * Build an anxiety-aware insight message using i18n translation keys.
 * Falls back to a generic message if the key is missing.
 */
function getInsightMessage(
  t: ReturnType<typeof useTranslations>,
  insight: Insight
): string {
  const { type, data } = insight;

  switch (type) {
    case "spending_anomaly":
      return t("spendingAnomaly", {
        category: data.category ?? "",
        percent: data.percent_change ?? 0,
        period: data.period ?? "",
      });
    case "subscription_increase":
      return t("subscriptionIncrease", {
        name: data.name ?? "",
        oldAmount: data.old_amount ?? "",
        newAmount: data.new_amount ?? "",
      });
    case "goal_progress":
      return data.is_ahead === "true" || data.is_ahead === 1
        ? t("goalAhead", {
            name: data.name ?? "",
            percent: data.percent ?? 0,
          })
        : t("goalBehind", {
            name: data.name ?? "",
          });
    case "low_balance_warning":
      return t("lowBalance", {
        days: data.days ?? 0,
      });
    case "bill_upcoming":
      return t("billUpcoming", {
        name: data.name ?? "",
        amount: data.amount ?? "",
        days: data.days ?? 0,
      });
    default:
      return t("generic");
  }
}
