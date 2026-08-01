import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as postAppearance } from "@/app/api/preferences/appearance/route";
import { POST as postLocalization } from "@/app/api/preferences/localization/route";
import { POST as postFitness } from "@/app/api/preferences/fitness/route";
import { POST as postNotifications } from "@/app/api/preferences/notifications/route";
import { PATCH as patchProfileDetails } from "@/app/api/profile-details/route";
import { PUT as putUserTimeZone } from "@/app/api/user-time-zone/route";

const {
  mockAuthenticateRequest,
  mockSetAppearancePreference,
  mockSetWeekStartPreference,
  mockSetFitnessPreference,
  mockSetNotificationPreference,
  mockUpdateProfileDetails,
  mockSetUserTimeZone,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockSetAppearancePreference: vi.fn(),
  mockSetWeekStartPreference: vi.fn(),
  mockSetFitnessPreference: vi.fn(),
  mockSetNotificationPreference: vi.fn(),
  mockUpdateProfileDetails: vi.fn(),
  mockSetUserTimeZone: vi.fn(),
}));

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mockAuthenticateRequest,
  cookieRouteErrorMessage: (error: { status: number; error: string }) =>
    error.status === 401 ? "Unauthorized" : error.error,
}));

vi.mock("@/lib/db", () => ({
  ProfilesDB: class {
    setAppearancePreference = mockSetAppearancePreference;
    setFitnessPreference = mockSetFitnessPreference;
    updateProfileDetails = mockUpdateProfileDetails;
    setUserTimeZone = mockSetUserTimeZone;
  },
  LocalizationDB: class {
    setWeekStartPreference = mockSetWeekStartPreference;
  },
}));

