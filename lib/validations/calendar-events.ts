import { z } from "zod";
import { recurrenceRuleSchema } from "./recurring-task";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
const eventReminderSchema = z
  .object({
    reminder_type: z.enum(["relative", "absolute"]),
    relative_minutes: z.number().int().optional().nullable(),
    absolute_time: z
      .string()
      .datetime("Must be a valid ISO datetime")
      .optional()
      .nullable(),
    channels: z.array(z.enum(["push", "email"])).min(1),
  })
  .refine(
    (reminder) =>
      reminder.reminder_type !== "relative" ||
      reminder.relative_minutes != null,
    { message: "relative_minutes is required for relative reminders" },
  )
  .refine(
    (reminder) =>
      reminder.reminder_type !== "absolute" || Boolean(reminder.absolute_time),
    { message: "absolute_time is required for absolute reminders" },
  );

export const calendarEventCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().max(2000).optional().nullable(),
    start_date: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    start_time: z
      .string()
      .regex(timeRegex, "Must be HH:MM or HH:MM:SS")
      .nullable()
      .optional(),
    end_date: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    end_time: z
      .string()
      .regex(timeRegex, "Must be HH:MM or HH:MM:SS")
      .nullable()
      .optional(),
    location: z.string().max(500).optional().nullable(),
    color: z.string().max(50).optional().nullable(),
    category_id: z.string().uuid().nullable().optional(),
    is_recurring: z.boolean().optional().default(false),
    recurrence_rule: recurrenceRuleSchema.optional().nullable(),
    end_type: z
      .enum(["never", "after_count", "on_date"])
      .optional()
      .nullable(),
    end_date_recurrence: z
      .string()
      .regex(dateRegex, "Must be YYYY-MM-DD")
      .optional()
      .nullable(),
    end_count: z.number().int().min(1).max(500).optional().nullable(),
    recurring_event_id: z.string().uuid().optional().nullable(),
    original_date: z
      .string()
      .regex(dateRegex, "Must be YYYY-MM-DD")
      .optional()
      .nullable(),
    reminders: z.array(eventReminderSchema).optional().default([]),
  })
  .refine(
    (data) => {
      if (!data.start_time && data.end_time) return false;
      return true;
    },
    { message: "end_time cannot be set without start_time (all-day event)" },
  )
  .refine(
    (data) => {
      if (data.is_recurring && !data.recurrence_rule) return false;
      return true;
    },
    { message: "recurrence_rule is required when is_recurring is true" },
  )
  .refine(
    (data) => data.end_date >= data.start_date,
    { message: "end_date must be on or after start_date" },
  )
  .refine(
    (data) => {
      if (data.recurring_event_id && !data.original_date) return false;
      return true;
    },
    { message: "original_date is required when creating a recurring event exception" },
  );

export type CalendarEventCreateValues = z.infer<
  typeof calendarEventCreateSchema
>;

// Update schema uses PATCH semantics — cross-field refinements (end_time requires
// start_time, is_recurring requires recurrence_rule) are intentionally omitted because
// the server merges partial updates with the existing record.
export const calendarEventUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional().nullable(),
    start_date: z
      .string()
      .regex(dateRegex, "Must be YYYY-MM-DD")
      .optional(),
    start_time: z
      .string()
      .regex(timeRegex, "Must be HH:MM or HH:MM:SS")
      .nullable()
      .optional(),
    end_date: z
      .string()
      .regex(dateRegex, "Must be YYYY-MM-DD")
      .optional(),
    end_time: z
      .string()
      .regex(timeRegex, "Must be HH:MM or HH:MM:SS")
      .nullable()
      .optional(),
    location: z.string().max(500).optional().nullable(),
    color: z.string().max(50).optional().nullable(),
    category_id: z.string().uuid().nullable().optional(),
    is_recurring: z.boolean().optional(),
    recurrence_rule: recurrenceRuleSchema.optional().nullable(),
    end_type: z
      .enum(["never", "after_count", "on_date"])
      .optional()
      .nullable(),
    end_date_recurrence: z
      .string()
      .regex(dateRegex, "Must be YYYY-MM-DD")
      .optional()
      .nullable(),
    end_count: z.number().int().min(1).max(500).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type CalendarEventUpdateValues = z.infer<
  typeof calendarEventUpdateSchema
>;
