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
import { BudgetRing } from "@/components/money/budget-ring";
import { BudgetForm } from "@/components/money/budget-form";
import { SpendingDonut } from "@/components/money/spending-donut";
import { SpendingTrendBar } from "@/components/money/spending-trend-bar";
import { CategoryDrillDown } from "@/components/money/category-drill-down";
import { RolloverPrompt } from "@/components/money/rollover-prompt";
import { useBudget } from "@/lib/hooks/use-budgets";
import { useHousehold } from "@/lib/hooks/use-household";
import { useSpendingTrends } from "@/lib/hooks/use-spending-analytics";
import { formatMoney } from "@/lib/money/arithmetic";
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

  // Overall progress
  const overallPercent =
    budget && budget.total_cents > 0
      ? Math.round((budget.total_spent_cents / budget.total_cents) * 100)
      : 0;
  const remaining =
    budget ? budget.total_cents - budget.total_spent_cents : 0;

  return (
    <div className="space-y-6">
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
        <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
          <ChevronLeft className="size-5" />
        </Button>
        <h2 className="text-lg font-semibold min-w-[140px] text-center">
          {format(currentDate, "MMMM yyyy")}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextMonth}
          disabled={!canGoForward}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
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
          <Card className="border-money-border bg-money-surface">
            <CardContent className="flex items-center gap-6 p-6">
              <BudgetRing percent={overallPercent} size={64} strokeWidth={5} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("totalBudget")}
                    </p>
                    <p className="text-2xl font-bold tabular-nums">
                      {formatMoney(budget.total_cents)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {remaining >= 0 ? t("remaining") : t("overBudget")}
                    </p>
                    <p
                      className={`text-lg font-semibold tabular-nums ${
                        remaining < 0
                          ? "text-[hsl(var(--money-caution))]"
                          : "text-[hsl(var(--money-sage))]"
                      }`}
                    >
                      {formatMoney(Math.abs(remaining))}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="tabular-nums">
                    {formatMoney(budget.total_spent_cents)} {t("spent")}
                  </span>
                  <span>({overallPercent}%)</span>
                </div>
              </div>
            </CardContent>
          </Card>

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {budget.categories.map((cat) => {
              const percent =
                cat.allocated_cents > 0
                  ? Math.round(
                      (cat.spent_cents / cat.allocated_cents) * 100
                    )
                  : 0;

              return (
                <Card
                  key={cat.category_id}
                  className="cursor-pointer border-money-border transition-colors hover:bg-accent"
                  onClick={() => setSelectedCategoryId(cat.category_id)}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <BudgetRing percent={percent} size={40} strokeWidth={3} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {cat.category_icon && (
                          <span className="text-sm">{cat.category_icon}</span>
                        )}
                        <p className="text-sm font-medium truncate">
                          {cat.category_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {formatMoney(cat.spent_cents)}
                        </span>
                        <span>/</span>
                        <span className="tabular-nums">
                          {formatMoney(cat.allocated_cents)}
                        </span>
                        {cat.rollover_cents !== 0 && (
                          <span className="tabular-nums">
                            {cat.rollover_cents > 0
                              ? ` + ${formatMoney(cat.rollover_cents)} rollover`
                              : ` - ${formatMoney(Math.abs(cat.rollover_cents))} debt`}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {percent}%
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Charts section */}
          <div className="grid gap-6 lg:grid-cols-2">
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
