import { z } from 'zod';
import { historySourceSchema } from '@/lib/focus-history/contract';

const count = z.number().int().min(0).max(1_000_000);
const sequence = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const time = z.number().int().min(0).max(8_640_000_000_000_000);
const day = z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid civil day');
const snapshot = z.object({
  label: z.string().min(1).max(100).refine(value => value.trim().length > 0).nullable(),
  day, dailyUnlocks: z.number().int().min(1).max(50), minutes: z.number().int().min(1).max(60),
  current: count, best: count, status: z.enum(['counting', 'paused', 'removed']),
  usedToday: count, overridesToday: count,
}).strict().refine(value => value.best >= value.current, 'Best cannot be less than current');
export const appLimitEventSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(), sequence: sequence.min(1), kind: z.enum(['app-limit-baseline', 'app-limit-change']),
  observedAt: time, appVersion: z.string().min(1).max(64), ruleId: z.string().uuid(),
  reason: z.enum(['baseline', 'limitCreated', 'limitChanged', 'labelChanged', 'dayAdvanced', 'authorizationUnavailable',
    'authorizationDenied', 'authorizationCheckFailed', 'accountChanged', 'signedOut', 'limitRemoved', 'limitRelaxed', 'extraUnlock', 'unlocked', 'resumed']),
  before: snapshot.nullable(), after: snapshot,
}).strict().superRefine((event, context) => {
  if ((event.kind === 'app-limit-baseline') !== (event.reason === 'baseline')
    || (event.before === null) !== ['baseline', 'limitCreated'].includes(event.reason)) {
    context.addIssue({ code: 'custom', message: 'Invalid baseline or change provenance' });
  }
});
export const appLimitUploadSchema = z.object({
  schemaVersion: z.literal(1), source: historySourceSchema, events: z.array(appLimitEventSchema).min(1).max(25),
}).strict().superRefine(({ events }, context) => {
  if (new Set(events.map(event => event.id.toLowerCase())).size !== events.length
    || new Set(events.map(event => event.sequence)).size !== events.length) {
    context.addIssue({ code: 'custom', message: 'Duplicate journal identity' });
  }
});
export const storedAppLimitItemSchema = z.object({
  position: sequence.min(1), source: historySourceSchema, event: appLimitEventSchema,
  receivedAt: time, acknowledgedThrough: sequence,
}).strict();
export type AppLimitUpload = z.infer<typeof appLimitUploadSchema>;
