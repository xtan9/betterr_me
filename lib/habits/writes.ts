import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_HABITS_PER_USER } from "@/lib/constants";
import { HabitsDB } from "@/lib/db/habits";
import type { Habit, HabitInsert, HabitUpdate } from "@/lib/db/types";

export type HabitCreationFrequency =
  | { type: "daily" }
  | { type: "weekdays" }
  | { type: "weekly" }
  | { type: "times_per_week"; count: 2 | 3 }
  | { type: "custom"; days: number[] };

export type HabitLifecycleState = "active" | "paused" | "formed";

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

type HabitWritesPersistence = Partial<HabitCreationPersistence> &
  Partial<HabitUpdatePersistence> &
  Partial<HabitLifecyclePersistence> &
  Partial<HabitGraduationPersistence>;

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

type NormalizedRequest =
  | { ok: true; record: HabitCreationRecord }
  | { ok: false; field: string; message: string };

type Clock = () => Date;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "PGRST116";
}

function normalizeFrequency(value: unknown):
  | { ok: true; frequency: HabitCreationFrequency }
  | { ok: false } {
  if (!isRecord(value) || typeof value.type !== "string") {
    return { ok: false };
  }

  if (
    value.type === "daily" ||
    value.type === "weekdays" ||
    value.type === "weekly"
  ) {
    return { ok: true, frequency: { type: value.type } };
  }

  if (
    value.type === "times_per_week" &&
    (value.count === 2 || value.count === 3)
  ) {
    return { ok: true, frequency: { type: value.type, count: value.count } };
  }

  if (value.type === "custom" && Array.isArray(value.days)) {
    const days = value.days;
    if (
      days.length > 0 &&
      days.every(
        (day): day is number =>
          typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6,
      )
    ) {
      return {
        ok: true,
        frequency: {
          type: value.type,
          days: [...new Set(days)].sort((left, right) => left - right),
        },
      };
    }
  }

  return { ok: false };
}

function normalizeDetails(
  values: Record<string, unknown>,
  options: { requireName: boolean; requireFrequency: boolean },
):
  | { ok: true; changes: HabitDetailChanges }
  | { ok: false; field: string; message: string } {
  const hasValue = (key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) &&
    values[key] !== undefined;

  const changes: HabitDetailChanges = {};

  if (hasValue("name") || options.requireName) {
    if (typeof values.name !== "string") {
      return { ok: false, field: "name", message: "Name is required" };
    }
    const name = values.name.trim();
    if (!name) {
      return { ok: false, field: "name", message: "Name is required" };
    }
    if (name.length > 100) {
      return {
        ok: false,
        field: "name",
        message: "Name must be 100 characters or less",
      };
    }
    changes.name = name;
  }

  if (hasValue("description")) {
    if (values.description !== null && typeof values.description !== "string") {
      return {
        ok: false,
        field: "description",
        message: "Description must be text",
      };
    }
    const description =
      typeof values.description === "string"
        ? values.description.trim() || null
        : null;
    if (description && description.length > 500) {
      return {
        ok: false,
        field: "description",
        message: "Description must be 500 characters or less",
      };
    }
    changes.description = description;
  }

  if (hasValue("categoryId")) {
    if (values.categoryId !== null && typeof values.categoryId !== "string") {
      return {
        ok: false,
        field: "categoryId",
        message: "Category must be text",
      };
    }
    changes.categoryId =
      typeof values.categoryId === "string"
        ? values.categoryId.trim() || null
        : null;
  }

  if (hasValue("frequency") || options.requireFrequency) {
    const frequency = normalizeFrequency(values.frequency);
    if (!frequency.ok) {
      return {
        ok: false,
        field: "frequency",
        message: "Frequency is invalid",
      };
    }
    changes.frequency = frequency.frequency;
  }

  return { ok: true, changes };
}

function normalizeRequest(request: HabitCreationRequest): NormalizedRequest {
  if (!isRecord(request) || typeof request.userId !== "string") {
    return { ok: false, field: "userId", message: "User identity is required" };
  }

  const userId = request.userId.trim();
  if (!userId) {
    return { ok: false, field: "userId", message: "User identity is required" };
  }

  const details = normalizeDetails(request, {
    requireName: true,
    requireFrequency: true,
  });
  if (!details.ok) return details;

  return {
    ok: true,
    record: {
      userId,
      name: details.changes.name!,
      description: details.changes.description ?? null,
      categoryId: details.changes.categoryId ?? null,
      frequency: details.changes.frequency!,
      status: "active",
      currentStreak: 0,
      bestStreak: 0,
      pausedAt: null,
      graduatedAt: null,
      graduatedStreak: null,
      nudgeDismissedAt: null,
    },
  };
}

