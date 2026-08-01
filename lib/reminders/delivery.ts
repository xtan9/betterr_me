/**
 * Storage-independent Reminder Delivery behavior.
 *
 * Reminder Configuration owns the source intent (timing and channels). This
 * module only owns the delivery state and the transitions that can change it.
 */

export const REMINDER_DELIVERY_MAX_STALE_AGE_MS = 4 * 60 * 60 * 1000;

export const REMINDER_DELIVERY_SUPPORTED_SOURCE_TYPES = [
  "calendar_event",
  "task",
  "habit",
] as const;

export type ReminderDeliverySupportedSourceType =
  (typeof REMINDER_DELIVERY_SUPPORTED_SOURCE_TYPES)[number];

export type ReminderDeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "snoozed";

export type ReminderDeliveryChannel = "push" | "email";

export interface ReminderDeliveryRecord {
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  reminderType: "relative" | "absolute";
  relativeMinutes: number | null;
  absoluteTime: string | null;
  channels: ReminderDeliveryChannel[];
  status: ReminderDeliveryStatus;
  fireAt: string;
  sentAt: string | null;
  createdAt: string;
}

declare const REMINDER_DELIVERY_CONTEXT: unique symbol;

type ReminderDeliveryContextBrand = {
  readonly [REMINDER_DELIVERY_CONTEXT]?: true;
};

export type UserReminderDeliveryContext = ReminderDeliveryContextBrand & {
  readonly type: "user";
  readonly userId: string;
};

export type TrustedOperationalDispatchContext = ReminderDeliveryContextBrand & {
  readonly type: "operational";
  readonly service: "reminder-dispatcher";
  readonly userId: string;
  readonly trusted: true;
};

export type ReminderDeliveryContext =
  | UserReminderDeliveryContext
  | TrustedOperationalDispatchContext;

export function userReminderDeliveryContext(
  userId: string,
): UserReminderDeliveryContext {
  return {
    type: "user",
    userId: normalizeIdentity(userId),
  };
}

export function trustedOperationalDispatchContext(
  userId: string,
): TrustedOperationalDispatchContext {
  return {
    type: "operational",
    service: "reminder-dispatcher",
    userId: normalizeIdentity(userId),
    trusted: true,
  };
}

export type ReminderDeliveryTransition =
  | { type: "snooze"; fireAt: string }
  | { type: "sent"; sentAt?: string }
  | { type: "failed" }
  | { type: "stale" }
  | { type: "retire-unsupported-source" }
  | { type: "legacy-snooze" };

export interface ReminderDeliveryTransitionRequest {
  reminderId: string;
  context: ReminderDeliveryContext;
  transition: ReminderDeliveryTransition;
}

export interface ReminderDeliveryNextState {
  status: ReminderDeliveryStatus;
  fireAt: string;
  sentAt: string | null;
}

export interface ReminderDeliveryPersistenceTransitionRequest {
  reminderId: string;
  userId: string;
  context: ReminderDeliveryContext;
  transition: ReminderDeliveryTransition;
  expected: Pick<ReminderDeliveryRecord, "status" | "fireAt" | "sentAt">;
  next: ReminderDeliveryNextState;
}

export type ReminderDeliveryTransitionOutcome =
  | {
      type: "transitioned";
      reminder: ReminderDeliveryRecord;
      transition: ReminderDeliveryTransition["type"];
    }
  | {
      type: "already-applied";
      reminder: ReminderDeliveryRecord;
      transition: ReminderDeliveryTransition["type"];
    }
  | { type: "not-found" }
  | { type: "conflict"; reason?: string }
  | {
      type: "invalid-transition";
      action: string;
      reason: string;
      currentStatus?: ReminderDeliveryStatus;
    };

export interface ReminderDeliveryPersistence {
  getReminder(
    userId: string,
    reminderId: string,
  ): Promise<ReminderDeliveryRecord | null>;
  applyTransition(
    request: ReminderDeliveryPersistenceTransitionRequest,
  ): Promise<ReminderDeliveryTransitionOutcome>;
}

export type ReminderDeliveryDecision =
  | {
      type: "apply";
      transition: ReminderDeliveryTransition;
      next: ReminderDeliveryNextState;
    }
  | Extract<ReminderDeliveryTransitionOutcome, { type: "already-applied" }>
  | Extract<ReminderDeliveryTransitionOutcome, { type: "not-found" }>
  | Extract<ReminderDeliveryTransitionOutcome, { type: "invalid-transition" }>;

export interface ReminderDeliveryDecisionOptions {
  context: ReminderDeliveryContext;
  now: Date;
  staleAfterMs?: number;
}

