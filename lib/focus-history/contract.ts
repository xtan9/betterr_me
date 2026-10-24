import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 256 * 1024;
const time = z.number().int().min(0).max(8_640_000_000_000_000);
export const historySourceSchema = z.object({
  id: z.string().uuid(), label: z.string().min(1).max(100).refine(value => value.trim().length > 0), platform: z.enum(['ios', 'macos', 'web']),
}).strict();
const sessionSchema = z.object({
  id: z.string().uuid(), startedAt: time, endedAt: time, completedRounds: z.number().int().min(0).max(1_000_000),
  settings: z.object({
    preset: z.enum(['quick', 'classic', 'deep', 'open', 'custom']),
    focusMinutes: z.number().int().min(1).max(240), shortBreakMinutes: z.number().int().min(1).max(120),
    longBreakMinutes: z.number().int().min(1).max(120), longBreakEvery: z.number().int().min(0).max(12),
  }).strict(),
  link: z.object({ kind: z.enum(['task', 'event']), id: z.string().min(1).max(200), title: z.string().max(1000), projectName: z.string().max(200).nullable() }).strict().nullable(),
  segments: z.array(z.object({ start: time, end: time }).strict()).max(2048),
}).strict().superRefine((session, context) => {
  let previous = session.startedAt;
  if (session.endedAt < previous) context.addIssue({ code: 'custom', message: 'Invalid session interval' });
  for (const segment of session.segments) {
    if (segment.start < previous || segment.end < segment.start || segment.end > session.endedAt) {
      context.addIssue({ code: 'custom', message: 'Invalid focus segment' });
    }
    previous = segment.end;
  }
});
export const historyEventSchema = z.object({
  id: z.string().uuid(), sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  kind: z.enum(['focus-session-completed', 'focus-session-baseline']),
  observedAt: time, appVersion: z.string().min(1).max(64), session: sessionSchema,
}).strict();
export const historyUploadSchema = z.object({
  schemaVersion: z.literal(1), source: historySourceSchema, events: z.array(historyEventSchema).min(1).max(25),
}).strict().superRefine(({ events }, context) => {
  if (new Set(events.map(event => event.id)).size !== events.length || new Set(events.map(event => event.sequence)).size !== events.length) {
    context.addIssue({ code: 'custom', message: 'Duplicate journal identity' });
  }
});
export type HistoryUpload = z.infer<typeof historyUploadSchema>;
export type HistoryEvent = z.infer<typeof historyEventSchema>;
export type HistorySource = z.infer<typeof historySourceSchema>;
export const acknowledgmentSchema = z.object({
  schemaVersion: z.literal(1), sourceId: z.string().uuid(),
  acceptedEventIds: z.array(z.string().uuid()).max(25), acknowledgedThrough: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();
export const storedHistoryItemSchema = z.object({
  position: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), source: historySourceSchema,
  event: historyEventSchema, receivedAt: time,
}).strict();
export type StoredHistoryItem = z.infer<typeof storedHistoryItemSchema>;
