import { z } from 'zod';
import { explicitInstant } from './workout-recording';
export const planId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const planInstant = z.string().refine(explicitInstant);
export const planDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => explicitInstant(`${value}T00:00:00Z`));
export const planVersion = z.object({ taskVersion: planId.nullable(), occurrenceVersion: planId, seriesToken: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), eventVersion: planId.nullable() }).strict();
export const trainingPlan = z.object({ ownerId: planId, occurrenceId: planId, seriesId: planId, taskId: planId.nullable(), scheduledDate: planDay, plannedDay: planDay.nullable(), title: z.string(), timezone: z.string(), state: z.enum(['open', 'extra', 'completed', 'skipped', 'withdrawn']), completed: z.boolean(), templateId: planId.nullable(), version: planVersion }).strict();
export const workoutPlanLink = z.object({ ownerId: planId, workoutId: planId, occurrenceId: planId, linkedAt: planInstant, current: trainingPlan.nullable() }).strict().refine(value => value.current === null || value.current.ownerId === value.ownerId && value.current.occurrenceId === value.occurrenceId);
export const trainPlanRequest = z.object({ protocolVersion: z.literal(1), ownerId: planId, operationId: planId, command: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('link-workout'), workoutId: planId, occurrenceId: planId }).strict(),
        z.object({ kind: z.literal('fulfill-plan'), occurrenceId: planId, expected: planVersion }).strict(),
    ]) }).strict();
const evidence = { operationId: planId, ownerId: planId, occurrenceId: planId };
export const trainPlanReceipt = z.discriminatedUnion('operation', [
    z.object({ ...evidence, operation: z.literal('link-workout'), workoutId: planId, linkedAt: planInstant, acceptedAt: planInstant }).strict(),
    z.object({ ...evidence, operation: z.literal('fulfill-plan'), outcome: z.enum(['completed', 'already-completed']), changeId: planId.nullable(), completedAt: planInstant.nullable(), acceptedAt: planInstant }).strict(),
]).refine(value => value.operation !== 'fulfill-plan' || (value.outcome === 'completed' ? value.changeId !== null : value.changeId === null));
export const trainPlanRejection = z.object({ ...evidence, operation: z.enum(['link-workout', 'fulfill-plan']), workoutId: planId.optional(), rejectedAt: planInstant, code: z.enum(['changed', 'link_conflict', 'not_found', 'unavailable_occurrence', 'invalid_request']), current: trainingPlan.optional() }).strict().refine(value => (value.operation === 'link-workout') === (value.workoutId !== undefined) && (value.code === 'changed' ? value.current?.ownerId === value.ownerId && value.current?.occurrenceId === value.occurrenceId : value.current === undefined));
export const planRejectionStatus = { changed: 409, link_conflict: 409, not_found: 404, unavailable_occurrence: 409, invalid_request: 422 } as const;
export const planCursor = z.object({ startedAt: planInstant, id: planId }).strict();
export const trainDayRequest = z.object({ protocolVersion: z.literal(1), ownerId: planId, day: planDay, before: planCursor.nullable() }).strict();