function normalizeUpdateRequest(
  request: HabitUpdateRequest,
):
  | { ok: true; userId: string; habitId: string; changes: HabitDetailChanges }
  | { ok: false; type: "conflict" }
  | { ok: false; type: "invalid"; field: string; message: string } {
  if (!isRecord(request) || typeof request.userId !== "string") {
    return {
      ok: false,
      type: "invalid",
      field: "userId",
      message: "User identity is required",
    };
  }
  const userId = request.userId.trim();
  if (!userId) {
    return {
      ok: false,
      type: "invalid",
      field: "userId",
      message: "User identity is required",
    };
  }

  if (typeof request.habitId !== "string" || !request.habitId.trim()) {
    return {
      ok: false,
      type: "invalid",
      field: "habitId",
      message: "Habit identity is required",
    };
  }

  const details = normalizeDetails(request, {
    requireName: false,
    requireFrequency: false,
  });
  if (!details.ok) {
    return {
      ok: false,
      type: "invalid",
      field: details.field,
      message: details.message,
    };
  }
  if (Object.keys(details.changes).length === 0) {
    return { ok: false, type: "conflict" };
  }

  return {
    ok: true,
    userId,
    habitId: request.habitId.trim(),
    changes: details.changes,
  };
}

export class HabitWrites {
  constructor(
    private readonly persistence: HabitWritesPersistence,
    private readonly now: Clock = () => new Date(),
  ) {}

  async create(request: HabitCreationRequest): Promise<HabitCreationOutcome> {
    const normalized = normalizeRequest(request);
    if (!normalized.ok) {
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }

    if (!this.persistence.countActiveHabits || !this.persistence.createHabit) {
      throw new Error("Habit creation is not supported by this persistence");
    }

    const activeCount = await this.persistence.countActiveHabits(
      normalized.record.userId,
    );
    if (activeCount >= MAX_HABITS_PER_USER) {
      return {
        type: "limit-reached",
        activeCount,
        limit: MAX_HABITS_PER_USER,
      };
    }

    const habit = await this.persistence.createHabit(normalized.record);
    return { type: "created", habit };
  }

  async update(request: HabitUpdateRequest): Promise<HabitUpdateOutcome> {
    const normalized = normalizeUpdateRequest(request);
    if (!normalized.ok) {
      if (normalized.type === "conflict") return { type: "conflict" };
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }
    if (!this.persistence.updateHabit) {
      throw new Error("Habit updates are not supported by this persistence");
    }

    const habit = await this.persistence.updateHabit(
      normalized.habitId,
      normalized.userId,
      normalized.changes,
    );
    if (!habit) return { type: "not-found" };
    return { type: "updated", habit };
  }

  async pause(
    request: HabitLifecycleRequest,
  ): Promise<HabitLifecycleOutcome> {
    return this.transition("pause", request);
  }

  async resume(
    request: HabitLifecycleRequest,
  ): Promise<HabitLifecycleOutcome> {
    return this.transition("resume", request);
  }

  async graduate(
    request: HabitGraduationRequest,
  ): Promise<HabitGraduationOutcome> {
    if (!this.persistence.graduateHabit) {
      throw new Error("Habit graduation is not supported by this persistence");
    }

    const outcome = await this.persistence.graduateHabit(
      request.habitId,
      request.userId,
      this.now().toISOString(),
    );
    if (
      outcome.type === "graduated" ||
      outcome.type === "already-formed" ||
      outcome.type === "not-found"
    ) {
      return outcome;
    }

    return {
      type: "invalid-transition",
      action: "graduate",
      currentStatus: outcome.currentStatus,
      message: `Habit cannot be graduated from ${outcome.currentStatus} state`,
    };
  }

  private async transition(
    action: HabitLifecycleAction,
    request: HabitLifecycleRequest,
  ): Promise<HabitLifecycleOutcome> {
    if (!this.persistence.getHabit || !this.persistence.updateHabitLifecycle) {
      throw new Error("Habit lifecycle transitions are not supported by this persistence");
    }

    const habit = await this.persistence.getHabit(
      request.habitId,
      request.userId,
    );
    if (!habit) return { type: "not-found" };

    const targetStatus = action === "pause" ? "paused" : "active";
    const sourceStatus = action === "pause" ? "active" : "paused";
    if (habit.status === targetStatus) {
      return { type: "already-applied", habit };
    }
    if (habit.status !== sourceStatus) {
      return {
        type: "invalid-transition",
        action,
        currentStatus: habit.status,
        message: `Habit cannot be ${action === "pause" ? "paused" : "resumed"} from ${habit.status} state`,
      };
    }

    const changes: HabitLifecycleChanges = action === "pause"
      ? { status: "paused", pausedAt: this.now().toISOString() }
      : { status: "active", pausedAt: null };
    const updated = await this.persistence.updateHabitLifecycle(
      request.habitId,
      request.userId,
      changes,
    );
    if (!updated) return { type: "not-found" };
    return { type: "transitioned", habit: updated };
  }
}

