import { z } from "zod";

export const preferencesSchema = z
  .object({
    date_format: z.string().optional(),
    week_start_day: z.number().int().min(0).max(6).optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one preference must be provided",
  });

export type PreferencesValues = z.infer<typeof preferencesSchema>;
