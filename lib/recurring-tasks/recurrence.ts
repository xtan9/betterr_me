import type { RecurrenceRule } from "@/lib/db/types";

export interface LocalDateRange {
  from: string;
  to: string;
}

export interface ScheduledDateCalculation {
  rule: RecurrenceRule;
  recurrenceAnchor: string;
  activationDate: string;
  range?: LocalDateRange;
  rangeStart?: string;
  rangeEnd?: string;
}

type DateParts = [year: number, month: number, day: number];

function parseDateParts(dateString: string): DateParts {
  const match = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) {
    throw new RangeError(`Invalid local date: ${dateString}`);
  }

  const parts: DateParts = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  if (!isValidLocalDate(dateString)) {
    throw new RangeError(`Invalid local date: ${dateString}`);
  }
  return parts;
}

function formatDateParts([year, month, day]: DateParts): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function toUtcDate([year, month, day]: DateParts): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function fromUtcDate(date: Date): string {
  return formatDateParts([
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  ]);
}

function dayNumber(dateString: string): number {
  return toUtcDate(parseDateParts(dateString)).getTime() / 86_400_000;
}

/** Compare two YYYY-MM-DD local dates without consulting process timezone. */
export function compareLocalDates(left: string, right: string): number {
  return dayNumber(left) - dayNumber(right);
}

/** Add calendar days to a local date using UTC only as a civil-date carrier. */
export function addLocalDays(dateString: string, days: number): string {
  const date = toUtcDate(parseDateParts(dateString));
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Local date is outside the supported calendar range");
  }
  return fromUtcDate(date);
}

export function daysBetween(start: string, end: string): number {
  return compareLocalDates(end, start);
}

export function isValidLocalDate(dateString: string): boolean {
  const match = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;

  const lastDay = new Date(0);
  lastDay.setUTCFullYear(year, month, 0);
  return Number.isFinite(lastDay.getTime())
    && lastDay.getUTCFullYear() === year
    && lastDay.getUTCMonth() + 1 === month
    && day <= lastDay.getUTCDate();
}

function daysInMonth(year: number, month: number): number {
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(year, month, 0);
  if (!Number.isFinite(lastDay.getTime())) {
    throw new RangeError("Local date is outside the supported calendar range");
  }
  return lastDay.getUTCDate();
}

function dayOfWeek(dateString: string): number {
  return toUtcDate(parseDateParts(dateString)).getUTCDay();
}

function monthIndex(dateString: string): number {
  const [year, month] = parseDateParts(dateString);
  return year * 12 + month - 1;
}

function dateForMonth(
  targetMonthIndex: number,
  requestedDay: number,
): string {
  const year = Math.floor(targetMonthIndex / 12);
  const month = (targetMonthIndex % 12) + 1;
  return formatDateParts([
    year,
    month,
    Math.min(requestedDay, daysInMonth(year, month)),
  ]);
}

function nthWeekdayOfMonth(
  targetMonthIndex: number,
  position: "first" | "second" | "third" | "fourth" | "last",
  wantedDayOfWeek: number,
): string {
  const year = Math.floor(targetMonthIndex / 12);
  const month = (targetMonthIndex % 12) + 1;
  const lastDay = daysInMonth(year, month);

  if (position === "last") {
    for (let day = lastDay; day >= 1; day -= 1) {
      const candidate = formatDateParts([year, month, day]);
      if (dayOfWeek(candidate) === wantedDayOfWeek) return candidate;
    }
  } else {
    const positionNumber = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
    }[position];
    let seen = 0;
    for (let day = 1; day <= lastDay; day += 1) {
      const candidate = formatDateParts([year, month, day]);
      if (dayOfWeek(candidate) !== wantedDayOfWeek) continue;
      seen += 1;
      if (seen === positionNumber) return candidate;
    }
  }

  throw new RangeError("Unable to resolve monthly weekday recurrence");
}

function maxLocalDate(left: string, right: string): string {
  return compareLocalDates(left, right) >= 0 ? left : right;
}

