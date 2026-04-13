"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  format,
  subMonths,
  addMonths,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BudgetForm } from "@/components/money/budget-form";
import { BudgetSummaryCard } from "@/components/money/budget-summary-card";
import { BudgetCategoryGrid } from "@/components/money/budget-category-grid";
import { SpendingDonut } from "@/components/money/spending-donut";
import { SpendingTrendBar } from "@/components/money/spending-trend-bar";
import { CategoryDrillDown } from "@/components/money/category-drill-down";
import { RolloverPrompt } from "@/components/money/rollover-prompt";
import { useBudget } from "@/lib/hooks/use-budgets";
import { useHousehold } from "@/lib/hooks/use-household";
import { useSpendingTrends } from "@/lib/hooks/use-spending-analytics";
import { HouseholdViewTabs } from "@/components/money/household-view-tabs";
import { InsightList } from "@/components/money/insight-list";

export function BudgetOverview() {
  const t = useTranslations("money.budgets");
  const { viewMode, setViewMode, isMultiMember } = useHousehold();
  const [currentDate, setCurrentDate] = useState(() => startOfMonth(new Date()));
  const currentMonth = format(currentDate, "yyyy-MM");

  const { budget, isLoading, mutate } = useBudget(currentMonth, viewMode);

  // Also fetch previous month budget to check for rollover
  const previousMonth = format(subMonths(currentDate, 1), "yyyy-MM");
  const { budget: previousBudget } = useBudget(previousMonth, viewMode);

  // Spending trends for bar chart
  const { trends } = useSpendingTrends(12, viewMode);

  // UI state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showRollover, setShowRollover] = useState(true);

  // Navigation — disable forward when already viewing the current month
  const now = startOfMonth(new Date());
  const canGoForward = currentDate < now;

  const goToPreviousMonth = () => {
    setCurrentDate((d) => subMonths(d, 1));
  };

  const goToNextMonth = () => {
    if (!canGoForward) return;
    setCurrentDate((d) => addMonths(d, 1));
  };

  // Computed data for donut chart
  const donutData = useMemo(() => {
    if (!budget) return [];
    return budget.categories
      .filter((c) => c.spent_cents > 0)
      .map((c) => ({
        categoryId: c.category_id,
        name: c.category_name,
        value: c.spent_cents,
        color: c.category_color || "#6b9080",
      }));
  }, [budget]);

  // Computed data for trend chart
  const trendData = useMemo(() => {
    return trends.map((trend) => ({
      month: format(new Date(`${trend.month}-01`), "MMM"),
      budget: trend.budget_total_cents || 0,
      spent: trend.total_cents,
    }));
  }, [trends]);

  // Selected category for drill-down
  const selectedCategory = budget?.categories.find(
    (c) => c.category_id === selectedCategoryId
  );

  // Should show rollover prompt?
  const shouldShowRollover =
    showRollover &&
    previousBudget?.rollover_enabled &&
    budget &&
    budget.categories.every((c) => c.rollover_cents === 0);

  // Delete budget handler
  const handleDelete = async () => {
    if (!budget) return;
    try {
      const res = await fetch(`/api/money/budgets/${budget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete budget");
      toast.success(t("deleted"));
      mutate();
    } catch {
      toast.error("Failed to delete budget");
    }
  };

  return (
    <div className="flex flex-col gap-section-gap">
      {/* Spending anomaly insights (AIML-01) */}
      <InsightList page="budgets" className="mb-4" />

      {/* Mine/Household tabs */}
      <HouseholdViewTabs
        value={viewMode}
        onValueChange={setViewMode}
        isMultiMember={isMultiMember}
      />

      {/* Month navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPreviousMonth}
          aria-label={t("previousMonth")}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <h2 className="text-section-heading min-w-[140px] text-center">
          {format(currentDate, "MMMM yyyy")}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextMonth}
          disabled={!canGoForward}
          aria-label={t("nextMonth")}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col gap-card-gap">
          <Skeleton className="h-32 w-full rounded-card" />
          <div className="grid gap-card-gap sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        </div>
      )}

      {/* No budget state */}
      {!isLoading && !budget && (
        <Card className="border-money-border bg-money-surface">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-muted-foreground">{t("noBudget")}</p>
            <Dialog modal={false} open={showCreateForm} onOpenChange={setShowCreateForm}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 size-4" />
                  {t("createBudget")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <BudgetForm
                  mode="create"
                  month={currentMonth}
                  onSuccess={() => {
                    setShowCreateForm(false);
                    mutate();
                  }}
                  onCancel={() => setShowCreateForm(false)}
                />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Budget exists */}
      {!isLoading && budget && (
        <>
          {/* Rollover prompt */}
          {shouldShowRollover && previousBudget && (
            <RolloverPrompt
              previousBudget={previousBudget}
              currentMonth={currentMonth}
              onConfirm={() => {
                setShowRollover(false);
                mutate();
              }}
              onDismiss={() => setShowRollover(false)}
            />
          )}

          {/* Budget summary card */}
          <BudgetSummaryCard totalCents={budget.total_cents} totalSpentCents={budget.total_spent_cents} />

          {/* Budget actions */}
          <div className="flex gap-2 justify-end">
            <Dialog modal={false} open={showEditForm} onOpenChange={setShowEditForm}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-1 size-3.5" />
                  {t("editBudget")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <BudgetForm
                  mode="edit"
                  budget={budget}
                  month={currentMonth}
                  onSuccess={() => {
                    setShowEditForm(false);
                    mutate();
                  }}
                  onCancel={() => setShowEditForm(false)}
                />
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash2 className="mr-1 size-3.5" />
                  {t("deleteBudget")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteBudget")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("deleteConfirm")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    {t("deleteBudget")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Category cards grid */}
          <BudgetCategoryGrid categories={budget.categories} onCategoryClick={setSelectedCategoryId} />

          {/* Charts section */}
          <div className="grid gap-section-gap lg:grid-cols-2">
            <Card className="border-money-border">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("spendingBreakdown")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SpendingDonut
                  data={donutData}
                  totalCents={budget.total_spent_cents}
                  onCategoryClick={setSelectedCategoryId}
                />
              </CardContent>
            </Card>

            <Card className="border-money-border">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("spendingTrends")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SpendingTrendBar data={trendData} />
              </CardContent>
            </Card>
          </div>

          {/* Category drill-down sheet */}
          {selectedCategory && (
            <CategoryDrillDown
              category={selectedCategory}
              month={currentMonth}
              open={!!selectedCategoryId}
              onOpenChange={(open) => {
                if (!open) setSelectedCategoryId(null);
              }}
              view={viewMode}
            />
          )}
        </>
      )}
    </div>
  );
}
