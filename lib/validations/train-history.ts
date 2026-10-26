import { z } from 'zod';
import { explicitInstant, recordedWorkoutSchema, recordedDay } from './workout-recording';
export const historyId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const historyInstant = z.string().refine(explicitInstant);
export const historyDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => explicitInstant(`${value}T00:00:00Z`));
export const historyRevision = z.string().regex(/^[1-9]\d{0,18}$/).refine(value => BigInt(value) <= BigInt('9223372036854775807'));
export const historyCursor = z.object({ day: historyDay, instant: historyInstant, id: historyId }).strict();
const rawObject = z.custom<Record<string, unknown>>(value => value !== null && typeof value === 'object' && !Array.isArray(value));
export const historyRecordSchema = z.object({ id: historyId, ownerId: historyId, revision: historyRevision,
  state: z.enum(['alive', 'deleted']), workoutDay: historyDay.nullable(), order: historyCursor,
  current: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('recorded'), document: recordedWorkoutSchema }).strict(),
    z.object({ kind: z.literal('legacy'), record: z.object({ workout: rawObject, exercises: z.array(rawObject) }).strict() }).strict(),
    z.object({ kind: z.literal('unsupported'), document: z.unknown() }).strict(),
  ]).nullable(),
}).strict().refine(row => row.order.id === row.id && (row.workoutDay === null || row.order.day === row.workoutDay) && (row.state === 'deleted' ? row.current === null : row.current !== null)
  && (row.current?.kind !== 'recorded' || row.current.document.id === row.id && row.current.document.ownerId === row.ownerId && recordedDay(row.current.document) === row.workoutDay)
  && (row.current?.kind !== 'legacy' || row.current.record.workout.id === row.id && row.current.record.workout.user_id === row.ownerId));
const whole = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const duration = z.discriminatedUnion('kind', [z.object({ kind: z.literal('keep') }).strict(), z.object({ kind: z.literal('unknown') }).strict(), z.object({ kind: z.literal('set'), seconds: whole }).strict()]);
const changes = z.object({ weightKg: z.number().finite().min(0).optional(), reps: whole.min(1).optional(), durationSeconds: whole.min(1).max(86400).optional(), kind: z.enum(['working','warmup']).optional() }).strict().refine(value => Object.keys(value).length > 0);
export const historyPatchSchema = z.object({
  sets: z.array(z.object({ entryId: historyId, setId: historyId, changes }).strict()).min(1).refine(values => new Set(values.map(value => value.setId)).size === values.length).optional(),
  time: z.union([
    z.object({ kind: z.literal('date-only'), workoutDay: historyDay.optional(), duration: duration.optional() }).strict(),
    z.object({ kind: z.literal('known-instants'), startedAt: historyInstant.optional(), completedAt: historyInstant.nullable().optional(), duration: z.union([duration,z.object({kind:z.literal('elapsed'),expectedSeconds:whole}).strict()]) }).strict(),
  ]).optional(),
}).strict().refine(value => value.sets !== undefined || value.time !== undefined);
export const historyRequestSchema = z.object({ protocolVersion: z.literal(1), ownerId: historyId, operationId: historyId, command: z.discriminatedUnion('kind',[
  z.object({ kind: z.literal('correct-workout'), workoutId: historyId, expectedRevision: historyRevision, patch: historyPatchSchema }).strict(),
  z.object({ kind: z.literal('delete-workout'), workoutId: historyId, expectedRevision: historyRevision }).strict(),
]) }).strict();
const identity = { operation: z.enum(['correct-workout','delete-workout']), operationId: historyId, ownerId: historyId, workoutId: historyId };
export const historyReceiptSchema = z.object({ ...identity, revision: historyRevision, acceptedAt: historyInstant, current: historyRecordSchema }).strict()
  .refine(value => value.current.id === value.workoutId && value.current.ownerId === value.ownerId && value.current.revision === value.revision && value.current.state === (value.operation === 'delete-workout' ? 'deleted' : 'alive'));
export const historyRejectionStatus = { version_conflict:409, deleted:409, not_found:404, invalid_correction:422 } as const;
export const historyRejectionSchema = z.object({ ...identity, rejectedAt: historyInstant, code: z.enum(['version_conflict','deleted','not_found','invalid_correction']), current: historyRecordSchema.optional() }).strict()
  .refine(value => ['version_conflict','deleted'].includes(value.code)
    ? value.current?.ownerId === value.ownerId && value.current.id === value.workoutId && (value.code !== 'deleted' || value.current.state === 'deleted') : value.current === undefined);
export const historyAcceptedSchema = z.object({ protocolVersion:z.literal(1),receipt:historyReceiptSchema }).strict();
export const historyRejectedSchema = z.object({ protocolVersion:z.literal(1),error:z.object({code:z.string()}).strict(),rejection:historyRejectionSchema }).strict().refine(value=>value.error.code===value.rejection.code);
export const historyListRequest = z.object({protocolVersion:z.literal(1),ownerId:historyId,before:historyCursor.nullable()}).strict();
export const historyPageSchema = z.object({protocolVersion:z.literal(1),ownerId:historyId,records:z.array(historyRecordSchema).max(20),nextCursor:historyCursor.nullable()}).strict();
export const historyDetailSchema = z.object({protocolVersion:z.literal(1),record:historyRecordSchema}).strict();
export const historyScopeSchema = z.object({from:historyDay.nullable(),through:historyDay.nullable()}).strict().refine(value=>value.from===null?value.through===null:value.through!==null&&value.from<=value.through);
export const historyProgressRequest = z.object({protocolVersion:z.literal(1),ownerId:historyId,scope:historyScopeSchema,retainedIds:z.array(historyId).refine(values=>new Set(values).size===values.length)}).strict();
export const historyProgressSchema = z.object({protocolVersion:z.literal(1),ownerId:historyId,scope:historyScopeSchema,records:z.array(historyRecordSchema),resolved:z.array(z.object({id:historyId,record:historyRecordSchema.nullable()}).strict()),coverage:z.object({complete:z.literal(true),workoutCount:whole,knownDurationCount:whole,unknownDurationCount:whole,knownDurationSeconds:z.string().regex(/^(0|[1-9]\d*)$/),undatedWorkoutCount:whole}).strict()}).strict();
export type HistoryRecord = z.infer<typeof historyRecordSchema>;
export type HistoryRequest = z.infer<typeof historyRequestSchema>;
export type HistoryPatch = z.infer<typeof historyPatchSchema>;
export type HistoryReceipt = z.infer<typeof historyReceiptSchema>;
export type HistoryRejection = z.infer<typeof historyRejectionSchema>;
export type HistoryPage = z.infer<typeof historyPageSchema>;
export type HistoryProgress = z.infer<typeof historyProgressSchema>;
export type HistoryScope = z.infer<typeof historyScopeSchema>;
export type HistoryCursor = z.infer<typeof historyCursor>;