function nextPhaseIndex(
  firstPhase: number,
  interval: number,
  requestedPhase: number,
): number {
  if (requestedPhase <= firstPhase) return firstPhase;
  return firstPhase + Math.ceil((requestedPhase - firstPhase) / interval) * interval;
}

function validateRecurrenceRule(rule: RecurrenceRule): void {
  if (rule === null || typeof rule !== "object") {
    throw new RangeError("A recurrence rule is required");
  }
  if (!Number.isSafeInteger(rule.interval) || rule.interval < 1) {
    throw new RangeError("Recurrence interval must be a positive integer");
  }

  switch (rule.frequency) {
    case "daily":
      return;
    case "weekly":
      if (!Array.isArray(rule.days_of_week)
        || rule.days_of_week.some(
          (day) => !Number.isSafeInteger(day) || day < 0 || day > 6,
        )) {
        throw new RangeError("Weekly recurrence weekdays must be between 0 and 6");
      }
      return;
    case "monthly":
      if ("week_position" in rule) {
        if (!(["first", "second", "third", "fourth", "last"] as const)
          .includes(rule.week_position)
          || !Number.isSafeInteger(rule.day_of_week_monthly)
          || rule.day_of_week_monthly < 0
          || rule.day_of_week_monthly > 6) {
          throw new RangeError("Monthly weekday recurrence is invalid");
        }
      } else if (!Number.isSafeInteger(rule.day_of_month)
        || rule.day_of_month < 1
        || rule.day_of_month > 31) {
        throw new RangeError("Monthly recurrence day must be between 1 and 31");
      }
      return;
    case "yearly":
      if (!Number.isSafeInteger(rule.month_of_year)
        || rule.month_of_year < 1
        || rule.month_of_year > 12) {
        throw new RangeError("Yearly recurrence month must be between 1 and 12");
      }
      if (!Number.isSafeInteger(rule.day_of_month)
        || rule.day_of_month < 1
        || rule.day_of_month > 31) {
        throw new RangeError("Yearly recurrence day must be between 1 and 31");
      }
      return;
    default:
      throw new RangeError("Unsupported recurrence frequency");
  }
}

/**
 * Calculate scheduled local dates from a stable recurrence anchor.
 *
 * The anchor controls interval phase. Activation only controls the first date
 * that may be materialized, which lets a series resume without backfilling a
 * paused interval.
 */
