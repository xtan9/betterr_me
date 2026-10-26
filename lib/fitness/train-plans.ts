import { selectRecordedCompletion } from '@/lib/fitness/recorded-definition';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { log } from '@/lib/logger';
import { planDay, planId, planCursor, trainDayRequest, planRejectionStatus, trainPlanReceipt, trainPlanRejection, trainPlanRequest, trainingPlan, workoutPlanLink } from '@/lib/validations/train-plans';
export const trainPlanHeaders = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
export const trainPlanFailure = (code: string, status: number) => Response.json({ protocolVersion: 1, error: { code } }, { status, headers: trainPlanHeaders });
export function trainPlanUnavailable(classification: 'rpc_error' | 'invalid_rpc_response' | 'unexpected_exception') {
    log.error('[train] Plan request unavailable', undefined, { classification });
    return trainPlanFailure('unavailable', 503);
}
export async function executeTrainPlan(request: Request, client: SupabaseClient, ownerId: string) {
    let body: unknown;
    try {
        body = await request.json();
    }
    catch {
        return trainPlanFailure('invalid_request', 400);
    }
    const parsed = trainPlanRequest.safeParse(body);
    if (!parsed.success)
        return trainPlanFailure('invalid_request', 400);
    const input = parsed.data;
    if (input.ownerId !== ownerId)
        return trainPlanFailure('owner_mismatch', 403);
    const { data, error } = await client.rpc('execute_train_plan_command', { p_request: body });
    if (error)
        return trainPlanUnavailable('rpc_error');
    if (data?.status === 'accepted') {
        const receipt = trainPlanReceipt.safeParse(data.receipt);
        if (!receipt.success || receipt.data.ownerId !== ownerId || receipt.data.operationId !== input.operationId || receipt.data.operation !== input.command.kind || receipt.data.occurrenceId !== input.command.occurrenceId
            || receipt.data.operation === 'link-workout' && input.command.kind === 'link-workout' && receipt.data.workoutId !== input.command.workoutId)
            return trainPlanUnavailable('invalid_rpc_response');
        return Response.json({ protocolVersion: 1, receipt: data.receipt }, { headers: trainPlanHeaders });
    }
    const rejection = trainPlanRejection.safeParse(data?.rejection);
    if (rejection.success) {
        const value = rejection.data;
        if (value.code !== data.status || value.ownerId !== ownerId || value.operationId !== input.operationId || value.operation !== input.command.kind || value.occurrenceId !== input.command.occurrenceId
            || input.command.kind === 'link-workout' && value.workoutId !== input.command.workoutId)
            return trainPlanUnavailable('invalid_rpc_response');
        return Response.json({ protocolVersion: 1, error: { code: value.code }, rejection: data.rejection }, { status: planRejectionStatus[value.code], headers: trainPlanHeaders });
    }
    const transient: Record<string, number> = { operation_conflict: 409, invalid_request: 422, unauthenticated: 401, owner_mismatch: 403 };
    return Object.hasOwn(transient, data?.status) && data.receipt === undefined && data.rejection === undefined ? trainPlanFailure(data.status, transient[data.status]) : trainPlanUnavailable('invalid_rpc_response');
}
export async function readTrainPlans(client: SupabaseClient, ownerId: string, query: {
    day: string | null;
    id: string | null;
    after: string | null;
}) {
    if (query.id !== null ? !planId.safeParse(query.id).success : !planDay.safeParse(query.day).success || query.after !== null && !planId.safeParse(query.after).success)
        return trainPlanFailure('invalid_request', 400);
    const { data, error } = await client.rpc('read_train_plans', { p_date: query.day, p_occurrence_id: query.id, p_after: query.after });
    if (error)
        return trainPlanUnavailable('rpc_error');
    if (data?.status === 'not_found')
        return trainPlanFailure('not_found', 404);
    if (query.id) {
        const parsed = z.object({ protocolVersion: z.literal(1), plan: trainingPlan }).strict().safeParse(data);
        if (!parsed.success || parsed.data.plan.ownerId !== ownerId || parsed.data.plan.occurrenceId !== query.id)
            return trainPlanUnavailable('invalid_rpc_response');
    }
    else {
        const parsed = z.object({ protocolVersion: z.literal(1), ownerId: planId, plans: z.array(trainingPlan).max(100), nextCursor: planId.nullable() }).strict().safeParse(data);
        if (!parsed.success || parsed.data.ownerId !== ownerId || parsed.data.plans.some(plan => plan.ownerId !== ownerId || plan.plannedDay !== query.day))
            return trainPlanUnavailable('invalid_rpc_response');
    }
    return Response.json(data, { headers: trainPlanHeaders });
}
export async function readTrainWorkoutLink(client: SupabaseClient, ownerId: string, id: string) {
    if (!planId.safeParse(id).success)
        return trainPlanFailure('invalid_request', 400);
    const { data, error } = await client.rpc('read_train_workout_link', { p_workout_id: id });
    if (error)
        return trainPlanUnavailable('rpc_error');
    if (data?.status === 'not_found')
        return trainPlanFailure('not_found', 404);
    const parsed = z.object({ protocolVersion: z.literal(1), link: workoutPlanLink.nullable() }).strict().safeParse(data);
    if (!parsed.success || parsed.data.link !== null && (parsed.data.link.ownerId !== ownerId || parsed.data.link.workoutId !== id))
        return trainPlanUnavailable('invalid_rpc_response');
    return Response.json(data, { headers: trainPlanHeaders });
}
export async function readTrainDay(request: Request, client: SupabaseClient, ownerId: string) {
    let body: unknown;
    try {
        body = await request.json();
    }
    catch {
        return trainPlanFailure('invalid_request', 400);
    }
    const parsed = trainDayRequest.safeParse(body);
    if (!parsed.success)
        return trainPlanFailure('invalid_request', 400);
    if (parsed.data.ownerId !== ownerId)
        return trainPlanFailure('owner_mismatch', 403);
    const { data, error } = await client.rpc('read_train_workout_day', { p_day: parsed.data.day, p_before: parsed.data.before });
    if (error)
        return trainPlanUnavailable('rpc_error');
    const page = z.object({ protocolVersion: z.literal(1), ownerId: planId, day: planDay, workouts: z.array(z.object({ record: z.custom<Record<string, unknown>>(value => !!value && typeof value === 'object' && !Array.isArray(value)), link: workoutPlanLink.nullable() }).strict()).max(20), nextCursor: planCursor.nullable() }).strict().safeParse(data);
    if (!page.success || page.data.ownerId !== ownerId || page.data.day !== parsed.data.day)
        return trainPlanUnavailable('invalid_rpc_response');
    const workouts = [];
    for (const item of page.data.workouts) {
        if (item.record.user_id !== ownerId || item.link !== null && (item.link.ownerId !== ownerId || item.link.workoutId !== item.record.id))
            return trainPlanUnavailable('invalid_rpc_response');
        const selected = selectRecordedCompletion(item.record);
        if (selected.status === 'recorded' && selected.completion.version !== 5 && selected.completion.workoutDay === parsed.data.day)
            workouts.push({ workout: selected.completion, link: item.link });
    }
    return Response.json({ protocolVersion: 1, ownerId, day: parsed.data.day, workouts, nextCursor: page.data.nextCursor }, { headers: trainPlanHeaders });
}
