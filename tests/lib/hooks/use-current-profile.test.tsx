import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentProfileResponse } from "@/lib/current-profile";

const { mockGetSession, mockOnAuthStateChange, mockSWR, mockFetch } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockOnAuthStateChange: vi.fn(),
    mockSWR: vi.fn(),
    mockFetch: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

vi.mock("swr", () => ({ default: mockSWR }));

const baseProfile: CurrentProfileResponse = {
  currentProfile: {
    identity: { email: "person@example.test" },
    profileDetails: { fullName: "Person", avatarUrl: null },
    userTimeZone: { status: "resolved", value: "America/Los_Angeles" },
    capabilities: { canAccessAdmin: false },
    preferences: {
      preferenceRevision: 3,
      appearance: { theme: { status: "ready", value: "system" } },
      localization: { weekStart: { status: "ready", value: "monday" } },
      fitness: { weightUnit: { status: "ready", value: "kg" } },
      notifications: {
        reminderEmail: { status: "ready", value: { enabled: false } },
        pushQuietWindow: { status: "ready", value: { status: "disabled" } },
      },
    },
    issues: [],
  },
};

let authCallback: ((event: string, session: unknown) => void) | undefined;
let currentSWRData: CurrentProfileResponse | undefined;
let swrFetchers: Array<{
  key: unknown;
  fetcher: () => Promise<CurrentProfileResponse>;
}> = [];
const mockMutate = vi.fn();