export function calculateScheduledDates(
  input: ScheduledDateCalculation,
): string[] {
  const {
    rule,
    recurrenceAnchor,
    activationDate,
  } = input;
  const resolvedRange: LocalDateRange | undefined = input.range
    ?? (input.rangeStart && input.rangeEnd
      ? { from: input.rangeStart, to: input.rangeEnd }
      : undefined);
  if (!resolvedRange) {
    throw new RangeError("A recurrence range is required");
  }
  parseDateParts(recurrenceAnchor);
  parseDateParts(activationDate);
  parseDateParts(resolvedRange.from);
  parseDateParts(resolvedRange.to);
  validateRecurrenceRule(rule);
  if (compareLocalDates(resolvedRange.from, resolvedRange.to) > 0) return [];
  const lowerBound = maxLocalDate(resolvedRange.from, activationDate);
  if (compareLocalDates(lowerBound, resolvedRange.to) > 0) return [];

  const interval = rule.interval;

  const dates: string[] = [];
  const appendIfInRange = (candidate: string) => {
    if (
      compareLocalDates(candidate, recurrenceAnchor) >= 0
      && compareLocalDates(candidate, activationDate) >= 0
      && compareLocalDates(candidate, lowerBound) >= 0
      && compareLocalDates(candidate, resolvedRange.to) <= 0
    ) {
      dates.push(candidate);
    }
  };

  switch (rule.frequency) {
    case "daily": {
      const anchorToLower = Math.max(0, daysBetween(recurrenceAnchor, lowerBound));
      const initialOffset = Math.ceil(anchorToLower / interval) * interval;
      if (initialOffset > Math.max(0, daysBetween(recurrenceAnchor, resolvedRange.to))) {
        break;
      }
      let current = addLocalDays(recurrenceAnchor, initialOffset);
      while (compareLocalDates(current, resolvedRange.to) <= 0) {
        appendIfInRange(current);
        if (interval > daysBetween(current, resolvedRange.to)) break;
        current = addLocalDays(current, interval);
      }
      break;
    }

    case "weekly": {
      const anchorWeekStart = addLocalDays(
        recurrenceAnchor,
        -dayOfWeek(recurrenceAnchor),
      );
      const lowerWeekStart = addLocalDays(lowerBound, -dayOfWeek(lowerBound));
      const requestedWeek = Math.floor(
        daysBetween(anchorWeekStart, lowerWeekStart) / 7,
      );
      const rangeEndWeek = Math.floor(
        daysBetween(anchorWeekStart, resolvedRange.to) / 7,
      );
      let weekIndex = nextPhaseIndex(0, interval, requestedWeek);
      const uniqueDays = [...new Set(rule.days_of_week)].sort((a, b) => a - b);

      while (true) {
        if (weekIndex > rangeEndWeek) break;
        const weekStart = addLocalDays(anchorWeekStart, weekIndex * 7);
        if (compareLocalDates(weekStart, resolvedRange.to) > 0) break;
        for (const requestedDay of uniqueDays) {
          appendIfInRange(addLocalDays(weekStart, requestedDay));
        }
        if (interval > rangeEndWeek - weekIndex) break;
        weekIndex += interval;
      }
      dates.sort();
      break;
    }

    case "monthly": {
      const anchorMonth = monthIndex(recurrenceAnchor);
      const lowerMonth = monthIndex(lowerBound);
      const rangeEndMonth = monthIndex(resolvedRange.to);
      let targetMonth = nextPhaseIndex(
        anchorMonth,
        interval,
        Math.max(anchorMonth, lowerMonth),
      );

      while (true) {
        if (targetMonth > rangeEndMonth) break;
        const candidate = "week_position" in rule
          ? nthWeekdayOfMonth(
            targetMonth,
            rule.week_position,
            rule.day_of_week_monthly,
          )
          : dateForMonth(targetMonth, rule.day_of_month);
        if (compareLocalDates(candidate, resolvedRange.to) > 0) break;
        appendIfInRange(candidate);
        if (interval > rangeEndMonth - targetMonth) break;
        targetMonth += interval;
      }
      break;
    }

    case "yearly": {
      const [anchorYear] = parseDateParts(recurrenceAnchor);
      const [lowerYear] = parseDateParts(lowerBound);
      const [rangeEndYear] = parseDateParts(resolvedRange.to);
      let year = nextPhaseIndex(
        anchorYear,
        interval,
        Math.max(anchorYear, lowerYear),
      );

      while (true) {
        if (year > rangeEndYear) break;
        const targetMonthIndex = year * 12 + rule.month_of_year - 1;
        const candidate = dateForMonth(targetMonthIndex, rule.day_of_month);
        if (compareLocalDates(candidate, resolvedRange.to) > 0) break;
        appendIfInRange(candidate);
        if (interval > rangeEndYear - year) break;
        year += interval;
      }
      break;
    }

    default:
      throw new RangeError("Unsupported recurrence frequency");
  }

  return dates;
}

/**
 * Backwards-compatible adapter for the former helper.
 *
 * Four arguments use the supplied date as both anchor and activation. Five
 * arguments expose the lifecycle vocabulary explicitly:
 * (rule, recurrenceAnchor, activationDate, rangeStart, rangeEnd).
 */
export function getOccurrencesInRange(
  rule: RecurrenceRule,
  recurrenceAnchor: string,
  rangeStart: string,
  rangeEnd: string,
): string[];
export function getOccurrencesInRange(
  rule: RecurrenceRule,
  recurrenceAnchor: string,
  activationDate: string,
  rangeStart: string,
  rangeEnd: string,
): string[];
export function getOccurrencesInRange(
  rule: RecurrenceRule,
  recurrenceAnchor: string,
  thirdDate: string,
  fourthDate: string,
  fifthDate?: string,
): string[] {
  const activationDate = fifthDate === undefined ? recurrenceAnchor : thirdDate;
  const rangeStart = fifthDate === undefined ? thirdDate : fourthDate;
  const rangeEnd = fifthDate === undefined ? fourthDate : fifthDate;
  return calculateScheduledDates({
    rule,
    recurrenceAnchor,
    activationDate,
    range: { from: rangeStart, to: rangeEnd },
  });
}

