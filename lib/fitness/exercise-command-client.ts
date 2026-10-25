import {
  exerciseCommandEnvelopeSchema,
  exerciseReceiptSchema,
  exerciseRejectionSchema,
  exerciseReceiptMatchesRequest,
  exerciseIdSchema,
} from "@/lib/validations/train-exercises";
import { z } from "zod";

export type ExerciseCommandRequest = z.infer<
  typeof exerciseCommandEnvelopeSchema
>;
export type ExerciseCommandReceipt = z.infer<typeof exerciseReceiptSchema>;
export type ExerciseCommandRejection = z.infer<typeof exerciseRejectionSchema>;
export type ExerciseJournal = {
  ownerId: string;
  request: ExerciseCommandRequest;
  state: "pending" | "accepted" | "rejected" | "resolved" | "superseded";
  receipt?: ExerciseCommandReceipt;
  rejection?: ExerciseCommandRejection;
  replacementOperationId?: string;
};
const journalSchema = z
  .object({
    ownerId: exerciseIdSchema,
    request: exerciseCommandEnvelopeSchema,
    state: z.enum([
      "pending",
      "accepted",
      "rejected",
      "resolved",
      "superseded",
    ]),
    receipt: exerciseReceiptSchema.optional(),
    rejection: exerciseRejectionSchema.optional(),
    replacementOperationId: exerciseIdSchema.optional(),
  })
  .strict()
  .refine((record) => {
    if (record.state === "pending")
      return (
        record.receipt === undefined &&
        record.rejection === undefined &&
        record.replacementOperationId === undefined
      );
    const evidence =
      record.state === "accepted" ? record.receipt : record.rejection;
    if (
      !evidence ||
      evidence.ownerId !== record.ownerId ||
      evidence.operationId !== record.request.operationId ||
      evidence.operation !== record.request.command.kind ||
      evidence.exerciseId !==
        (record.request.command.kind === "create"
          ? record.request.operationId
          : record.request.command.exerciseId)
    )
      return false;
    return record.state === "accepted"
      ? record.rejection === undefined &&
          record.replacementOperationId === undefined &&
          exerciseReceiptMatchesRequest(record.receipt!, record.request)
      : record.receipt === undefined &&
          (record.state === "superseded"
            ? record.replacementOperationId !== undefined
            : record.replacementOperationId === undefined);
  });
const prefix = (owner: string) => `train:exercise-command:${owner}:`;
const activeKey = (owner: string) => `train:exercise-command-active:${owner}`;
const event = "train-exercise-command-changed";
function save(record: ExerciseJournal) {
  localStorage.setItem(
    prefix(record.ownerId) + record.request.operationId,
    JSON.stringify(record),
  );
  window.dispatchEvent(new Event(event));
}
export function currentExerciseCommand(owner: string): ExerciseJournal | null {
  const id = localStorage.getItem(activeKey(owner));
  if (!id) return null;
  const raw = localStorage.getItem(prefix(owner) + id);
  if (!raw) throw new Error("invalid_command_journal");
  const parsed = journalSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("invalid_command_journal");
  const record = parsed.data;
  if (
    record.ownerId !== owner ||
    record.request.operationId !== id ||
    !exerciseCommandEnvelopeSchema.safeParse(record.request).success
  )
    throw new Error("invalid_command_journal");
  return record;
}
export function prepareExerciseCommand(
  ownerId: string,
  command: Record<string, unknown>,
): ExerciseCommandRequest {
  const current = currentExerciseCommand(ownerId);
  if (current && current.state === "pending") {
    if (JSON.stringify(current.request.command) !== JSON.stringify(command))
      throw new Error("pending_command");
    return current.request;
  }
  if (current && current.state === "rejected")
    throw new Error("review_required");
  const request = {
    protocolVersion: 1 as const,
    operationId: crypto.randomUUID(),
    command,
  };
  save({ ownerId, request, state: "pending" });
  localStorage.setItem(activeKey(ownerId), request.operationId);
  window.dispatchEvent(new Event(event));
  return request;
}
export function resolveExerciseRejection(
  owner: string,
  replacement?: Record<string, unknown>,
) {
  const current = currentExerciseCommand(owner);
  if (current?.state !== "rejected") throw new Error("review_required");
  if (!replacement) {
    save({ ...current, state: "resolved" });
    localStorage.removeItem(activeKey(owner));
    window.dispatchEvent(new Event(event));
    return;
  }
  const request = {
    protocolVersion: 1 as const,
    operationId: crypto.randomUUID(),
    command: replacement,
  };
  // Store the new request before resolving its predecessor; a failed storage
  // write retains the original rejected proposal instead of losing it.
  save({ ownerId: owner, request, state: "pending" });
  save({
    ...current,
    state: "superseded",
    replacementOperationId: request.operationId,
  });
  localStorage.setItem(activeKey(owner), request.operationId);
  window.dispatchEvent(new Event(event));
  return request;
}
export class ExerciseCommandError extends Error {
  constructor(
    readonly code: string,
    readonly rejection?: ExerciseCommandRejection,
  ) {
    super(code);
  }
}
export async function sendExerciseCommand(
  owner: string,
  request: ExerciseCommandRequest,
) {
  const current = currentExerciseCommand(owner);
  if (
    current?.state !== "pending" ||
    JSON.stringify(current.request) !== JSON.stringify(request)
  )
    throw new ExerciseCommandError("invalid_command_journal");
  const response = await fetch("/api/exercises/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Train-Owner": owner },
    body: JSON.stringify(request),
  });
  const body = await response.json().catch(() => null);
  const evidence = response.ok
    ? exerciseReceiptSchema.safeParse(body?.receipt)
    : exerciseRejectionSchema.safeParse(body?.rejection);
  if (evidence.success && body?.protocolVersion === 1) {
    const value = evidence.data;
    if (
      value.ownerId !== owner ||
      value.operationId !== request.operationId ||
      value.operation !== request.command.kind ||
      value.exerciseId !==
        (request.command.kind === "create"
          ? request.operationId
          : request.command.exerciseId)
    )
      throw new ExerciseCommandError("invalid_response");
    if (response.ok && "definition" in value) {
      if (!exerciseReceiptMatchesRequest(value, request))
        throw new ExerciseCommandError("invalid_response");
      save({ ...current, state: "accepted", receipt: value });
      // A duplicate response may arrive after another operation was prepared.
      if (localStorage.getItem(activeKey(owner)) === request.operationId)
        localStorage.removeItem(activeKey(owner));
      window.dispatchEvent(new Event(event));
      return value;
    }
    if (!response.ok && "code" in value && body?.error?.code === value.code) {
      save({ ...current, state: "rejected", rejection: value });
      throw new ExerciseCommandError(value.code, value);
    }
  }
  // No success/rejection is fabricated for network, auth, gate or protocol errors.
  const codes = [
    "not_ready",
    "unavailable",
    "unauthenticated",
    "invalid_request",
    "unsupported_version",
    "operation_conflict",
  ];
  throw new ExerciseCommandError(
    codes.includes(body?.error?.code) ? body.error.code : "unavailable",
  );
}
export function observeExerciseCommands(listener: () => void) {
  window.addEventListener(event, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(event, listener);
    window.removeEventListener("storage", listener);
  };
}
