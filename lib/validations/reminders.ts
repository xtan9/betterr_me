import { z } from "zod";

const channelSchema = z.enum(["push", "email"]);

export const reminderCreateSchema = z
  .object({
    source_type: z.enum(["calendar_event", "task", "habit"]),
    source_id: z.string().uuid("source_id must be a valid UUID"),
    reminder_type: z.enum(["relative", "absolute"]),
    relative_minutes: z.number().int().optional().nullable(),
    absolute_time: z
      .string()
      .datetime("Must be a valid ISO datetime")
      .optional()
      .nullable(),
    channels: z.array(channelSchema).min(1, "At least one channel is required"),
  })
  .refine(
    (data) => {
      if (
        data.reminder_type === "relative" &&
        (data.relative_minutes === null || data.relative_minutes === undefined)
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "relative_minutes is required when reminder_type is 'relative'",
    },
  )
  .refine(
    (data) => {
      if (data.reminder_type === "absolute" && !data.absolute_time) {
        return false;
      }
      return true;
    },
    {
      message:
        "absolute_time is required when reminder_type is 'absolute'",
    },
  );

export type ReminderCreateValues = z.infer<typeof reminderCreateSchema>;

export const reminderUpdateSchema = z
  .object({
    status: z.enum(["pending", "sent", "failed", "snoozed"]).optional(),
    fire_at: z.string().datetime().optional(),
    sent_at: z.string().datetime().nullable().optional(),
    channels: z.array(channelSchema).min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type ReminderUpdateValues = z.infer<typeof reminderUpdateSchema>;
