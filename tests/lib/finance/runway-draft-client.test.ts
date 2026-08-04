import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHouseholdRunwayInterview } from "@/lib/finance/internal/household-runway-interview";
import {
  HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY,
  HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY,
  HOUSEHOLD_RUNWAY_DRAFT_TTL_MS,
} from "@/lib/finance/internal/household-runway-draft-codec";
import {
  clearHouseholdRunwayDeviceDraft,
  clearHouseholdRunwayDraft,
  hasHouseholdRunwayDeviceStorageConsent,
  persistHouseholdRunwayDraft,
  persistHouseholdRunwaySessionDraft,
  readHouseholdRunwayDeviceDraft,
  readHouseholdRunwayDraft,
  rememberHouseholdRunwayDraft,
} from "@/lib/finance/runway-draft-client";

const now = new Date("2026-08-02T00:00:00.000Z");

function draftState() {
  const state = createHouseholdRunwayInterview({
    status: "collecting",
    stage: "location",
  });
  state.draft.answers = { ...state.draft.answers, country: "US" };
  state.draft.location = { ...state.draft.location, country: "US" };
  return state;
}

describe("Household Runway Draft storage adapter", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("persists provisional drafts to session storage by default", () => {
    const result = persistHouseholdRunwayDraft(draftState(), { now });

    expect(result).toEqual({ success: true, source: "session" });
    expect(sessionStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toContain(
      '"schema_version":1',
    );
    expect(localStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY)).toBeNull();
    expect(readHouseholdRunwayDraft({ now })).toMatchObject({
      status: "restored",
      source: "session",
    });
  });

  it("writes a durable copy only after explicit remember consent", () => {
    const result = rememberHouseholdRunwayDraft(draftState(), { now });

    expect(result).toEqual({ success: true, source: "device" });
    expect(hasHouseholdRunwayDeviceStorageConsent()).toBe(true);
    expect(localStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).not.toBeNull();

    sessionStorage.removeItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
    expect(readHouseholdRunwayDraft({ now })).toMatchObject({
      status: "restored",
      source: "device",
    });
  });

  it("reads the device scope independently and exposes the codec expiry", () => {
    rememberHouseholdRunwayDraft(draftState(), { now });

    const result = readHouseholdRunwayDeviceDraft({ now });

    expect(result).toMatchObject({
      status: "restored",
      source: "device",
      expiresAt: new Date(now.getTime() + HOUSEHOLD_RUNWAY_DRAFT_TTL_MS).toISOString(),
    });
  });

  it("supports session import before a separate durable cleanup", () => {
    rememberHouseholdRunwayDraft(draftState(), { now });
    const imported = persistHouseholdRunwaySessionDraft(draftState(), { now });

    expect(imported).toEqual({ success: true, source: "session" });
    expect(localStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).not.toBeNull();
    clearHouseholdRunwayDeviceDraft({ revokeConsent: false });
    expect(localStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).not.toBeNull();
  });

  it("clears an invalid session envelope recoverably", () => {
    sessionStorage.setItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY, "not-json");

    const result = readHouseholdRunwayDraft({ now });

    expect(result).toMatchObject({
      status: "rejected",
      source: "session",
      code: "malformed",
      cleanup: true,
    });
    expect(sessionStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("does not restore an unconsented durable envelope and cleans it up", () => {
    localStorage.setItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY, "not-json");

    const result = readHouseholdRunwayDraft({ now });

    expect(result).toMatchObject({
      status: "rejected",
      source: "device",
      code: "invalid_draft",
      cleanup: true,
    });
    expect(localStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("removes the device copy and consent without touching session state", () => {
    rememberHouseholdRunwayDraft(draftState(), { now });
    sessionStorage.setItem("unrelated", "keep");

    clearHouseholdRunwayDeviceDraft();

    expect(localStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toBeNull();
    expect(hasHouseholdRunwayDeviceStorageConsent()).toBe(false);
    expect(sessionStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).not.toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it("clears both scopes and revokes consent when the Draft is discarded", () => {
    rememberHouseholdRunwayDraft(draftState(), { now });

    clearHouseholdRunwayDraft();

    expect(sessionStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toBeNull();
    expect(hasHouseholdRunwayDeviceStorageConsent()).toBe(false);
  });

  it("migrates a consented legacy device key and removes the legacy copy", () => {
    const encoded = persistHouseholdRunwayDraft(draftState(), { now });
    expect(encoded).toEqual({ success: true, source: "session" });
    const raw = sessionStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY);
    expect(raw).not.toBeNull();

    sessionStorage.clear();
    localStorage.setItem(HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY, "granted");
    localStorage.setItem("betterr.household-runway.v2", raw!);

    expect(readHouseholdRunwayDeviceDraft({ now })).toMatchObject({
      status: "restored",
      source: "device",
    });
    expect(localStorage.getItem("betterr.household-runway.v2")).toBeNull();
  });

  it("falls back to a valid device Draft when a session Draft is rejected", () => {
    rememberHouseholdRunwayDraft(draftState(), { now });
    sessionStorage.setItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY, "not-json");

    expect(readHouseholdRunwayDraft({ now })).toMatchObject({
      status: "restored",
      source: "device",
    });
    expect(sessionStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("returns a typed failure when a consented device write is unavailable", () => {
    localStorage.setItem(HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY, "granted");
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === localStorage && key === HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY) {
        throw new Error("device storage unavailable");
      }
      return originalSetItem.call(this, key, value);
    });

    expect(persistHouseholdRunwayDraft(draftState(), { now })).toEqual({
      success: false,
      code: "storage_unavailable",
    });
    setItem.mockRestore();
  });

  it("cleans up consent when remembering a Draft cannot write the durable payload", () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === localStorage && key === HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY) {
        throw new Error("device storage unavailable");
      }
      return originalSetItem.call(this, key, value);
    });

    expect(rememberHouseholdRunwayDraft(draftState(), { now })).toEqual({
      success: false,
      code: "storage_unavailable",
    });
    expect(hasHouseholdRunwayDeviceStorageConsent()).toBe(false);
    setItem.mockRestore();
  });

  it("reports session and cleanup failures without hiding the stored Draft", () => {
    const originalSetItem = Storage.prototype.setItem;
    const sessionWriteFailure = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (this === sessionStorage && key === HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY) {
          throw new Error("session storage unavailable");
        }
        return originalSetItem.call(this, key, value);
      });
    expect(rememberHouseholdRunwayDraft(draftState(), { now })).toEqual({
      success: false,
      code: "storage_unavailable",
    });
    sessionWriteFailure.mockRestore();

    rememberHouseholdRunwayDraft(draftState(), { now });
    const originalRemoveItem = Storage.prototype.removeItem;
    const removeFailure = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(function (this: Storage, key: string) {
        if (this === localStorage && key === HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY) {
          throw new Error("cleanup unavailable");
        }
        return originalRemoveItem.call(this, key);
      });
    expect(clearHouseholdRunwayDeviceDraft()).toEqual({
      success: false,
      code: "storage_unavailable",
    });
    removeFailure.mockRestore();
  });

  it("returns codec failures before attempting to write an invalid Draft", () => {
    const invalid = draftState();
    invalid.draft.answers = {
      ...invalid.draft.answers,
      country: "GB" as never,
    };

    expect(persistHouseholdRunwayDraft(invalid, { now })).toEqual({
      success: false,
      code: "invalid_draft",
    });
    expect(persistHouseholdRunwaySessionDraft(invalid, { now })).toEqual({
      success: false,
      code: "invalid_draft",
    });
    expect(rememberHouseholdRunwayDraft(invalid, { now })).toEqual({
      success: false,
      code: "invalid_draft",
    });
    expect(sessionStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
