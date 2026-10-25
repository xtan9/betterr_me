import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/logger";
import {
  exerciseCapabilitiesSchema,
  exerciseCommandEnvelopeSchema,
  exerciseProtocolSchema,
  exerciseReceiptSchema,
  exerciseRejectionSchema,
  exerciseReceiptMatchesRequest,
  type ExerciseCapabilities,
} from "@/lib/validations/train-exercises";

export const exerciseHeaders = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const exerciseFailure = (code: string, status: number) =>
  Response.json(
    { protocolVersion: 1, error: { code } },
    { status, headers: exerciseHeaders },
  );
export function exerciseUnavailable(
  classification: "rpc_error" | "invalid_rpc_response" | "unexpected_exception",
) {
  log.error("[train] Custom exercise request unavailable", undefined, {
    classification,
  });
  return exerciseFailure("unavailable", 503);
}
export async function exerciseCapabilities(
  client: SupabaseClient,
): Promise<
  { ok: false; response: Response } | { ok: true; value: ExerciseCapabilities }
> {
  const { data, error } = await client.rpc(
    "train_custom_exercise_capabilities",
  );
  if (error) return { ok: false, response: exerciseUnavailable("rpc_error") };
  const parsed = exerciseCapabilitiesSchema.safeParse(data);
  if (!parsed.success)
    return { ok: false, response: exerciseUnavailable("invalid_rpc_response") };
  return { ok: true, value: parsed.data };
}

/** Cookie and bearer callers share exactly one durable database command. */
export async function executeExerciseCommand(
  request: Request,
  client: SupabaseClient,
  ownerId: string,
  target?: { id?: string; kinds: readonly string[] },
) {
  let input: unknown;
  try {
    input = JSON.parse(await request.text());
  } catch {
    return exerciseFailure("invalid_request", 400);
  }
  const protocol = exerciseProtocolSchema.safeParse(input);
  if (!protocol.success) return exerciseFailure("invalid_request", 400);
  if (protocol.data.protocolVersion !== 1)
    return exerciseFailure("unsupported_version", 422);
  const parsed = exerciseCommandEnvelopeSchema.safeParse(input);
  if (!parsed.success) return exerciseFailure("invalid_request", 400);
  const body = parsed.data;
  if (
    target &&
    (!target.kinds.includes(String(body.command.kind)) ||
      (target.id && body.command.exerciseId !== target.id))
  )
    return exerciseFailure("invalid_request", 400);
  const { data, error } = await client.rpc("execute_train_exercise_command", {
    p_request: body,
  });
  if (error) return exerciseUnavailable("rpc_error");
  const evidence =
    data?.status === "accepted"
      ? exerciseReceiptSchema.safeParse(data.receipt)
      : exerciseRejectionSchema.safeParse(data?.rejection);
  if (evidence.success) {
    const result = evidence.data;
    if (
      result.operationId !== body.operationId ||
      result.ownerId !== ownerId ||
      result.operation !== body.command.kind ||
      result.exerciseId !==
        (body.command.kind === "create"
          ? body.operationId
          : body.command.exerciseId)
    )
      return exerciseUnavailable("invalid_rpc_response");
    if (data.status === "accepted")
      return "definition" in result &&
        exerciseReceiptMatchesRequest(result, body)
        ? Response.json(
            { protocolVersion: 1, receipt: data.receipt },
            { headers: exerciseHeaders },
          )
        : exerciseUnavailable("invalid_rpc_response");
    if ("code" in result && result.code === data.status) {
      const status =
        result.code === "not_found"
          ? 404
          : result.code === "invalid_definition"
            ? 422
            : 409;
      return Response.json(
        {
          protocolVersion: 1,
          error: { code: result.code },
          rejection: data.rejection,
        },
        { status, headers: exerciseHeaders },
      );
    }
  }
  const transient: Record<string, number> = {
    invalid_request: 400,
    unsupported_version: 422,
    unauthenticated: 401,
    operation_conflict: 409,
    not_ready: 503,
  };
  return Object.hasOwn(transient, data?.status) &&
    data?.receipt === undefined &&
    data?.rejection === undefined
    ? exerciseFailure(data.status, transient[data.status])
    : exerciseUnavailable("invalid_rpc_response");
}
