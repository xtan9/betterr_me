export const MILESTONE_THRESHOLDS = [7, 14, 30, 50, 100, 200, 365] as const;

export type MilestoneThreshold = typeof MILESTONE_THRESHOLDS[number];

export function getNextMilestone(currentStreak: number): MilestoneThreshold | null {
  return MILESTONE_THRESHOLDS.find(m => m > currentStreak) ?? null;
}

export function isMilestoneStreak(streak: number): boolean {
  return (MILESTONE_THRESHOLDS as readonly number[]).includes(streak);
}

export function getDaysToNextMilestone(currentStreak: number): number | null {
  const next = getNextMilestone(currentStreak);
  return next ? next - currentStreak : null;
}
