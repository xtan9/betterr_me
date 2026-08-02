import {
  HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY,
  HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY,
  decodeHouseholdRunwayDraft,
  encodeHouseholdRunwayDraft,
  type HouseholdRunwayDraftCodecErrorCode,
  type HouseholdRunwayDraftState,
} from "@/lib/finance/household-runway-draft-codec";

const LEGACY_DRAFT_STORAGE_KEYS = [
  "betterr.household-runway.v2",
  "betterr.household-runway.interview.v1",
] as const;

export type HouseholdRunwayDraftStorageSource = "session" | "device";

export type HouseholdRunwayDraftStorageReadResult =
  | {
      status: "empty";
      state: null;
      source: null;
    }
  | {
      status: "restored";
      state: HouseholdRunwayDraftState;
      source: HouseholdRunwayDraftStorageSource;
    }
  | {
      status: "rejected";
      state: null;
      source: HouseholdRunwayDraftStorageSource;
      code: HouseholdRunwayDraftCodecErrorCode;
      cleanup: true;
    };

export type HouseholdRunwayDraftStorageWriteResult =
  | {
      success: true;
      source: HouseholdRunwayDraftStorageSource;
    }
  | {
      success: false;
      code: "storage_unavailable" | HouseholdRunwayDraftCodecErrorCode;
    };

function browserStorage(
  source: HouseholdRunwayDraftStorageSource,
): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return source === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function readItem(storage: Storage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function removeItem(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // Cleanup is best effort. The Interview remains usable in memory.
  }
}

function writeItem(storage: Storage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeLegacyDeviceDrafts() {
  const storage = browserStorage("device");
  LEGACY_DRAFT_STORAGE_KEYS.forEach((key) => removeItem(storage, key));
}

export function hasHouseholdRunwayDeviceStorageConsent(): boolean {
  return (
    readItem(browserStorage("device"), HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY) ===
    "granted"
  );
}

function decodeStoredDraft(
  raw: string | null,
  now: Date,
): HouseholdRunwayDraftStorageReadResult | null {
  if (raw === null) return null;
  const decoded = decodeHouseholdRunwayDraft(raw, now);
  if (decoded.success) {
    return {
      status: "restored",
      state: decoded.state,
      source: "session",
    };
  }
  return {
    status: "rejected",
    state: null,
    source: "session",
    code: decoded.code,
    cleanup: true,
  };
}

export function readHouseholdRunwayDraft(
  options: { now?: Date } = {},
): HouseholdRunwayDraftStorageReadResult {
  if (typeof window === "undefined") {
    return { status: "empty", state: null, source: null };
  }
  const now = options.now ?? new Date();
  const sessionStorage = browserStorage("session");
  const sessionRaw = readItem(sessionStorage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
  if (sessionRaw !== null) {
    const sessionResult = decodeStoredDraft(sessionRaw, now);
    if (sessionResult?.status === "restored") {
      return { ...sessionResult, source: "session" };
    }
    removeItem(sessionStorage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
    if (sessionResult?.status === "rejected") {
      const deviceResult = readDeviceDraft(now);
      if (deviceResult) return deviceResult;
      return sessionResult;
    }
  }

  return readDeviceDraft(now) ?? { status: "empty", state: null, source: null };
}

function readDeviceDraft(
  now: Date,
): HouseholdRunwayDraftStorageReadResult | null {
  const deviceStorage = browserStorage("device");
  const consent = hasHouseholdRunwayDeviceStorageConsent();
  const currentRaw = readItem(deviceStorage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
  const legacyKey = LEGACY_DRAFT_STORAGE_KEYS.find(
    (key) => readItem(deviceStorage, key) !== null,
  );
  const raw = currentRaw ?? (legacyKey ? readItem(deviceStorage, legacyKey) : null);
  if (raw === null) {
    removeLegacyDeviceDrafts();
    return null;
  }
  if (!consent) {
    removeItem(deviceStorage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
    removeLegacyDeviceDrafts();
    return {
      status: "rejected",
      state: null,
      source: "device",
      code: "invalid_draft",
      cleanup: true,
    };
  }
  const decoded = decodeHouseholdRunwayDraft(raw, now);
  if (decoded.success) {
    if (legacyKey) removeItem(deviceStorage, legacyKey);
    return {
      status: "restored",
      state: decoded.state,
      source: "device",
    };
  }
  removeItem(deviceStorage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
  if (legacyKey) removeItem(deviceStorage, legacyKey);
  return {
    status: "rejected",
    state: null,
    source: "device",
    code: decoded.code,
    cleanup: true,
  };
}

export function persistHouseholdRunwayDraft(
  state: HouseholdRunwayDraftState,
  options: { now?: Date } = {},
): HouseholdRunwayDraftStorageWriteResult {
  let encoded: string;
  try {
    encoded = encodeHouseholdRunwayDraft(state, options.now ?? new Date());
  } catch (error) {
    return {
      success: false,
      code:
        typeof error === "object" && error !== null && "code" in error
          ? (error.code as HouseholdRunwayDraftCodecErrorCode)
          : "invalid_draft",
    };
  }
  const sessionStorage = browserStorage("session");
  if (!writeItem(sessionStorage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY, encoded)) {
    return { success: false, code: "storage_unavailable" };
  }
  if (hasHouseholdRunwayDeviceStorageConsent()) {
    if (!writeItem(browserStorage("device"), HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY, encoded)) {
      return { success: false, code: "storage_unavailable" };
    }
    return { success: true, source: "device" };
  }
  return { success: true, source: "session" };
}

export function rememberHouseholdRunwayDraft(
  state: HouseholdRunwayDraftState,
  options: { now?: Date } = {},
): HouseholdRunwayDraftStorageWriteResult {
  let encoded: string;
  try {
    encoded = encodeHouseholdRunwayDraft(state, options.now ?? new Date());
  } catch (error) {
    return {
      success: false,
      code:
        typeof error === "object" && error !== null && "code" in error
          ? (error.code as HouseholdRunwayDraftCodecErrorCode)
          : "invalid_draft",
    };
  }
  const deviceStorage = browserStorage("device");
  if (!writeItem(deviceStorage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY, encoded)) {
    return { success: false, code: "storage_unavailable" };
  }
  if (!writeItem(deviceStorage, HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY, "granted")) {
    removeItem(deviceStorage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
    return { success: false, code: "storage_unavailable" };
  }
  const sessionStorage = browserStorage("session");
  if (!writeItem(sessionStorage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY, encoded)) {
    return { success: false, code: "storage_unavailable" };
  }
  return { success: true, source: "device" };
}

export function clearHouseholdRunwayDeviceDraft() {
  const storage = browserStorage("device");
  removeItem(storage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
  removeLegacyDeviceDrafts();
  removeItem(storage, HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY);
}

export function clearHouseholdRunwayDraft(options: { revokeConsent?: boolean } = {}) {
  removeItem(browserStorage("session"), HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
  const deviceStorage = browserStorage("device");
  removeItem(deviceStorage, HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
  removeLegacyDeviceDrafts();
  if (options.revokeConsent !== false) {
    removeItem(deviceStorage, HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY);
  }
}
