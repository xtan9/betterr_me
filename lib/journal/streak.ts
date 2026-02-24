/**
 * Pure utility functions for journal streak computation and On This Day lookbacks.
 * No database or network calls — operates on date strings only.
 */

/**
 * Format a Date as YYYY-MM-DD using local date components.
 */
function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string into year, month (1-indexed), day numbers.
 */
function parseDateParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number);
  return [y, m, d];
}

/**
 * Compute a journal writing streak from a sorted-DESC array of date strings.
 *
 * Counts consecutive days backward from `today`. If today has no entry,
 * starts counting from yesterday. Returns 0 if neither today nor yesterday
 * has an entry.
 */
export function computeStreak(entryDates: string[], today: string): number {
  if (entryDates.length === 0) return 0;

  const dateSet = new Set(entryDates);
  const [y, m, d] = parseDateParts(today);

  // Determine starting point: today or yesterday
  let current: Date;
  if (dateSet.has(today)) {
    current = new Date(y, m - 1, d);
  } else {
    // Check yesterday
    const yesterday = new Date(y, m - 1, d - 1);
    const yesterdayStr = formatDate(yesterday);
    if (!dateSet.has(yesterdayStr)) return 0;
    current = yesterday;
  }

  let streak = 0;
  for (;;) {
    const currentStr = formatDate(current);
    if (!dateSet.has(currentStr)) break;
    streak++;
    // Move to previous day
    current = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() - 1
    );
  }

  return streak;
}

export interface LookbackDate {
  label: string;
  date: string;
}

/**
 * Compute fixed lookback dates for On This Day:
 * - 30 days ago
 * - 90 days ago
 * - 1 year ago
 */
export function getLookbackDates(date: string): LookbackDate[] {
  const [y, m, d] = parseDateParts(date);

  return [
    {
      label: "30_days_ago",
      date: formatDate(new Date(y, m - 1, d - 30)),
    },
    {
      label: "90_days_ago",
      date: formatDate(new Date(y, m - 1, d - 90)),
    },
    {
      label: "1_year_ago",
      date: formatDate(new Date(y - 1, m - 1, d)),
    },
  ];
}

/**
 * Return the period label for a given entry date relative to today.
 * Used to tag On This Day entries with their lookback period.
 * Returns empty string if the entry doesn't match any lookback date.
 */
export function getLookbackLabel(today: string, entryDate: string): string {
  const lookbacks = getLookbackDates(today);
  const match = lookbacks.find((lb) => lb.date === entryDate);
  return match?.label ?? "";
}
