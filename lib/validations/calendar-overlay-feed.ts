import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 86_400_000;
const MAX_RANGE_DAYS = 42;

function localDateMilliseconds(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const milliseconds = Date.UTC(year, month - 1, day);
  return new Date(milliseconds).toISOString().slice(0, 10) === value
    ? milliseconds
    : null;
}

export const calendarOverlayLocalDateSchema = z.string().refine(
  (value) => localDateMilliseconds(value) !== null,
  "invalid-date",
);

export const calendarOverlayRangeSchema = z.object({
  from: calendarOverlayLocalDateSchema,
  to: calendarOverlayLocalDateSchema,
}).strict().superRefine((range, context) => {
  const fromMilliseconds = localDateMilliseconds(range.from);
  const toMilliseconds = localDateMilliseconds(range.to);
  if (fromMilliseconds === null || toMilliseconds === null) return;

  const inclusiveDays =
    Math.floor((toMilliseconds - fromMilliseconds) / MILLISECONDS_PER_DAY) + 1;
  if (inclusiveDays < 1 || inclusiveDays > MAX_RANGE_DAYS) {
    context.addIssue({ code: "custom", message: "invalid-span" });
  }
});
