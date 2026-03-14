import { addMonths, differenceInDays, format } from "date-fns";
import type { SavingsGoal, GoalContribution, GoalWithProjection, StatusColor } from "@/lib/db/types";

export type { GoalWithProjection, StatusColor };

/**
 * Compute monthly savings rate from contributions over the last 3 months.
 * Returns 0 when there is no data.
 */
export function computeMonthlyRate(
  contributions: GoalContribution[]
): number {
  if (contributions.length === 0) return 0;

  const now = new Date();
  const threeMonthsAgo = addMonths(now, -3);

  const recentContribs = contributions.filter(
    (c) => new Date(c.contributed_at) >= threeMonthsAgo
  );

  if (recentContribs.length === 0) return 0;

  const totalCents = recentContribs.reduce(
    (sum, c) => sum + c.amount_cents,
    0
  );

  const earliest = new Date(
    Math.min(
      ...recentContribs.map((c) => new Date(c.contributed_at).getTime())
    )
  );
  const monthsWithData = Math.max(
    1,
    (now.getTime() - earliest.getTime()) / (30.44 * 24 * 60 * 60 * 1000)
  );

  return Math.round(totalCents / monthsWithData);
}

/**
 * Determine status color based on projected date vs deadline.
 * green = on track, yellow = slightly behind, red = significantly behind.
 */
export function getStatusColor(
  projectedDate: Date | null,
  deadline: string | null
): StatusColor {
  if (!deadline) return "green";
  if (!projectedDate) return "yellow";

  const deadlineDate = new Date(deadline);
  const daysLate = differenceInDays(projectedDate, deadlineDate);
  if (daysLate <= 0) return "green";
  if (daysLate <= 30) return "yellow";
  return "red";
}

/**
 * Add projection data to a single goal.
 */
export function computeProjection(
  goal: SavingsGoal,
  contributions: GoalContribution[]
): GoalWithProjection {
  const monthlyRate = computeMonthlyRate(contributions);

  let projectedDate: Date | null = null;

  if (monthlyRate > 0 && goal.current_cents < goal.target_cents) {
    const remaining = goal.target_cents - goal.current_cents;
    const monthsToGo = remaining / monthlyRate;
    projectedDate = addMonths(new Date(), Math.ceil(monthsToGo));
  } else if (goal.current_cents >= goal.target_cents) {
    projectedDate = new Date();
  }

  return {
    ...goal,
    projected_date: projectedDate
      ? format(projectedDate, "yyyy-MM-dd")
      : null,
    monthly_rate_cents: monthlyRate,
    status_color: getStatusColor(projectedDate, goal.deadline),
  };
}