describe("useCurrentProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authCallback = undefined;
    currentSWRData = undefined;
    swrFetchers = [];
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-a" } } },
    });
    mockOnAuthStateChange.mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockSWR.mockImplementation((key, fetcher, options) => {
      swrFetchers.push({ key, fetcher });
      return {
      data: currentSWRData ?? options?.fallbackData,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
      };
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  it("exposes an explicit loading state before the authenticated snapshot is available", async () => {
    const { useCurrentProfile } = await import("@/lib/hooks/use-current-profile");
    mockSWR.mockImplementation((_key, _fetcher, options) => ({
      data: options?.fallbackData,
      error: undefined,
      isLoading: true,
      mutate: mockMutate,
    }));

    const { result } = renderHook(() => useCurrentProfile());

    expect(result.current.status).toBe("loading");
    expect(result.current.isLoading).toBe(true);
    expect(result.current.currentProfile).toBeUndefined();
  });

  it("hydrates the canonical snapshot and scopes the cache key by subject", async () => {
    const { useCurrentProfile } = await import("@/lib/hooks/use-current-profile");
    const { result } = renderHook(() =>
      useCurrentProfile({ initialData: baseProfile, initialSubject: "user-a" }),
    );

    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.objectContaining({
          fallbackData: baseProfile,
          revalidateOnFocus: true,
          revalidateOnReconnect: true,
        }),
      ),
    );
    expect(result.current.currentProfile?.preferences.fitness.weightUnit).toEqual({
      status: "ready",
      value: "kg",
    });
  });

  it("revalidates on window focus without polling", async () => {
    const { useCurrentProfile } = await import("@/lib/hooks/use-current-profile");
    renderHook(() =>
      useCurrentProfile({ initialData: baseProfile, initialSubject: "user-a" }),
    );

    await waitFor(() => expect(mockSWR).toHaveBeenCalled());
    const options = mockSWR.mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(options.revalidateOnFocus).toBe(true);
    expect(options.revalidateOnReconnect).toBe(true);
    expect(options.refreshInterval).toBeUndefined();
  });

  it("clears the accepted snapshot on logout before isolating the next subject", async () => {
    const { useCurrentProfile } = await import("@/lib/hooks/use-current-profile");
    currentSWRData = baseProfile;
    const { result } = renderHook(() => useCurrentProfile());

    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.any(Object),
      ),
    );

    act(() => authCallback?.("SIGNED_OUT", null));
    await waitFor(() => expect(result.current.currentProfile).toBeUndefined());

    act(() =>
      authCallback?.("SIGNED_IN", { user: { id: "user-b" } }),
    );
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-b"],
        expect.any(Function),
        expect.any(Object),
      ),
    );
  });

  it("ignores a user-A request that resolves after the session changes to user B", async () => {
    const { useCurrentProfile } = await import("@/lib/hooks/use-current-profile");
    currentSWRData = baseProfile;
    const { result } = renderHook(() => useCurrentProfile());

    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.any(Object),
      ),
    );
    const userAFetcher = swrFetchers.find(
      ({ key }) => Array.isArray(key) && key[1] === "user-a",
    )?.fetcher;
    expect(userAFetcher).toBeDefined();

    currentSWRData = undefined;
    act(() => authCallback?.("SIGNED_OUT", null));
    act(() => authCallback?.("SIGNED_IN", { user: { id: "user-b" } }));
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-b"],
        expect.any(Function),
        expect.any(Object),
      ),
    );

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(baseProfile),
    });
    await act(async () => {
      await expect(userAFetcher?.()).rejects.toThrow(
        "inactive session",
      );
    });

    expect(result.current.currentProfile).toBeUndefined();
    expect(result.current.status).toBe("unavailable");
  });

  it("clears pending commands when logout starts a new session generation", async () => {
    const { useCurrentProfileCommands } = await import(
      "@/lib/hooks/use-current-profile"
    );
    let resolveCommand!: (response: unknown) => void;
    const commandResponse = new Promise((resolve) => {
      resolveCommand = resolve;
    });
    mockFetch.mockImplementationOnce(() => commandResponse);
    currentSWRData = baseProfile;

    const { result } = renderHook(() => useCurrentProfileCommands());
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.any(Object),
      ),
    );

    let command: Promise<unknown> | undefined;
    act(() => {
      command = result.current.runCommand(
        "fitness",
        "/api/preferences/fitness",
        { type: "setWeightUnit", weightUnit: "lbs" },
      );
    });
    await waitFor(() =>
      expect(result.current.pendingIntents).toEqual({
        fitness: { type: "setWeightUnit", weightUnit: "lbs" },
      }),
    );

    act(() => authCallback?.("SIGNED_OUT", null));
    await waitFor(() => {
      expect(result.current.pendingIntents).toEqual({});
      expect(result.current.currentProfile).toBeUndefined();
    });

    act(() =>
      authCallback?.("SIGNED_IN", { user: { id: "user-b" } }),
    );
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-b"],
        expect.any(Function),
        expect.any(Object),
      ),
    );

    resolveCommand({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ changed: true }),
    });
    await act(async () => {
      await command;
    });

    expect(result.current.pendingIntents).toEqual({});
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("does not expose or reuse unbound SSR data before the session subject is known", async () => {
    const { useCurrentProfile } = await import("@/lib/hooks/use-current-profile");
    currentSWRData = baseProfile;
    const { result } = renderHook(() =>
      useCurrentProfile({ initialData: baseProfile }),
    );

    expect(result.current.currentProfile).toBeUndefined();
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.objectContaining({ fallbackData: undefined }),
      ),
    );
    expect(result.current.currentProfile).toEqual(baseProfile.currentProfile);
  });

  it("rejects a stale lower-revision revalidation result", async () => {
    const { acceptCurrentProfileSnapshot } = await import(
      "@/lib/hooks/use-current-profile"
    );
    const stale = structuredClone(baseProfile);
    stale.currentProfile.preferences.preferenceRevision = 2;
    expect(acceptCurrentProfileSnapshot(baseProfile, stale)).toBe(baseProfile);
  });

  it("decodes the API response at the transport boundary", async () => {
    const { fetchCurrentProfile } = await import(
      "@/lib/hooks/use-current-profile"
    );
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(baseProfile),
    });

    await expect(fetchCurrentProfile()).resolves.toEqual(baseProfile);
  });

  it("rejects a malformed successful response at the runtime boundary", async () => {
    const { fetchCurrentProfile } = await import(
      "@/lib/hooks/use-current-profile"
    );
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          currentProfile: {
            ...baseProfile.currentProfile,
            profileDetails: { fullName: 42, avatarUrl: null },
          },
        }),
    });

    await expect(fetchCurrentProfile()).rejects.toMatchObject({
      code: "invalid_response",
      status: 200,
    });
  });

  it("exposes an unavailable state when the Current Profile source cannot be read", async () => {
    const {
      CurrentProfileRequestError,
      useCurrentProfile,
    } = await import("@/lib/hooks/use-current-profile");
    const unavailable = new CurrentProfileRequestError(
      "current_profile_unavailable",
      503,
      "current_profile_unavailable",
    );
    mockSWR.mockImplementation(() => ({
      data: undefined,
      error: unavailable,
      isLoading: false,
      mutate: mockMutate,
    }));

    const { result } = renderHook(() =>
      useCurrentProfile({ initialSubject: "user-a" }),
    );

    expect(result.current.status).toBe("unavailable");
    expect(result.current.unavailableReason).toBe("current_profile_unavailable");
    expect(result.current.currentProfile).toBeUndefined();
  });

  it("shows a pending Fitness intent, revalidates after acceptance, and rolls back on rejection", async () => {
    const { useFitnessPreference } = await import(
      "@/lib/hooks/use-profile-preferences"
    );
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          weightUnit: "lbs",
          preferenceRevision: 4,
          changed: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(baseProfile),
      });
    mockMutate.mockImplementation(async (updater) => {
      if (typeof updater === "function") return updater(currentSWRData);
      return currentSWRData;
    });
    currentSWRData = baseProfile;

    const { result } = renderHook(() => useFitnessPreference());
    await waitFor(() => expect(mockSWR).toHaveBeenLastCalledWith(
      ["current-profile", "user-a"],
      expect.any(Function),
      expect.any(Object),
    ));

    let accepted: Promise<unknown> | undefined;
    act(() => {
      accepted = result.current.setWeightUnit("lbs");
    });
    await waitFor(() =>
      expect(result.current.weightUnit).toEqual({ status: "pending", value: "lbs" }),
    );
    await act(async () => {
      await accepted;
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/preferences/fitness",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockMutate).toHaveBeenCalledWith(expect.any(Function), {
      revalidate: false,
    });

    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/preferences/fitness") {
        return Promise.reject(new Error("rejected"));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(baseProfile),
      });
    });
    let rejected: Promise<unknown> | undefined;
    act(() => {
      rejected = result.current.setWeightUnit("kg");
    });
    await expect(rejected).rejects.toThrow("rejected");
    await waitFor(() =>
      expect(result.current.weightUnit).toEqual({ status: "ready", value: "lbs" }),
    );
  });

  it("revalidates Current Profile after an accepted User Time Zone replacement", async () => {
    const { useUserTimeZone } = await import(
      "@/lib/hooks/use-profile-preferences"
    );
    const updatedProfile = structuredClone(baseProfile);
    updatedProfile.currentProfile.userTimeZone = {
      status: "resolved",
      value: "America/New_York",
    };
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ timeZone: "America/New_York", changed: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(updatedProfile),
      });
    currentSWRData = baseProfile;
    mockMutate.mockImplementation(async (updater) => {
      if (typeof updater === "function") {
        const next = await updater(currentSWRData);
        currentSWRData = next;
        return next;
      }
      return currentSWRData;
    });

    const { result } = renderHook(() => useUserTimeZone());
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.any(Object),
      ),
    );

    await act(async () => {
      await result.current.setUserTimeZone("America/New_York");
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "/api/user-time-zone",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ timeZone: "America/New_York" }),
      }),
    );
    await waitFor(() =>
      expect(result.current.timeZone).toEqual({
        status: "resolved",
        value: "America/New_York",
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/current-profile",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("keeps the accepted User Time Zone when its replacement is rejected", async () => {
    const { useUserTimeZone } = await import(
      "@/lib/hooks/use-profile-preferences"
    );
    mockFetch.mockRejectedValueOnce(new Error("user_time_zone_unavailable"));
    currentSWRData = baseProfile;

    const { result } = renderHook(() => useUserTimeZone());
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.any(Object),
      ),
    );

    let rejected: Promise<unknown> | undefined;
    act(() => {
      rejected = result.current.setUserTimeZone("America/New_York");
    });
    await expect(rejected).rejects.toThrow("user_time_zone_unavailable");

    expect(result.current.timeZone).toEqual({
      status: "resolved",
      value: "America/Los_Angeles",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("shows a pending Appearance intent, applies its revision, and revalidates Current Profile", async () => {
    const { useAppearancePreference } = await import(
      "@/lib/hooks/use-profile-preferences"
    );
    const acceptedProfile = structuredClone(baseProfile);
    acceptedProfile.currentProfile.preferences.preferenceRevision = 4;
    acceptedProfile.currentProfile.preferences.appearance.theme = {
      status: "ready",
      value: "dark",
    };
    let resolveAppearanceCommand!: (response: unknown) => void;
    const appearanceCommand = new Promise((resolve) => {
      resolveAppearanceCommand = resolve;
    });
    mockFetch
      .mockImplementationOnce(() => appearanceCommand)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(acceptedProfile),
      });
    mockMutate.mockImplementation(async (updater) => {
      if (typeof updater === "function") return updater(currentSWRData);
      return currentSWRData;
    });
    currentSWRData = baseProfile;

    const { result } = renderHook(() => useAppearancePreference());
    await waitFor(() =>
      expect(result.current.theme).toEqual({ status: "ready", value: "system" }),
    );

    let accepted: Promise<unknown> | undefined;
    act(() => {
      accepted = result.current.selectTheme("dark");
    });
    await waitFor(() =>
      expect(result.current.theme).toEqual({ status: "pending", value: "dark" }),
    );
    expect(result.current.acceptedTheme).toEqual({
      status: "ready",
      value: "system",
    });

    resolveAppearanceCommand({
      ok: true,
      json: () =>
        Promise.resolve({
          theme: "dark",
          preferenceRevision: 4,
          changed: true,
        }),
    });

    await act(async () => {
      await accepted;
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/preferences/appearance",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockMutate).toHaveBeenCalledWith(expect.any(Function), {
      revalidate: false,
    });
    await waitFor(() =>
      expect(result.current.theme).toEqual({ status: "ready", value: "dark" }),
    );
    expect(result.current.currentProfile?.preferences.preferenceRevision).toBe(4);
  });

  it("keeps an unavailable accepted Appearance value unavailable while exposing a usable state", async () => {
    const { useAppearancePreference } = await import(
      "@/lib/hooks/use-profile-preferences"
    );
    const unavailableProfile = structuredClone(baseProfile);
    unavailableProfile.currentProfile.preferences.appearance.theme = {
      status: "unavailable",
      reason: "invalidStoredValue",
    };
    unavailableProfile.currentProfile.issues = [
      { scope: "appearance.theme", code: "invalidStoredValue" },
    ];
    currentSWRData = unavailableProfile;

    const { result } = renderHook(() => useAppearancePreference());

    await waitFor(() =>
      expect(result.current.theme).toEqual({
        status: "unavailable",
        reason: "invalidStoredValue",
      }),
    );
    expect(result.current.acceptedTheme).toEqual({
      status: "unavailable",
      reason: "invalidStoredValue",
    });
  });

  it("serializes same-concept commands so the latest intent is sent second", async () => {
    const { useCurrentProfileCommands } = await import(
      "@/lib/hooks/use-current-profile"
    );
    let resolveFirst!: (response: unknown) => void;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockFetch.mockImplementationOnce(() => firstResponse).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        weightUnit: "kg",
        preferenceRevision: 5,
        changed: true,
      }),
    });
    currentSWRData = baseProfile;
    mockMutate.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCurrentProfileCommands());
    await waitFor(() => expect(mockSWR).toHaveBeenLastCalledWith(
      ["current-profile", "user-a"],
      expect.any(Function),
      expect.any(Object),
    ));

    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    act(() => {
      first = result.current.runCommand(
        "fitness",
        "/api/preferences/fitness",
        { type: "setWeightUnit", weightUnit: "lbs" },
      );
      second = result.current.runCommand(
        "fitness",
        "/api/preferences/fitness",
        { type: "setWeightUnit", weightUnit: "kg" },
      );
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    resolveFirst({
      ok: true,
      json: () => Promise.resolve({
        weightUnit: "lbs",
        preferenceRevision: 4,
        changed: true,
      }),
    });
    await act(async () => {
      await first;
      await second;
    });

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/preferences/fitness",
      expect.objectContaining({
        body: JSON.stringify({ type: "setWeightUnit", weightUnit: "kg" }),
      }),
    );
  });

  it("allows different-concept commands to proceed concurrently", async () => {
    const { useCurrentProfileCommands } = await import(
      "@/lib/hooks/use-current-profile"
    );
    const resolvers: Array<(response: unknown) => void> = [];
    mockFetch.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    currentSWRData = baseProfile;
    mockMutate.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCurrentProfileCommands());
    await waitFor(() => expect(mockSWR).toHaveBeenLastCalledWith(
      ["current-profile", "user-a"],
      expect.any(Function),
      expect.any(Object),
    ));

    let appearance: Promise<unknown> | undefined;
    let localization: Promise<unknown> | undefined;
    act(() => {
      appearance = result.current.runCommand(
        "appearance",
        "/api/preferences/appearance",
        { type: "setTheme", theme: "dark" },
      );
      localization = result.current.runCommand(
        "localization",
        "/api/preferences/localization",
        { type: "setWeekStart", weekStart: "sunday" },
      );
    });

    await waitFor(() => expect(resolvers).toHaveLength(2));
    for (const resolve of resolvers) {
      resolve({ ok: true, json: () => Promise.resolve({ changed: true }) });
    }
    await act(async () => {
      await appearance;
      await localization;
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("applies an accepted narrow outcome before revalidating Current Profile", async () => {
    const { useFitnessPreference } = await import(
      "@/lib/hooks/use-profile-preferences"
    );
    let resolveRevalidation!: (value: CurrentProfileResponse) => void;
    const revalidation = new Promise<CurrentProfileResponse>((resolve) => {
      resolveRevalidation = resolve;
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          weightUnit: "lbs",
          preferenceRevision: 4,
          changed: true,
        }),
    });
    currentSWRData = baseProfile;
    mockMutate.mockReturnValue(revalidation);

    const { result } = renderHook(() => useFitnessPreference());
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.any(Object),
      ),
    );

    let accepted: Promise<unknown> | undefined;
    act(() => {
      accepted = result.current.setWeightUnit("lbs");
    });
    await waitFor(() => expect(mockMutate).toHaveBeenCalled());

    expect(result.current.weightUnit).toEqual({
      status: "ready",
      value: "lbs",
    });

    resolveRevalidation(baseProfile);
    await act(async () => {
      await accepted;
    });
  });

  it("uses the Localization owner command and applies its accepted Week Start outcome", async () => {
    const { useLocalizationPreference } = await import(
      "@/lib/hooks/use-profile-preferences"
    );
    let resolveRevalidation!: (value: CurrentProfileResponse) => void;
    const revalidation = new Promise<CurrentProfileResponse>((resolve) => {
      resolveRevalidation = resolve;
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          weekStart: "sunday",
          preferenceRevision: 4,
          changed: true,
        }),
    });
    currentSWRData = baseProfile;
    mockMutate.mockReturnValue(revalidation);

    const { result } = renderHook(() => useLocalizationPreference());
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.any(Object),
      ),
    );

    let accepted: Promise<unknown> | undefined;
    act(() => {
      accepted = result.current.setWeekStart("sunday");
    });
    await waitFor(() => expect(mockMutate).toHaveBeenCalled());

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/preferences/localization",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "setWeekStart", weekStart: "sunday" }),
      }),
    );
    expect(result.current.weekStart).toEqual({
      status: "ready",
      value: "sunday",
    });
    expect(result.current.currentProfile?.preferences.preferenceRevision).toBe(4);

    resolveRevalidation(baseProfile);
    await act(async () => {
      await accepted;
    });
  });

  it("does not apply a no-op outcome as a new accepted revision", async () => {
    const { useFitnessPreference } = await import(
      "@/lib/hooks/use-profile-preferences"
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          weightUnit: "kg",
          preferenceRevision: 3,
          changed: false,
        }),
    });
    currentSWRData = baseProfile;
    mockMutate.mockResolvedValue(baseProfile);

    const { result } = renderHook(() => useFitnessPreference());
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.any(Object),
      ),
    );

    await act(async () => {
      await result.current.setWeightUnit("kg");
    });

    expect(result.current.weightUnit).toEqual({
      status: "ready",
      value: "kg",
    });
    expect(result.current.currentProfile?.preferences.preferenceRevision).toBe(3);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(expect.any(Function), {
      revalidate: false,
    });
  });

  it("rejects a stale same-concept outcome after a newer revision was applied", async () => {
    const { useFitnessPreference } = await import(
      "@/lib/hooks/use-profile-preferences"
    );
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            weightUnit: "lbs",
            preferenceRevision: 4,
            changed: true,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            weightUnit: "kg",
            preferenceRevision: 3,
            changed: true,
          }),
      });
    currentSWRData = baseProfile;
    mockMutate.mockResolvedValue(baseProfile);

    const { result } = renderHook(() => useFitnessPreference());
    await waitFor(() =>
      expect(mockSWR).toHaveBeenLastCalledWith(
        ["current-profile", "user-a"],
        expect.any(Function),
        expect.any(Object),
      ),
    );

    await act(async () => {
      await result.current.setWeightUnit("lbs");
    });
    await act(async () => {
      await result.current.setWeightUnit("kg");
    });

    expect(result.current.weightUnit).toEqual({
      status: "ready",
      value: "lbs",
    });
    expect(result.current.currentProfile?.preferences.preferenceRevision).toBe(4);
  });
});
