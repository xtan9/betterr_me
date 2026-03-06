/**
 * Insight computation heuristics.
 *
 * Pure functions for detecting spending anomalies, subscription price changes,
 * goal progress deviations, and other contextual insights.
 *
 * All functions are pure: no DB calls, no side effects.
 * Insights are structured data objects (not raw text) for i18n rendering.
 */

import { format } from "date-fns";
import type {
  Insight,
  RecurringBill,
  GoalWithProjection,
} from "@/lib/db/types";

// ---------------------------------------------------------------------------
// generateInsightId
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic insight ID for dismiss tracking.
 * Period-scoped so dismissed insights resurface in new periods.
 *
 * @example generateInsightId("spending_anomaly", "Groceries", "2026-02") => "spending_anomaly:groceries:2026-02"
 */
export function generateInsightId(
  type: string,
  entity: string,
  period: string
): string {
  return `${type}:${entity.toLowerCase().replace(/\s+/g, "_")}:${period}`;
}

// ---------------------------------------------------------------------------
// computeSpendingAnomalies
// ---------------------------------------------------------------------------

/**
 * Detect spending anomalies by comparing current month spending per category
 * against historical averages.
 *
 * Produces an insight for each category where spending differs by >= 15%.
 * - Overspending (percent_change > 0) -> severity: "attention"
 * - Underspending (percent_change < 0) -> severity: "positive"
 */
export function computeSpendingAnomalies(
  currentMonthSpending: { category_name: string; amount_cents: number }[],
  historicalAverage: { category_name: string; avg_cents: number }[],
  currentMonth: string // "2026-02"
): Insight[] {
  const insights: Insight[] = [];

  // Build lookup for historical averages
  const avgByCategory = new Map<string, number>();
  for (const h of historicalAverage) {
    avgByCategory.set(h.category_name.toLowerCase(), h.avg_cents);
  }

  for (const current of currentMonthSpending) {
    const avg = avgByCategory.get(current.category_name.toLowerCase());
    if (!avg || avg === 0) continue; // No historical data to compare

    const percentChange = ((current.amount_cents - avg) / avg) * 100;

    if (Math.abs(percentChange) >= 15) {
      insights.push({
        id: generateInsightId(
          "spending_anomaly",
          current.category_name,
          currentMonth
        ),
        type: "spending_anomaly",
        page: "budgets",
        severity: percentChange > 0 ? "attention" : "positive",
        data: {
          category: current.category_name,
          percent_change: Math.round(percentChange),
          period: "3-month average",
        },
      });
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// computeSubscriptionAlerts
// ---------------------------------------------------------------------------

/**
 * Detect subscription/bill price changes by comparing current vs previous amounts.
 *
 * Produces an insight for each bill where:
 * - previous_amount_cents is not null
 * - previous_amount_cents !== amount_cents
 */
export function computeSubscriptionAlerts(
  bills: RecurringBill[]
): Insight[] {
  const insights: Insight[] = [];
  const currentMonth = format(new Date(), "yyyy-MM");

  for (const bill of bills) {
    if (
      bill.previous_amount_cents === null ||
      bill.previous_amount_cents === bill.amount_cents
    ) {
      continue;
    }

    // Both amounts are negative (outflows). Use absolute values for comparison.
    const oldAbs = Math.abs(bill.previous_amount_cents);
    const newAbs = Math.abs(bill.amount_cents);

    if (oldAbs === 0) continue;

    const percentChange = ((newAbs - oldAbs) / oldAbs) * 100;

    insights.push({
      id: generateInsightId(
        "subscription_increase",
        bill.name,
        currentMonth
      ),
      type: "subscription_increase",
      page: "bills",
      severity: "attention",
      data: {
        merchant: bill.name,
        old_amount_cents: bill.previous_amount_cents,
        new_amount_cents: bill.amount_cents,
        percent_change: Math.round(percentChange),
      },
    });
  }

  return insights;
}

// ---------------------------------------------------------------------------
// computeGoalInsights
// ---------------------------------------------------------------------------

/**
 * Generate insights for savings goals based on projection data.
 *
 * - "behind schedule": projected_date exists AND deadline exists AND projected > deadline
 * - "almost there": progress >= 90% of target
 */
export function computeGoalInsights(
  goals: GoalWithProjection[]
): Insight[] {
  const insights: Insight[] = [];
  const currentMonth = format(new Date(), "yyyy-MM");

  for (const goal of goals) {
    if (goal.status !== "active") continue;

    // Behind schedule check
    if (
      goal.projected_date &&
      goal.deadline &&
      goal.projected_date > goal.deadline
    ) {
      insights.push({
        id: generateInsightId("goal_progress", goal.id, currentMonth),
        type: "goal_progress",
        page: "goals",
        severity: "attention",
        data: {
          goal_name: goal.name,
          projected_date: goal.projected_date,
          deadline: goal.deadline,
          status: "behind",
        },
      });
      continue; // Don't add "almost there" if behind schedule
    }

    // Almost there check: compute progress inline from current_cents / target_cents
    if (goal.target_cents > 0) {
      const progress = (goal.current_cents / goal.target_cents) * 100;
      if (progress >= 90) {
        insights.push({
          id: generateInsightId("goal_progress", goal.id, currentMonth),
          type: "goal_progress",
          page: "goals",
          severity: "positive",
          data: {
            goal_name: goal.name,
            progress_percent: Math.round(progress),
            status: "almost_there",
          },
        });
      }
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// computeInsights
// ---------------------------------------------------------------------------

/** Severity sort order: attention first, then info, then positive. */
const SEVERITY_ORDER: Record<string, number> = {
  attention: 0,
  info: 1,
  positive: 2,
};

/** Maximum insights per page to avoid overwhelming the user. */
const MAX_PER_PAGE = 5;

/**
 * Merge all insight sources, filter out dismissed IDs, sort by severity,
 * and limit per page.
 */
export function computeInsights(params: {
  spendingAnomalies: Insight[];
  subscriptionAlerts: Insight[];
  goalInsights: Insight[];
  dismissedIds: Set<string>;
}): Insight[] {
  const {
    spendingAnomalies,
    subscriptionAlerts,
    goalInsights,
    dismissedIds,
  } = params;

  // Merge all insights
  const allInsights = [
    ...spendingAnomalies,
    ...subscriptionAlerts,
    ...goalInsights,
  ];

  // Filter out dismissed insights
  const activeInsights = allInsights.filter(
    (insight) => !dismissedIds.has(insight.id)
  );

  // Sort by severity (attention first)
  activeInsights.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 1) - (SEVERITY_ORDER[b.severity] ?? 1)
  );

  // Limit per page
  const byPage = new Map<string, Insight[]>();
  for (const insight of activeInsights) {
    if (!byPage.has(insight.page)) byPage.set(insight.page, []);
    const pageInsights = byPage.get(insight.page)!;
    if (pageInsights.length < MAX_PER_PAGE) {
      pageInsights.push(insight);
    }
  }

  // Flatten back to array (maintaining order within each page group)
  const result: Insight[] = [];
  for (const pageInsights of byPage.values()) {
    result.push(...pageInsights);
  }

  return result;
}