function toHabitMutationRecord(habit: Habit): HabitMutationRecord {
  return {
    id: habit.id,
    userId: habit.user_id,
    name: habit.name,
    description: habit.description,
    categoryId: habit.category_id,
    frequency: habit.frequency,
    status: habit.status,
    currentStreak: habit.current_streak,
    bestStreak: habit.best_streak,
    pausedAt: habit.paused_at,
    graduatedAt: habit.graduated_at,
    graduatedStreak: habit.graduated_streak,
    nudgeDismissedAt: habit.nudge_dismissed_at,
    createdAt: habit.created_at,
    updatedAt: habit.updated_at,
  };
}

function isHabitLifecycleState(value: unknown): value is HabitLifecycleState {
  return value === "active" || value === "paused" || value === "formed";
}

function mapStoredHabitGraduationOutcome(
  value: unknown,
): HabitGraduationPersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid graduation outcome returned by the database");
  }

  if (value.type === "not-found") return { type: "not-found" };

  if (
    (value.type === "graduated" || value.type === "already-formed") &&
    isRecord(value.habit)
  ) {
    return {
      type: value.type,
      habit: toHabitMutationRecord(value.habit as unknown as Habit),
    };
  }

  if (
    value.type === "invalid-transition" &&
    isHabitLifecycleState(value.current_status)
  ) {
    return {
      type: "invalid-transition",
      currentStatus: value.current_status,
    };
  }

  throw new Error("Invalid graduation outcome returned by the database");
}

export function createHabitWrites(supabase: SupabaseClient): HabitWrites {
  const habitsDB = new HabitsDB(supabase);

  return new HabitWrites({
    countActiveHabits: habitsDB.getActiveHabitCount.bind(habitsDB),
    createHabit: async (record) => {
      const insert: HabitInsert = {
        user_id: record.userId,
        name: record.name,
        description: record.description,
        category_id: record.categoryId,
        frequency: record.frequency,
        status: record.status,
        current_streak: record.currentStreak,
        best_streak: record.bestStreak,
        paused_at: record.pausedAt,
      };
      const habit = await habitsDB.createHabit(insert);
      return toHabitMutationRecord(habit);
    },
    updateHabit: async (habitId, userId, changes) => {
      const updates: HabitUpdate = {};
      if (changes.name !== undefined) updates.name = changes.name;
      if (changes.description !== undefined) {
        updates.description = changes.description;
      }
      if (changes.categoryId !== undefined) {
        updates.category_id = changes.categoryId;
      }
      if (changes.frequency !== undefined) updates.frequency = changes.frequency;

      try {
        const habit = await habitsDB.updateHabit(habitId, userId, updates);
        return toHabitMutationRecord(habit);
      } catch (error: unknown) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    getHabit: async (habitId, userId) => {
      const habit = await habitsDB.getHabit(habitId, userId);
      return habit ? toHabitMutationRecord(habit) : null;
    },
    updateHabitLifecycle: async (habitId, userId, changes) => {
      const updates: HabitUpdate = {
        status: changes.status,
        paused_at: changes.pausedAt,
      };

      try {
        const habit = await habitsDB.updateHabit(habitId, userId, updates);
        return toHabitMutationRecord(habit);
      } catch (error: unknown) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    graduateHabit: async (habitId, userId, graduatedAt) => {
      const { data, error } = await supabase.rpc("graduate_habit_atomically", {
        p_habit_id: habitId,
        p_user_id: userId,
        p_graduated_at: graduatedAt,
      });
      if (error) throw error;
      return mapStoredHabitGraduationOutcome(data);
    },
  });
}

export function toHabitResponse(habit: HabitMutationRecord) {
  return {
    id: habit.id,
    user_id: habit.userId,
    name: habit.name,
    description: habit.description,
    category_id: habit.categoryId,
    frequency: habit.frequency,
    status: habit.status,
    current_streak: habit.currentStreak,
    best_streak: habit.bestStreak,
    paused_at: habit.pausedAt,
    graduated_at: habit.graduatedAt,
    graduated_streak: habit.graduatedStreak,
    nudge_dismissed_at: habit.nudgeDismissedAt,
    created_at: habit.createdAt,
    updated_at: habit.updatedAt,
  };
}
