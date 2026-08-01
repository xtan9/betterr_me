import type { SupabaseClient } from "@supabase/supabase-js";
import { ReminderDefaultsDB } from "@/lib/db/reminder-defaults";
import type { ReminderDefault } from "@/lib/db/types";

export type ReminderDefaultSourceType = "calendar_event" | "task" | "habit";
export type ReminderDefaultChannel = "push" | "email";

export interface ReminderDefaultValues {
  sourceType: ReminderDefaultSourceType;
  relativeMinutes: number;
  channels: readonly ReminderDefaultChannel[];
}

export interface ReminderDefaultUpsertRequest {
  userId: string;
  default: ReminderDefaultValues;
}

export interface ReminderDefaultWritesPersistence {
  upsertDefault(
    userId: string,
    value: ReminderDefaultValues,
  ): Promise<ReminderDefault>;
}

export type ReminderDefaultUpsertOutcome = {
  type: "upserted";
  default: ReminderDefault;
};

export class ReminderDefaultWrites {
  constructor(
    private readonly persistence: ReminderDefaultWritesPersistence,
  ) {}

  async upsert(
    request: ReminderDefaultUpsertRequest,
  ): Promise<ReminderDefaultUpsertOutcome> {
    return {
      type: "upserted",
      default: await this.persistence.upsertDefault(
        request.userId,
        request.default,
      ),
    };
  }
}

export function createReminderDefaultWrites(
  supabase: SupabaseClient,
): ReminderDefaultWrites {
  const defaults = new ReminderDefaultsDB(supabase);
  return new ReminderDefaultWrites({
    upsertDefault: (userId, value) =>
      defaults.upsertDefault(userId, {
        source_type: value.sourceType,
        relative_minutes: value.relativeMinutes,
        channels: [...value.channels],
      }),
  });
}