const CONFIGURATION_BOUNDARY_ERROR =
  "Reminder Configuration changes must use the source lifecycle boundary";

const INVALID_TRANSITION_ERROR = "Unsupported Reminder Delivery transition";

export function decideReminderDeliveryTransition(
  reminder: ReminderDeliveryRecord,
  transition: ReminderDeliveryTransition,
  options: ReminderDeliveryDecisionOptions,
): ReminderDeliveryDecision {
  const reject = (reason: string) =>
    invalidTransition(reason, transition.type, reminder.status);
  const applied = () => alreadyApplied(reminder, transition.type);

  if (!sameIdentity(reminder.userId, options.context.userId)) {
    return { type: "not-found" };
  }

  if (!isValidDeliveryContext(options.context)) {
    return reject("A trusted user identity or operational context is required");
  }

  if (!isReminderDeliveryTransitionShape(transition)) {
    return reject(CONFIGURATION_BOUNDARY_ERROR);
  }

  const isOperational = options.context.type === "operational"
    && options.context.trusted === true;

  if (transition.type === "failed" && !isOperational) {
    return reject(
      "Only trusted operational dispatch may record a delivery failure",
    );
  }

  if (
    (transition.type === "stale" || transition.type === "retire-unsupported-source")
    && !isOperational
  ) {
    return reject(
      "Only trusted operational dispatch may run this delivery transition",
    );
  }

  if (
    (transition.type === "snooze" || transition.type === "legacy-snooze")
    && isOperational
  ) {
    return reject(
      "Operational dispatch cannot author a Reminder Delivery snooze",
    );
  }

  if (
    !isSupportedSourceType(reminder.sourceType) &&
    transition.type !== "retire-unsupported-source"
  ) {
    return reject(
      "Unsupported reminder sources must be retired before delivery",
    );
  }

  if (transition.type === "retire-unsupported-source") {
    if (isSupportedSourceType(reminder.sourceType)) {
      return reject(
        "Only unsupported Reminder sources can be retired",
      );
    }
    if (reminder.status === "failed" || reminder.status === "sent") {
      return applied();
    }
    if (reminder.status !== "pending") {
      return reject(
        "Only pending unsupported-source reminders can be retired",
      );
    }
    return applyTransition(reminder, transition, {
      status: "failed",
      fireAt: reminder.fireAt,
      sentAt: null,
    });
  }

  if (transition.type === "stale") {
    if (reminder.status === "failed") return applied();
    if (reminder.status !== "pending") {
      return reject("Only pending reminders can become stale");
    }
    const fireAt = Date.parse(reminder.fireAt);
    if (
      Number.isNaN(fireAt) ||
      options.now.getTime() - fireAt <=
        (options.staleAfterMs ?? REMINDER_DELIVERY_MAX_STALE_AGE_MS)
    ) {
      return reject(
        "Reminder has not exceeded the stale delivery retry horizon",
      );
    }
    return applyTransition(reminder, transition, {
      status: "failed",
      fireAt: reminder.fireAt,
      sentAt: null,
    });
  }

  if (transition.type === "snooze") {
    if (!isValidFutureTimestamp(transition.fireAt, options.now)) {
      return reject("Snooze fire_at must be a future datetime");
    }
    if (
      reminder.status === "pending"
      && reminder.fireAt === transition.fireAt
      && reminder.sentAt === null
    ) {
      return applied();
    }
    if (reminder.status !== "pending") {
      return reject(
        "Only pending reminders can be snoozed",
      );
    }
    return applyTransition(reminder, transition, {
      status: "pending",
      fireAt: transition.fireAt,
      sentAt: null,
    });
  }

  if (transition.type === "legacy-snooze") {
    if (reminder.status === "snoozed") return applied();
    if (reminder.status !== "pending") {
      return reject("Only pending reminders can be snoozed");
    }
    return applyTransition(reminder, transition, {
      status: "snoozed",
      fireAt: reminder.fireAt,
      sentAt: null,
    });
  }

  if (transition.type === "sent") {
    if (reminder.status === "sent") return applied();
    if (reminder.status !== "pending") {
      return reject("Only pending reminders can be marked sent");
    }
    if (transition.sentAt !== undefined && !isValidTimestamp(transition.sentAt)) {
      return reject("sent_at must be a valid datetime");
    }
    return applyTransition(reminder, transition, {
      status: "sent",
      fireAt: reminder.fireAt,
      sentAt: transition.sentAt ?? options.now.toISOString(),
    });
  }

  if (transition.type === "failed") {
    if (reminder.status === "failed") return applied();
    if (reminder.status !== "pending") {
      return reject("Only pending reminders can be marked failed");
    }
    return applyTransition(reminder, transition, {
      status: "failed",
      fireAt: reminder.fireAt,
      sentAt: null,
    });
  }

  return reject(INVALID_TRANSITION_ERROR);
}

