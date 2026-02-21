import { z } from "zod";

const dailyRuleSchema = z.object({
  frequency: z.literal("daily"),
  interval: z.number().int().min(1).max(365),
});

const weeklyRuleSchema = z.object({
  frequency: z.literal("weekly"),
  interval: z.number().int().min(1).max(365),
  days_of_week: z.array(z.number().int().min(0).max(6)),
});

const monthlyByDateRuleSchema = z.object({
  frequency: z.literal("monthly"),
  interval: z.number().int().min(1).max(365),
  day_of_month: z.number().int().min(1).max(31),
});

const monthlyByWeekdayRuleSchema = z.object({
  frequency: z.literal("monthly"),
  interval: z.number().int().min(1).max(365),
  week_position: z.enum(["first", "second", "third", "fourth", "last"]),
  day_of_week_monthly: z.number().int().min(0).max(6),
});

const yearlyRuleSchema = z.object({
  frequency: z.literal("yearly"),
  interval: z.number().int().min(1).max(365),
  month_of_year: z.number().int().min(1).max(12),
  day_of_month: z.number().int().min(1).max(31),
});

export const recurrenceRuleSchema = z.union([
  dailyRuleSchema,
  weeklyRuleSchema,
  monthlyByDateRuleSchema,
  monthlyByWeekdayRuleSchema,
  yearlyRuleSchema,
]);

export const recurringTaskCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(100),
    description: z.string().max(500).optional().nullable(),
    priority: z
      .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
      .optional(),
    category: z
      .enum(["work", "personal", "shopping", "other"])
      .nullable()
      .optional(),
    due_time: z.string().nullable().optional(),
    recurrence_rule: recurrenceRuleSchema,
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
    end_type: z.enum(["never", "after_count", "on_date"]).default("never"),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    end_count: z.number().int().min(1).nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.end_type === "on_date" && !data.end_date) return false;
      if (data.end_type === "after_count" && !data.end_count) return false;
      return true;
    },
    {
      message:
        "end_date required for on_date, end_count required for after_count",
    },
  );

export type RecurringTaskCreateValues = z.infer<
  typeof recurringTaskCreateSchema
>;

export const recurringTaskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    priority: z
      .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
      .optional(),
    category: z
      .enum(["work", "personal", "shopping", "other"])
      .nullable()
      .optional(),
    due_time: z.string().nullable().optional(),
    recurrence_rule: recurrenceRuleSchema.optional(),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .optional(),
    end_type: z.enum(["never", "after_count", "on_date"]).optional(),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    end_count: z.number().int().min(1).nullable().optional(),
    status: z.enum(["active", "paused", "archived"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type RecurringTaskUpdateValues = z.infer<
  typeof recurringTaskUpdateSchema
>;

export const editScopeSchema = z.enum(["this", "following", "all"]);
export type EditScope = z.infer<typeof editScopeSchema>;
