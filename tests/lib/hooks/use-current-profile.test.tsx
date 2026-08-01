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
const mockMutate = vi.fn();

describe("useCurrentProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authCallback = undefined;
    currentSWRData = undefined;
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-a" } } },
    });
    mockOnAuthStateChange.mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mockSWR.mockImplementation((_key, _fetcher, options) => ({
      data: currentSWRData ?? options?.fallbackData,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
    }));
    vi.stubGlobal("fetch", mockFetch);
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
      expect(result.current.weightUnit).toEqual({ status: "ready", value: "kg" }),
    );
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
});
