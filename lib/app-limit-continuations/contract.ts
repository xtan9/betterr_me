import { z } from 'zod';
import { historySourceSchema } from '@/lib/focus-history/contract';
import { appLimitSnapshotSchema } from '@/lib/app-limit-history/contract';
const uuid = z.string().uuid(), sequence = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const time = z.number().int().min(0).max(8_640_000_000_000_000);
const version = z.object({ eventId: uuid, sequence: sequence.min(1) }).strict();
const destination = z.object({ source: historySourceSchema, ruleId: uuid, expectedCheckpoint: sequence.max(Number.MAX_SAFE_INTEGER - 1),
  expectedRuleEvent: version.nullable(), applyEventId: uuid, label: z.string().min(1).max(100).refine(value => value.trim().length > 0).nullable(),
  dailyUnlocks: z.number().int().min(1).max(50), minutes: z.number().int().min(1).max(60),
}).strict();
export const continuationConfirmSchema = z.object({ schemaVersion: z.literal(1), operationId: uuid,
  source: z.object({ sourceId: uuid, ruleId: uuid, expectedCheckpoint: sequence.min(1), expectedEvent: version }).strict(), destination,
}).strict();
const latest = z.object({ version, snapshot: appLimitSnapshotSchema, observedAt: time, receivedAt: time }).strict();
export const continuationContextSchema = z.object({ schemaVersion: z.literal(1),
  source: z.object({ source: historySourceSchema, ruleId: uuid, acknowledgedThrough: sequence, maxReceivedSequence: sequence, latest: latest.nullable() }).strict().nullable(),
  destination: z.object({ sourceId: uuid, acknowledgedThrough: sequence, maxReceivedSequence: sequence,
    latestRule: z.object({ version, snapshot: appLimitSnapshotSchema }).strict().nullable() }).strict(),
  eligibility: z.object({ allowed: z.boolean(), reason: z.enum(['source-missing', 'source-incomplete', 'source-ended', 'destination-incomplete', 'destination-not-pristine']).nullable() }).strict(),
}).strict();
export const continuationReceiptSchema = z.object({ schemaVersion: z.literal(1), operationId: uuid, confirmedAt: time,
  source: z.object({ source: historySourceSchema, ruleId: uuid, checkpoint: sequence.min(1), event: version, snapshot: appLimitSnapshotSchema, observedAt: time, receivedAt: time }).strict(),
  destination, restored: z.object({ current: z.number().int().min(1).max(1_000_000), best: z.number().int().min(1).max(1_000_000) }).strict(),
}).strict().refine(value => value.restored.current === value.source.snapshot.current && value.restored.best === value.source.snapshot.best);
export const continuationReadSchema = z.object({ schemaVersion: z.literal(1), receipt: continuationReceiptSchema,
  application: z.discriminatedUnion('state', [z.object({ state: z.literal('awaiting-device') }).strict(),
    z.object({ state: z.literal('recorded'), eventId: uuid, sequence: sequence.min(1), receivedAt: time }).strict()]),
}).strict();
export const contextQuerySchema = z.object({ sourceId: uuid, sourceRuleId: uuid, destinationSourceId: uuid, destinationRuleId: uuid }).strict();
export const receiptQuerySchema = z.union([z.object({ operationId: uuid }).strict(), z.object({ destinationSourceId: uuid, applyEventId: uuid }).strict()]);
export type ContinuationConfirm = z.infer<typeof continuationConfirmSchema>;
