"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GoalCard } from "@/components/money/goal-card";
import { GoalForm } from "@/components/money/goal-form";
import { useGoals } from "@/lib/hooks/use-goals";
import type { GoalWithProjection } from "@/components/money/goal-card";

export function GoalGrid() {
  const t = useTranslations("money.goals");
  const { goals, isLoading, mutate } = useGoals();

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | "contribute">("create");
  const [selectedGoal, setSelectedGoal] = useState<GoalWithProjection | null>(null);
  const [contributeGoalId, setContributeGoalId] = useState<string | null>(null);

  // Sort goals: active first (by deadline, then created_at), completed at bottom
  const sortedGoals = useMemo(() => {
    return [...goals].sort((a, b) => {
      // Completed at bottom
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;

      // Among active: goals with deadline first, sorted by deadline ascending
      if (a.deadline && !b.deadline) return -1;
      if (!a.deadline && b.deadline) return 1;
      if (a.deadline && b.deadline) {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }

      // Fall back to created_at descending (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [goals]);

  const handleEdit = (goal: GoalWithProjection) => {
    setSelectedGoal(goal);
    setFormMode("edit");
    setFormOpen(true);
  };

  const handleContribute = (goalId: string) => {
    setContributeGoalId(goalId);
    setFormMode("contribute");
    setFormOpen(true);
  };

  const handleCreate = () => {
    setSelectedGoal(null);
    setContributeGoalId(null);
    setFormMode("create");
    setFormOpen(true);
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    setSelectedGoal(null);
    setContributeGoalId(null);
    mutate();
  };

  const handleFormClose = (open: boolean) => {
    if (!open) {
      setFormOpen(false);
      setSelectedGoal(null);
      setContributeGoalId(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  // Empty state
  if (goals.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center rounded-xl border border-money-border bg-money-surface py-16 px-6 text-center">
          <Target className="size-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t("emptyHeading")}</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            {t("emptyDescription")}
          </p>
          <Button onClick={handleCreate}>
            <Plus className="size-4 mr-2" />
            {t("createGoal")}
          </Button>
        </div>
        <GoalForm
          mode={formMode}
          open={formOpen}
          onOpenChange={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      </>
    );
  }

  return (
    <>
      {/* Create button */}
      <div className="flex justify-end">
        <Button onClick={handleCreate}>
          <Plus className="size-4 mr-2" />
          {t("createGoal")}
        </Button>
      </div>

      {/* Goal cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedGoals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal as GoalWithProjection}
            onEdit={handleEdit}
            onContribute={handleContribute}
          />
        ))}
      </div>

      {/* Form dialog */}
      <GoalForm
        mode={formMode}
        goal={formMode === "edit" ? selectedGoal : undefined}
        contributeGoalId={formMode === "contribute" ? contributeGoalId : undefined}
        open={formOpen}
        onOpenChange={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    </>
  );
}