export function getNextOccurrence(
  rule: RecurrenceRule,
  recurrenceAnchor: string,
  afterDate: string,
): string | null;
export function getNextOccurrence(
  rule: RecurrenceRule,
  recurrenceAnchor: string,
  activationDate: string,
  afterDate: string,
): string | null;
export function getNextOccurrence(
  rule: RecurrenceRule,
  recurrenceAnchor: string,
  thirdDate: string,
  fourthDate?: string,
): string | null {
  const activationDate = fourthDate === undefined ? recurrenceAnchor : thirdDate;
  const afterDate = fourthDate === undefined ? thirdDate : fourthDate;
  const nextDay = addLocalDays(afterDate, 1);
  const searchEnd = addLocalDays(afterDate, 731);
  return calculateScheduledDates({
    rule,
    recurrenceAnchor,
    activationDate,
    range: { from: nextDay, to: searchEnd },
  })[0] ?? null;
}

/**
 * Derive the user's wall-clock date from an injected instant and IANA zone.
 * This is intentionally separate from recurrence arithmetic: recurrence never
 * uses a timezone offset to advance a local date.
 */
export function getLocalDateInTimeZone(now: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const values = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const result = `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
  if (!isValidLocalDate(result)) {
    throw new RangeError(`Unable to derive a local date for timezone: ${timeZone}`);
  }
  return result;
}

type TranslateFn = (key: string, params?: Record<string, string | number | Date>) => string;

/**
 * Get the English ordinal category for a number.
 * Used as the ICU plural selector for ordinal suffixes.
 */
function ordinalCategory(n: number): "one" | "two" | "few" | "other" {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "other";
  if (mod10 === 1) return "one";
  if (mod10 === 2) return "two";
  if (mod10 === 3) return "few";
  return "other";
}

/**
 * Generate a localized human-readable description of a recurrence rule.
 * @param rule The recurrence rule to describe
 * @param t Translation function scoped to 'tasks' namespace (from useTranslations('tasks'))
 */
export function describeRecurrence(
  rule: RecurrenceRule,
  t: TranslateFn,
): string {
  const { interval } = rule;

  switch (rule.frequency) {
    case "daily":
      return interval === 1
        ? t("recurrence.describe.everyDay")
        : t("recurrence.describe.everyNDays", { interval });

    case "weekly": {
      const days = rule.days_of_week
        .map((d) => t(`recurrence.describe.dayName.${d}`))
        .join(", ");
      const prefix =
        interval === 1
          ? t("recurrence.describe.everyWeek")
          : t("recurrence.describe.everyNWeeks", { interval });
      return days
        ? t("recurrence.describe.weeklyOnDays", { prefix, days })
        : prefix;
    }

    case "monthly": {
      const prefix =
        interval === 1
          ? t("recurrence.describe.everyMonth")
          : t("recurrence.describe.everyNMonths", { interval });
      if ("week_position" in rule) {
        const position = t(
          `recurrence.describe.position.${rule.week_position}`,
        );
        const day = t(
          `recurrence.describe.dayName.${rule.day_of_week_monthly}`,
        );
        return t("recurrence.describe.monthlyOnWeekday", {
          prefix,
          position,
          day,
        });
      }
      const cat = ordinalCategory(rule.day_of_month);
      const ordinal = t(`recurrence.describe.ordinal_${cat}`, {
        n: rule.day_of_month,
      });
      return t("recurrence.describe.monthlyOnOrdinal", {
        prefix,
        ordinal,
      });
    }

    case "yearly": {
      const prefix =
        interval === 1
          ? t("recurrence.describe.everyYear")
          : t("recurrence.describe.everyNYears", { interval });
      const month = t(`recurrence.describe.monthName.${rule.month_of_year}`);
      return t("recurrence.describe.yearlyOnDate", {
        prefix,
        month,
        day: rule.day_of_month,
      });
    }
  }
}