vi.mock("@/lib/db/notifications", () => ({
  NotificationsDB: class {
    setNotificationPreference = mockSetNotificationPreference;
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const request = (url: string, body: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("domain-owned Preference commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      ok: true,
      principal: { userId: "user-123", type: "user", credential: "cookie" },
      client: {},
    });
  });

  it("accepts an Appearance Theme Preference and returns only its outcome", async () => {
    mockSetAppearancePreference.mockResolvedValue({
      theme: "dark",
      preferenceRevision: 4,
      changed: true,
    });

    const response = await postAppearance(
      request("/api/preferences/appearance", {
        type: "setTheme",
        theme: "dark",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      theme: "dark",
      preferenceRevision: 4,
      changed: true,
    });
    expect(mockSetAppearancePreference).toHaveBeenCalledWith("dark");
  });

  it.each(["system", "light", "dark"] as const)(
    "accepts the strict Appearance Theme Preference value %s",
    async (theme) => {
      mockSetAppearancePreference.mockResolvedValue({
        theme,
        preferenceRevision: 4,
        changed: false,
      });

      const response = await postAppearance(
        request("/api/preferences/appearance", {
          type: "setTheme",
          theme,
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        theme,
        preferenceRevision: 4,
        changed: false,
      });
      expect(mockSetAppearancePreference).toHaveBeenCalledWith(theme);
    },
  );

  it("rejects an unsupported Appearance Theme Preference value", async () => {
    const response = await postAppearance(
      request("/api/preferences/appearance", {
        type: "setTheme",
        theme: "sepia",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockSetAppearancePreference).not.toHaveBeenCalled();
  });

  it("rejects a cross-domain or malformed Appearance intent", async () => {
    const response = await postAppearance(
      request("/api/preferences/appearance", {
        theme: "dark",
        weightUnit: "lbs",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockSetAppearancePreference).not.toHaveBeenCalled();
  });

  it("does not accept a target profile identifier in an owner command", async () => {
    const response = await postAppearance(
      request("/api/preferences/appearance", {
        type: "setTheme",
        theme: "dark",
        profileId: "other-user",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockSetAppearancePreference).not.toHaveBeenCalled();
  });

  it("routes Localization and Fitness intents to their owning commands", async () => {
    mockSetWeekStartPreference.mockResolvedValue({
      weekStart: "monday",
      preferenceRevision: 5,
      changed: false,
    });
    mockSetFitnessPreference.mockResolvedValue({
      weightUnit: "lbs",
      preferenceRevision: 6,
      changed: true,
    });

    const localizationResponse = await postLocalization(
      request("/api/preferences/localization", {
        type: "setWeekStart",
        weekStart: "monday",
      }),
    );
    await postFitness(
      request("/api/preferences/fitness", {
        type: "setWeightUnit",
        weightUnit: "lbs",
      }),
    );

    expect(localizationResponse.status).toBe(200);
    await expect(localizationResponse.json()).resolves.toEqual({
      weekStart: "monday",
      preferenceRevision: 5,
      changed: false,
    });
    expect(mockSetWeekStartPreference).toHaveBeenCalledWith("monday");
    expect(mockSetFitnessPreference).toHaveBeenCalledWith("lbs");
  });

  it.each(["kg", "lbs"] as const)(
    "returns the accepted Fitness Weight Unit outcome for %s",
    async (weightUnit) => {
      mockSetFitnessPreference.mockResolvedValue({
        weightUnit,
        preferenceRevision: 9,
        changed: weightUnit === "lbs",
      });

      const response = await postFitness(
        request("/api/preferences/fitness", {
          type: "setWeightUnit",
          weightUnit,
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        weightUnit,
        preferenceRevision: 9,
        changed: weightUnit === "lbs",
      });
      expect(mockSetFitnessPreference).toHaveBeenCalledWith(weightUnit);
    },
  );

  it.each(["stones", "lb", ""])(
    "rejects unsupported Fitness Weight Unit value %s",
    async (weightUnit) => {
      const response = await postFitness(
        request("/api/preferences/fitness", {
          type: "setWeightUnit",
          weightUnit,
        }),
      );

      expect(response.status).toBe(400);
      expect(mockSetFitnessPreference).not.toHaveBeenCalled();
    },
  );

  it("rejects a Localization intent outside Sunday or Monday", async () => {
    const response = await postLocalization(
      request("/api/preferences/localization", {
        type: "setWeekStart",
        weekStart: "tuesday",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockSetWeekStartPreference).not.toHaveBeenCalled();
  });

  it("accepts discriminated Notification Preference intents", async () => {
    mockSetNotificationPreference.mockResolvedValue({
      pushQuietWindow: {
        status: "enabled",
        startLocal: "22:00",
        endLocal: "07:00",
      },
      preferenceRevision: 8,
      changed: true,
    });

    const response = await postNotifications(
      request("/api/preferences/notifications", {
        type: "setPushQuietWindow",
        value: { status: "enabled", startLocal: "22:00", endLocal: "07:00" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSetNotificationPreference).toHaveBeenCalledWith({
      type: "setPushQuietWindow",
      value: { status: "enabled", startLocal: "22:00", endLocal: "07:00" },
    });
  });

  it("returns only the accepted Reminder Email owner outcome", async () => {
    mockSetNotificationPreference.mockResolvedValue({
      reminderEmail: { enabled: true },
      preferenceRevision: 9,
      changed: true,
    });

    const response = await postNotifications(
      request("/api/preferences/notifications", {
        type: "setReminderEmail",
        enabled: true,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reminderEmail: { enabled: true },
      preferenceRevision: 9,
      changed: true,
    });
    expect(mockSetNotificationPreference).toHaveBeenCalledWith({
      type: "setReminderEmail",
      enabled: true,
    });
  });

  it("rejects a Reminder Email command with an invented delivery address", async () => {
    const response = await postNotifications(
      request("/api/preferences/notifications", {
        type: "setReminderEmail",
        enabled: true,
        email: "invented@example.test",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockSetNotificationPreference).not.toHaveBeenCalled();
  });

  it("sends only dirty Profile Details fields", async () => {
    mockUpdateProfileDetails.mockResolvedValue({
      fullName: "Taylor Example",
      avatarUrl: null,
      changed: true,
    });

    const response = await patchProfileDetails(
      request(
        "/api/profile-details",
        { fullName: "Taylor Example" },
        "PATCH",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fullName: "Taylor Example",
      avatarUrl: null,
      changed: true,
    });
    expect(mockUpdateProfileDetails).toHaveBeenCalledWith({
      fullName: "Taylor Example",
    });
    expect(mockAuthenticateRequest).toHaveBeenCalledWith(
      expect.anything(),
      { allowedCredentials: ["cookie"], requiredPermission: "write" },
    );
  });

  it("sends an avatar-only Profile Details patch", async () => {
    mockUpdateProfileDetails.mockResolvedValue({
      fullName: "Taylor Example",
      avatarUrl: "https://example.com/new-avatar.jpg",
      changed: true,
    });

    const response = await patchProfileDetails(
      request(
        "/api/profile-details",
        { avatarUrl: "https://example.com/new-avatar.jpg" },
        "PATCH",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateProfileDetails).toHaveBeenCalledWith({
      avatarUrl: "https://example.com/new-avatar.jpg",
    });
  });

  it("rejects a Profile Details request with neither dirty field", async () => {
    const response = await patchProfileDetails(
      request("/api/profile-details", {}, "PATCH"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Validation failed",
      details: { _errors: ["At least one Profile Details field must be provided"] },
    });
    expect(mockUpdateProfileDetails).not.toHaveBeenCalled();
  });

  it("rejects a Profile Details target identifier instead of accepting a foreign subject", async () => {
    const response = await patchProfileDetails(
      request(
        "/api/profile-details",
        { fullName: "Taylor Example", profileId: "other-user" },
        "PATCH",
      ),
    );

    expect(response.status).toBe(400);
    expect(mockUpdateProfileDetails).not.toHaveBeenCalled();
  });

  it("requires the authenticated cookie command boundary", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      ok: false,
      outcome: "anonymous",
      error: "Unauthorized",
      status: 401,
    });

    const response = await patchProfileDetails(
      request("/api/profile-details", { fullName: "Taylor Example" }, "PATCH"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockUpdateProfileDetails).not.toHaveBeenCalled();
  });

  it("uses an explicit User Time Zone command and returns only its outcome", async () => {
    mockSetUserTimeZone.mockResolvedValue({
      timeZone: "America/New_York",
      changed: true,
    });

    const response = await putUserTimeZone(
      request(
        "/api/user-time-zone",
        { timeZone: "America/New_York" },
        "PUT",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      timeZone: "America/New_York",
      changed: true,
    });
    expect(mockSetUserTimeZone).toHaveBeenCalledWith("America/New_York");
    expect(mockAuthenticateRequest).toHaveBeenCalledWith(
      expect.anything(),
      { allowedCredentials: ["cookie"], requiredPermission: "write" },
    );
  });

  it("rejects an unsupported IANA User Time Zone before persistence", async () => {
    const response = await putUserTimeZone(
      request(
        "/api/user-time-zone",
        { timeZone: "Mars/Olympus" },
        "PUT",
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_preference",
    });
    expect(mockSetUserTimeZone).not.toHaveBeenCalled();
  });

  it("rejects a User Time Zone target identifier instead of accepting a foreign subject", async () => {
    const response = await putUserTimeZone(
      request(
        "/api/user-time-zone",
        { timeZone: "America/New_York", userId: "other-user" },
        "PUT",
      ),
    );

    expect(response.status).toBe(400);
    expect(mockSetUserTimeZone).not.toHaveBeenCalled();
  });

  it("requires the authenticated cookie command boundary for User Time Zone", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      ok: false,
      outcome: "anonymous",
      error: "Unauthorized",
      status: 401,
    });

    const response = await putUserTimeZone(
      request(
        "/api/user-time-zone",
        { timeZone: "America/New_York" },
        "PUT",
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockSetUserTimeZone).not.toHaveBeenCalled();
  });

  it("maps unresolved User Time Zone command failures to a typed application error", async () => {
    const error = Object.assign(new Error("User Time Zone is unresolved"), {
      code: "user_time_zone_unresolved",
    });
    mockSetNotificationPreference.mockRejectedValue(error);

    const response = await postNotifications(
      request("/api/preferences/notifications", {
        type: "setPushQuietWindow",
        value: { status: "enabled", startLocal: "22:00", endLocal: "07:00" },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "user_time_zone_unresolved",
    });
  });

  it("maps an unavailable Identity Email to a typed application error", async () => {
    const error = Object.assign(new Error("identity_email_unavailable"), {
      code: "P0001",
    });
    mockSetNotificationPreference.mockRejectedValue(error);

    const response = await postNotifications(
      request("/api/preferences/notifications", {
        type: "setReminderEmail",
        enabled: true,
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "identity_email_unavailable",
    });
  });
});
