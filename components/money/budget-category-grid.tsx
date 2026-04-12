"use client";

import { Card, CardContent } from "@/components/ui/card";
import { BudgetRing } from "@/components/money/budget-ring";
import { formatMoney } from "@/lib/money/arithmetic";

interface BudgetCategory {
  category_id: string;
  category_name: string;
  category_icon: string | null;
  category_color: string | null;
  allocated_cents: number;
  spent_cents: number;
  rollover_cents: number;
}

interface BudgetCategoryGridProps {
  categories: BudgetCategory[];
  onCategoryClick: (categoryId: string) => void;
}

export function BudgetCategoryGrid({
  categories,
  onCategoryClick,
}: BudgetCategoryGridProps) {
  return (
    <div className="grid gap-card-gap sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((cat) => {
        const percent =
          cat.allocated_cents > 0
            ? Math.round((cat.spent_cents / cat.allocated_cents) * 100)
            : 0;

        return (
          <Card
            key={cat.category_id}
            className="cursor-pointer border-money-border transition-colors hover:bg-accent"
            onClick={() => onCategoryClick(cat.category_id)}
          >
            <CardContent className="flex items-center gap-3 p-card-padding">
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
  );
}
