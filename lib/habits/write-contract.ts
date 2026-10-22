/** Habit command, outcome, and persistence contracts. */

export type HabitCreationFrequency =
  | { type: "daily" }
  | { type: "weekdays" }
  | { type: "weekly" }
  | { type: "times_per_week"; count: 2 | 3 }
  | { type: "custom"; days: number[] };

export type HabitLifecycleState = "active" | "paused" | "formed";

export type HabitReminderType = "relative" | "absolute";

export type HabitReminderChannel = "push" | "email";

export type HabitReminderStatus = "pending" | "sent" | "failed" | "snoozed";

/**
 * Storage-independent Habit Reminder Configuration intent. The complete
 * collection is supplied on every call; an empty collection removes pending
 * configuration while terminal delivery history remains untouched.
 */
export type HabitReminderInput =
  | {
      reminderType: "relative";
      relativeMinutes: number;
      channels: readonly HabitReminderChannel[];
    }
  | {
      reminderType: "absolute";
      absoluteTime: string;
      channels: readonly HabitReminderChannel[];
    };

export interface HabitReminderConfigurationRequest {
  userId: string;
  habitId: string;
  referenceTime?: string | null;
  reminders: readonly HabitReminderInput[];
}

export interface HabitReminderConfigurationRecord {
  userId: string;
  habitId: string;
  referenceTime: string | null;
  reminders: Array<{
    reminderType: HabitReminderType;
    relativeMinutes: number | null;
    absoluteTime: string | null;
    channels: HabitReminderChannel[];
  }>;
}

export interface HabitReminderRecord {
  id: string;
  userId: string;
  habitId: string;
  reminderType: HabitReminderType;
  relativeMinutes: number | null;
  absoluteTime: string | null;
  channels: HabitReminderChannel[];
  status: HabitReminderStatus;
  fireAt: string;
  sentAt: string | null;
  createdAt: string;
}

export type HabitReminderConfigurationPersistenceOutcome =
  | { type: "configured"; reminders: HabitReminderRecord[] }
  | { type: "removed"; reminders: [] }
  | { type: "already-applied"; reminders: HabitReminderRecord[] }
  | { type: "not-found" }
  | { type: "conflict"; resource?: "reminder"; reason?: string }
  | { type: "invalid"; field: string; message: string };

export interface HabitReminderConfigurationPersistence {
  configureHabitReminders(
    record: HabitReminderConfigurationRecord,
  ): Promise<HabitReminderConfigurationPersistenceOutcome>;
}

export interface HabitCreationRequest {
  userId: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  frequency: HabitCreationFrequency;
}

export interface HabitUpdateRequest {
  userId: string;
  habitId: string;
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  frequency?: HabitCreationFrequency;
}

export type HabitLifecycleAction = "pause" | "resume";

export interface HabitLifecycleRequest {
  userId: string;
  habitId: string;
}

export interface HabitCreationRecord {
  userId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  frequency: HabitCreationFrequency;
  status: "active";
  currentStreak: 0;
  bestStreak: 0;
  pausedAt: null;
  graduatedAt: null;
  graduatedStreak: null;
  nudgeDismissedAt: null;
}

export interface HabitMutationRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  frequency: HabitCreationFrequency;
  status: HabitLifecycleState;
  currentStreak: number;
  bestStreak: number;
  pausedAt: string | null;
  graduatedAt: string | null;
  graduatedStreak: number | null;
  nudgeDismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreatedHabit = HabitMutationRecord;

export type UpdatedHabit = HabitMutationRecord;

export interface HabitDetailChanges {
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  frequency?: HabitCreationFrequency;
}

export interface HabitCreationPersistence {
  countActiveHabits(userId: string): Promise<number>;
  createHabit(record: HabitCreationRecord): Promise<CreatedHabit>;
}

export interface HabitUpdatePersistence {
  updateHabit(
    habitId: string,
    userId: string,
    changes: HabitDetailChanges,
  ): Promise<UpdatedHabit | null>;
}

export interface HabitLifecycleChanges {
  status: Extract<HabitLifecycleState, "active" | "paused">;
  pausedAt: string | null;
}

export interface HabitLifecyclePersistence {
  getHabit(habitId: string, userId: string): Promise<HabitMutationRecord | null>;
  updateHabitLifecycle(
    habitId: string,
    userId: string,
    changes: HabitLifecycleChanges,
  ): Promise<HabitMutationRecord | null>;
}

export interface HabitGraduationRequest {
  userId: string;
  habitId: string;
}

