import { beforeEach, describe, expect, it } from "vitest";
import { createHouseholdRunwayInterview } from "@/lib/finance/household-runway-interview";
import {
  HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY,
  HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY,
} from "@/lib/finance/household-runway-draft-codec";
import {
  clearHouseholdRunwayDeviceDraft,
  clearHouseholdRunwayDraft,
  hasHouseholdRunwayDeviceStorageConsent,
  persistHouseholdRunwayDraft,
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
});
