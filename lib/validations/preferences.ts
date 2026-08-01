import { z } from "zod";
import { WEIGHT_UNITS } from "@/lib/constants/enums";

const quietHoursTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();

export const preferencesSchema = z
  .object({
    date_format: z.string().min(1).max(50).optional(),
    week_start_day: z.union([z.literal(0), z.literal(1)]).optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
    weight_unit: z.enum(WEIGHT_UNITS).optional(),
    quiet_hours_start: quietHoursTimeSchema.optional(),
    quiet_hours_end: quietHoursTimeSchema.optional(),
    email_notifications_enabled: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one preference must be provided",
  });

export type PreferencesValues = z.infer<typeof preferencesSchema>;
