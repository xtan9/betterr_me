"use client";

import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Target, Link2, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BudgetRing } from "@/components/money/budget-ring";
import { formatMoney } from "@/lib/money/arithmetic";
import type { SavingsGoal } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusColor = "green" | "yellow" | "red";

export interface GoalWithProjection extends SavingsGoal {
  projected_date: string | null;
  monthly_rate_cents: number;
  status_color: StatusColor;
}

interface GoalCardProps {
  goal: GoalWithProjection;
  onEdit: (goal: GoalWithProjection) => void;
  onContribute: (goalId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusToRingColor(status: StatusColor): string {
  switch (status) {
    case "green":
      return "hsl(var(--money-sage))";
    case "yellow":
      return "hsl(var(--money-amber))";
    case "red":
      return "hsl(var(--money-caution))";
  }
}

function statusToTextClass(status: StatusColor): string {
  switch (status) {
    case "green":
      return "text-[hsl(var(--money-sage))]";
    case "yellow":
      return "text-[hsl(var(--money-amber))]";
    case "red":
      return "text-[hsl(var(--money-caution))]";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalCard({ goal, onEdit, onContribute }: GoalCardProps) {
  const t = useTranslations("money.goals");

  const percent =
    goal.target_cents > 0
      ? Math.round((goal.current_cents / goal.target_cents) * 100)
      : 0;

  const projectionText = (() => {
    if (goal.status === "completed") return t("completed");
    if (!goal.projected_date && goal.monthly_rate_cents <= 0) return t("noProgress");
    if (goal.projected_date) {
      const date = format(new Date(goal.projected_date), "MMM yyyy");
      return goal.status_color === "green"
        ? t("onTrack", { date })
        : t("behindSchedule");
    }
    return t("noProgress");
  })();

  return (
    <Card
      className="border-money-border bg-money-surface transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
      onClick={() => onEdit(goal)}
    >
      <CardContent className="p-5">
        {/* Header: icon + name */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2 min-w-0">
            {goal.icon ? (
              <span className="text-xl shrink-0">{goal.icon}</span>
            ) : (
              <Target className="size-5 shrink-0 text-muted-foreground" />
            )}
            <h3 className="font-semibold truncate">{goal.name}</h3>
          </div>
          {goal.funding_type === "linked" && (
            <Badge variant="secondary" className="shrink-0 ml-2 text-xs">
              <Link2 className="size-3 mr-1" />
              {t("autoTracking")}
            </Badge>
          )}
        </div>

        {/* Progress ring + amounts */}
        <div className="flex items-center gap-4 mb-4">
          <BudgetRing
            percent={percent}
            size={72}
            strokeWidth={5}
            color={statusToRingColor(goal.status_color)}
          />
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold tabular-nums">
              {formatMoney(goal.current_cents)}
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {t("ofTarget", { target: formatMoney(goal.target_cents) })}
            </p>
            <p className="text-xs text-muted-foreground mt-1 tabular-nums">
              {percent}% {t("complete")}
            </p>
          </div>
        </div>

        {/* Projection */}
        <p className={`text-sm mb-3 ${statusToTextClass(goal.status_color)}`}>
          {projectionText}
        </p>

        {/* Deadline */}
        {goal.deadline && (
          <p className={`text-xs mb-3 ${statusToTextClass(goal.status_color)}`}>
            {t("dueDate", { date: format(new Date(goal.deadline), "MMM d, yyyy") })}
          </p>
        )}

        {/* Action button for manual goals */}
        {goal.funding_type === "manual" && goal.status !== "completed" && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              onContribute(goal.id);
            }}
          >
            <Plus className="size-3.5 mr-1" />
            {t("addFunds")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