export type HabitGraduationPersistenceOutcome =
  | { type: "graduated"; habit: HabitMutationRecord }
  | { type: "already-formed"; habit: HabitMutationRecord }
  | { type: "not-found" }
  | { type: "invalid-transition"; currentStatus: HabitLifecycleState };

export interface HabitGraduationPersistence {
  graduateHabit(
    habitId: string,
    userId: string,
    graduatedAt: string,
  ): Promise<HabitGraduationPersistenceOutcome>;
}

export interface HabitReactivationRequest {
  userId: string;
  habitId: string;
}

export type HabitReactivationPersistenceOutcome =
  | { type: "reactivated"; habit: HabitMutationRecord }
  | { type: "already-active"; habit: HabitMutationRecord }
  | { type: "not-found" }
  | { type: "invalid-transition"; currentStatus: HabitLifecycleState };

export interface HabitReactivationPersistence {
  reactivateHabit(
    habitId: string,
    userId: string,
  ): Promise<HabitReactivationPersistenceOutcome>;
  markReactivated?(
    habitId: string,
    userId: string,
    reactivatedAt: string,
  ): Promise<void>;
}

export interface HabitDeletionRequest {
  userId: string;
  habitId: string;
}

export type HabitDeletionPersistenceOutcome =
  | { type: "deleted" }
  | { type: "not-found" };

export interface HabitDeletionPersistence {
  deleteHabit(
    habitId: string,
    userId: string,
  ): Promise<HabitDeletionPersistenceOutcome>;
}

export interface HabitNudgeDismissalRequest {
  userId: string;
  habitId: string;
}

export type HabitNudgeDismissalOutcome =
  | { type: "dismissed"; habit: HabitMutationRecord }
  | { type: "not-found" };

export interface HabitNudgeDismissalPersistence {
  dismissGraduationNudge(
    habitId: string,
    userId: string,
  ): Promise<HabitMutationRecord | null>;
}

export type HabitWritesPersistence = Partial<HabitCreationPersistence> &
  Partial<HabitUpdatePersistence> &
  Partial<HabitLifecyclePersistence> &
  Partial<HabitGraduationPersistence> &
  Partial<HabitReactivationPersistence> &
  Partial<HabitDeletionPersistence> &
  Partial<HabitNudgeDismissalPersistence> &
  Partial<HabitReminderConfigurationPersistence>;

export type HabitCreationOutcome =
  | { type: "created"; habit: CreatedHabit }
  | { type: "invalid"; field: string; message: string }
  | { type: "limit-reached"; activeCount: number; limit: number };

export type HabitUpdateOutcome =
  | { type: "updated"; habit: UpdatedHabit }
  | { type: "not-found" }
  | { type: "conflict" }
  | { type: "invalid"; field: string; message: string };

export type HabitLifecycleOutcome =
  | { type: "transitioned"; habit: HabitMutationRecord }
  | { type: "already-applied"; habit: HabitMutationRecord }
  | { type: "not-found" }
  | {
      type: "invalid-transition";
      action: HabitLifecycleAction;
      currentStatus: HabitLifecycleState;
      message: string;
    };

export type HabitGraduationOutcome =
  | { type: "graduated"; habit: HabitMutationRecord }
  | { type: "already-formed"; habit: HabitMutationRecord }
  | { type: "not-found" }
  | {
      type: "invalid-transition";
      action: "graduate";
      currentStatus: HabitLifecycleState;
      message: string;
    };

export type HabitReactivationOutcome =
  | { type: "reactivated"; habit: HabitMutationRecord }
  | { type: "already-active"; habit: HabitMutationRecord }
  | { type: "not-found" }
  | {
      type: "invalid-transition";
      action: "reactivate";
      currentStatus: HabitLifecycleState;
      message: string;
    };

export type HabitDeletionOutcome = HabitDeletionPersistenceOutcome;

export type NormalizedRequest =
  | { ok: true; record: HabitCreationRecord }
  | { ok: false; field: string; message: string };

export type Clock = () => Date;

type HabitReminderInvalid = { ok: false; field: string; message: string };

export type HabitReminderNormalized<T> = { ok: true; value: T } | HabitReminderInvalid;

export type HabitReminderRequestNormalization =
  | { ok: true; value: HabitReminderConfigurationRecord }
  | HabitReminderInvalid
  | {
      ok: false;
      outcome: Extract<HabitReminderConfigurationPersistenceOutcome, { type: "conflict" }>;
    };