export interface ReminderDeliveryOptions {
  clock?: () => Date;
  staleAfterMs?: number;
}

export class ReminderDelivery {
  private readonly clock: () => Date;
  private readonly staleAfterMs: number;

  constructor(
    private readonly persistence: ReminderDeliveryPersistence,
    options: ReminderDeliveryOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.staleAfterMs = options.staleAfterMs ?? REMINDER_DELIVERY_MAX_STALE_AGE_MS;
  }

  async transition(
    request: ReminderDeliveryTransitionRequest,
  ): Promise<ReminderDeliveryTransitionOutcome> {
    const reminderId = normalizeIdentity(request?.reminderId);
    const userId = normalizeIdentity(request?.context?.userId);
    if (!reminderId || !userId) {
      return {
        type: "invalid-transition",
        action: "unknown",
        reason: "Reminder identity is required",
      };
    }
    if (!isValidDeliveryContext(request.context)) {
      return {
        type: "invalid-transition",
        action: typeof request?.transition?.type === "string"
          ? request.transition.type
          : "unknown",
        reason: "A trusted user identity or operational context is required",
      };
    }

    const reminder = await this.persistence.getReminder(userId, reminderId);
    if (!reminder) return { type: "not-found" };

    const decision = decideReminderDeliveryTransition(
      reminder,
      request.transition,
      {
        context: request.context,
        now: this.clock(),
        staleAfterMs: this.staleAfterMs,
      },
    );
    if (decision.type !== "apply") return decision;

    return this.persistence.applyTransition({
      reminderId,
      userId,
      context: request.context,
      transition: decision.transition,
      expected: {
        status: reminder.status,
        fireAt: reminder.fireAt,
        sentAt: reminder.sentAt,
      },
      next: decision.next,
    });
  }
}

function applyTransition(
  reminder: ReminderDeliveryRecord,
  transition: ReminderDeliveryTransition,
  next: ReminderDeliveryNextState,
): Extract<ReminderDeliveryDecision, { type: "apply" }> {
  return { type: "apply", transition, next };
}

function alreadyApplied(
  reminder: ReminderDeliveryRecord,
  transition: ReminderDeliveryTransition["type"],
): Extract<ReminderDeliveryDecision, { type: "already-applied" }> {
  return { type: "already-applied", reminder, transition };
}

function invalidTransition(
  reason: string,
  action: string,
  currentStatus?: ReminderDeliveryStatus,
): Extract<ReminderDeliveryDecision, { type: "invalid-transition" }> {
  return {
    type: "invalid-transition",
    action,
    reason,
    ...(currentStatus === undefined ? {} : { currentStatus }),
  };
}

function normalizeIdentity(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sameIdentity(left: string, right: string): boolean {
  return normalizeIdentity(left) !== ""
    && normalizeIdentity(left) === normalizeIdentity(right);
}

function isValidTimestamp(value: string): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isValidFutureTimestamp(value: string, now: Date): boolean {
  return isValidTimestamp(value) && Date.parse(value) > now.getTime();
}

export function isSupportedSourceType(
  sourceType: string,
): sourceType is ReminderDeliverySupportedSourceType {
  return (REMINDER_DELIVERY_SUPPORTED_SOURCE_TYPES as readonly string[]).includes(
    sourceType,
  );
}

function isValidDeliveryContext(
  value: unknown,
): value is ReminderDeliveryContext {
  if (!isRecord(value) || typeof value.userId !== "string" || !value.userId.trim()) {
    return false;
  }
  if (value.type === "user") return true;
  return (
    value.type === "operational" &&
    value.service === "reminder-dispatcher" &&
    value.trusted === true
  );
}

function isReminderDeliveryTransitionShape(
  transition: unknown,
): transition is ReminderDeliveryTransition {
  if (!isRecord(transition) || typeof transition.type !== "string") return false;

  const keys = Object.keys(transition);
  switch (transition.type) {
    case "snooze":
      if (!keys.every((key) => key === "type" || key === "fireAt")) return false;
      return typeof transition.fireAt === "string";
    case "sent":
      if (!keys.every((key) => key === "type" || key === "sentAt")) return false;
      return transition.sentAt === undefined || typeof transition.sentAt === "string";
    case "failed":
    case "stale":
    case "retire-unsupported-source":
    case "legacy-snooze":
      return keys.length === 1;
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
