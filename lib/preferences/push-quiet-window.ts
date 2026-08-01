import type {
  PreferenceState,
  PushQuietWindow,
  UserTimeZone,
} from "./types";

const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function localTimeMinutes(value: string): number | null {
  if (!LOCAL_TIME_PATTERN.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function localWallClockMinutes(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(
      parts.find((part) => part.type === "minute")?.value,
    );

    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return (hour % 24) * 60 + minute;
  } catch {
    return null;
  }
}

export function isPushQuietWindowActive(
  state: PreferenceState<PushQuietWindow> | null | undefined,
  timeZone: UserTimeZone | null | undefined,
  now: Date = new Date(),
): boolean {
  if (
    !state ||
    state.status !== "ready" ||
    state.value.status !== "enabled" ||
    !timeZone ||
    timeZone.status !== "resolved"
  ) {
    return false;
  }

  const start = localTimeMinutes(state.value.startLocal);
  const end = localTimeMinutes(state.value.endLocal);
  const current = localWallClockMinutes(now, timeZone.value);
  if (start === null || end === null || current === null || start === end) {
    return false;
  }

  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}
