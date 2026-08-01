"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { type KeyedMutator } from "swr";
import {
  decodeCurrentProfileResponse,
  type CurrentProfile,
  type CurrentProfileResponse,
  type PushQuietWindow,
} from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/client";

export const CURRENT_PROFILE_CACHE_KEY = "current-profile";

export type CurrentProfileStatus = "loading" | "available" | "unavailable";

export const CURRENT_PROFILE_UNAVAILABLE_REASONS = [
  "unauthenticated",
  "profile_not_provisioned",
  "current_profile_unavailable",
  "invalid_response",
  "request_failed",
] as const;

export type CurrentProfileUnavailableReason =
  (typeof CURRENT_PROFILE_UNAVAILABLE_REASONS)[number];

export class CurrentProfileRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "CurrentProfileRequestError";
  }
}

const PREFERENCE_CONCEPTS = [
  "appearance",
  "localization",
  "fitness",
  "notifications",
] as const;

type PreferenceConcept = (typeof PREFERENCE_CONCEPTS)[number];

type PreferenceRevisionOutcome = Record<string, unknown> & {
  preferenceRevision: number;
  changed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPreferenceRevisionOutcome(
  value: unknown,
): value is PreferenceRevisionOutcome {
  return (
    isRecord(value) &&
    typeof value.preferenceRevision === "number" &&
    Number.isInteger(value.preferenceRevision) &&
    value.preferenceRevision >= 0 &&
    typeof value.changed === "boolean"
  );
}

function readyPreference<Value>(value: Value) {
  return { status: "ready" as const, value };
}

function isPushQuietWindow(value: unknown): value is PushQuietWindow {
  return (
    isRecord(value) &&
    (value.status === "disabled" ||
      (value.status === "enabled" &&
        typeof value.startLocal === "string" &&
        typeof value.endLocal === "string"))
  );
}

function replacePreferenceIssue(
  profile: CurrentProfile,
  scope: CurrentProfile["issues"][number]["scope"],
): CurrentProfile["issues"] {
  return profile.issues.filter((issue) => issue.scope !== scope);
}

function applyNarrowPreferenceOutcome(
  current: CurrentProfileResponse,
  concept: PreferenceConcept,
  outcome: unknown,
): CurrentProfileResponse | undefined {
  if (!isPreferenceRevisionOutcome(outcome) || !outcome.changed) return undefined;

  const profile = current.currentProfile;
  let nextProfile: CurrentProfile;

  if (
    concept === "appearance" &&
    isRecord(outcome) &&
    (outcome.theme === "system" ||
      outcome.theme === "light" ||
      outcome.theme === "dark")
  ) {
    nextProfile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        preferenceRevision: Math.max(
          profile.preferences.preferenceRevision,
          outcome.preferenceRevision,
        ),
        appearance: { theme: readyPreference(outcome.theme) },
      },
      issues: replacePreferenceIssue(profile, "appearance.theme"),
    };
  } else if (
    concept === "localization" &&
    isRecord(outcome) &&
    (outcome.weekStart === "sunday" || outcome.weekStart === "monday")
  ) {
    nextProfile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        preferenceRevision: Math.max(
          profile.preferences.preferenceRevision,
          outcome.preferenceRevision,
        ),
        localization: { weekStart: readyPreference(outcome.weekStart) },
      },
      issues: replacePreferenceIssue(profile, "localization.weekStart"),
    };
  } else if (
    concept === "fitness" &&
    isRecord(outcome) &&
    (outcome.weightUnit === "kg" || outcome.weightUnit === "lbs")
  ) {
    nextProfile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        preferenceRevision: Math.max(
          profile.preferences.preferenceRevision,
          outcome.preferenceRevision,
        ),
        fitness: { weightUnit: readyPreference(outcome.weightUnit) },
      },
      issues: replacePreferenceIssue(profile, "fitness.weightUnit"),
    };
  } else if (
    concept === "notifications" &&
    isRecord(outcome) &&
    isRecord(outcome.reminderEmail) &&
    typeof outcome.reminderEmail.enabled === "boolean"
  ) {
    nextProfile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        preferenceRevision: Math.max(
          profile.preferences.preferenceRevision,
          outcome.preferenceRevision,
        ),
        notifications: {
          ...profile.preferences.notifications,
          reminderEmail: {
            status: "ready",
            value: { enabled: outcome.reminderEmail.enabled },
          },
        },
      },
      issues: replacePreferenceIssue(profile, "notifications.reminderEmail"),
    };
  } else if (
    concept === "notifications" &&
    isRecord(outcome) &&
    isPushQuietWindow(outcome.pushQuietWindow)
  ) {
    nextProfile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        preferenceRevision: Math.max(
          profile.preferences.preferenceRevision,
          outcome.preferenceRevision,
        ),
        notifications: {
          ...profile.preferences.notifications,
          pushQuietWindow: readyPreference(outcome.pushQuietWindow),
        },
      },
      issues: replacePreferenceIssue(profile, "notifications.pushQuietWindow"),
    };
  } else {
    return undefined;
  }

  return { ...current, currentProfile: nextProfile };
}

export async function fetchCurrentProfile(): Promise<CurrentProfileResponse> {
  const response = await fetch("/api/current-profile", {
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new CurrentProfileRequestError(
      typeof body?.error === "string"
        ? body.error
        : `Current Profile request failed (${response.status})`,
      response.status || 200,
      typeof body?.code === "string"
        ? body.code
        : typeof body?.error === "string"
          ? body.error
          : undefined,
    );
  }

  try {
    return decodeCurrentProfileResponse(body);
  } catch {
    throw new CurrentProfileRequestError(
      "Current Profile response was invalid",
      response.status || 200,
      "invalid_response",
    );
  }
}

class StaleCurrentProfileRequestError extends Error {
  constructor() {
    super("Current Profile request belongs to an inactive session");
    this.name = "StaleCurrentProfileRequestError";
  }
}

/** Keep a newer accepted preference revision when a slower request resolves late. */
export function acceptCurrentProfileSnapshot(
  current: CurrentProfileResponse | undefined,
  next: CurrentProfileResponse,
): CurrentProfileResponse {
  if (
    current &&
    next.currentProfile.preferences.preferenceRevision <
      current.currentProfile.preferences.preferenceRevision
  ) {
    return current;
  }
  return next;
}

export function currentProfileCacheKey(
  subject: string | null | undefined,
): readonly [typeof CURRENT_PROFILE_CACHE_KEY, string] | null {
  return subject ? [CURRENT_PROFILE_CACHE_KEY, subject] : null;
}

export interface UseCurrentProfileOptions {
  initialData?: CurrentProfileResponse;
  /** Internal SSR binding; never included in the public Current Profile response. */
  initialSubject?: string;
}

export interface UseCurrentProfileResult {
  data?: CurrentProfileResponse;
  currentProfile?: CurrentProfileResponse["currentProfile"];
  error?: Error;
  status: CurrentProfileStatus;
  unavailableReason?: CurrentProfileUnavailableReason;
  /** Internal session generation used to isolate commands from auth transitions. */
  sessionVersion: number;
  isAuthenticated: boolean;
  isLoading: boolean;
  mutate: KeyedMutator<CurrentProfileResponse>;
  revalidate: () => Promise<CurrentProfileResponse | undefined>;
  applyAcceptedPreferenceOutcome: (
    concept: string,
    outcome: unknown,
  ) => boolean;
}

function currentProfileUnavailableReason(
  subject: string | null | undefined,
  error: Error | undefined,
): CurrentProfileUnavailableReason | undefined {
  if (subject === null) return "unauthenticated";
  if (subject === undefined || !error) return undefined;

  if (error instanceof CurrentProfileRequestError) {
    if (error.status === 401) return "unauthenticated";
    if (
      error.code === "profile_not_provisioned" ||
      error.code === "current_profile_unavailable" ||
      error.code === "invalid_response"
    ) {
      return error.code;
    }
  }
  return "request_failed";
}

export function useCurrentProfile(
  options: UseCurrentProfileOptions = {},
): UseCurrentProfileResult {
  const hasBoundHydration = Boolean(options.initialSubject);
  const [subject, setSubject] = useState<string | null | undefined>(
    options.initialSubject,
  );
  const [hydrationData, setHydrationData] = useState(
    hasBoundHydration ? options.initialData : undefined,
  );
  const [acceptedSnapshot, setAcceptedSnapshot] = useState<
    CurrentProfileResponse | undefined
  >(hasBoundHydration ? options.initialData : undefined);
  const [sessionVersion, setSessionVersion] = useState(0);
  const subjectRef = useRef<string | null | undefined>(options.initialSubject);
  const sessionVersionRef = useRef(0);
  const acceptedSnapshotRef = useRef<CurrentProfileResponse | undefined>(
    acceptedSnapshot,
  );
  const appliedPreferenceRevisionsRef = useRef<Record<string, number>>(
    options.initialData
      ? Object.fromEntries(
          PREFERENCE_CONCEPTS.map((concept) => [
            concept,
            options.initialData!.currentProfile.preferences.preferenceRevision,
          ]),
        )
      : {},
  );

  const recordAcceptedPreferenceRevision = useCallback(
    (snapshot: CurrentProfileResponse | undefined) => {
      if (!snapshot) return;
      const revision = snapshot.currentProfile.preferences.preferenceRevision;
      for (const concept of PREFERENCE_CONCEPTS) {
        appliedPreferenceRevisionsRef.current[concept] = Math.max(
          appliedPreferenceRevisionsRef.current[concept] ?? 0,
          revision,
        );
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const client = createClient();
    if (
      !client.auth ||
      typeof client.auth.onAuthStateChange !== "function" ||
      typeof client.auth.getSession !== "function"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- normalize an unavailable auth boundary
      setSubject(null);
      return () => {
        active = false;
      };
    }
    const applySession = (session: { user?: { id: string } } | null) => {
      const nextSubject = session?.user?.id ?? null;
      if (
        subjectRef.current !== undefined &&
        subjectRef.current !== nextSubject
      ) {
        sessionVersionRef.current += 1;
        setSessionVersion(sessionVersionRef.current);
        setHydrationData(undefined);
        setAcceptedSnapshot(undefined);
        acceptedSnapshotRef.current = undefined;
        appliedPreferenceRevisionsRef.current = {};
      } else if (subjectRef.current === undefined) {
        sessionVersionRef.current += 1;
        setSessionVersion(sessionVersionRef.current);
      }
      subjectRef.current = nextSubject;
      setSubject(nextSubject);
    };
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      if (active) applySession(session);
    });

    void client.auth.getSession().then(({ data }) => {
      if (active) applySession(data.session);
    });

    return () => {
      active = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  const key = currentProfileCacheKey(subject);
  const profileFetcher = useCallback(async () => {
    const next = await fetchCurrentProfile();
    if (
      sessionVersionRef.current !== sessionVersion ||
      subjectRef.current !== subject
    ) {
      throw new StaleCurrentProfileRequestError();
    }
    const accepted = acceptCurrentProfileSnapshot(
      acceptedSnapshotRef.current,
      next,
    );
    acceptedSnapshotRef.current = accepted;
    recordAcceptedPreferenceRevision(accepted);
    setAcceptedSnapshot(accepted);
    return accepted;
  }, [recordAcceptedPreferenceRevision, sessionVersion, subject]);
  const query = useSWR<CurrentProfileResponse>(key, profileFetcher, {
    fallbackData: hydrationData,
    keepPreviousData: false,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (query.data) {
      const accepted = acceptCurrentProfileSnapshot(
        acceptedSnapshotRef.current,
        query.data,
      );
      acceptedSnapshotRef.current = accepted;
      recordAcceptedPreferenceRevision(accepted);
      setAcceptedSnapshot(accepted);
    }
  }, [query.data, recordAcceptedPreferenceRevision]);

  const revalidate = useCallback(async () => {
    return query.mutate(
      async (current) => {
        const next = await fetchCurrentProfile();
        if (
          sessionVersionRef.current !== sessionVersion ||
          subjectRef.current !== subject
        ) {
          return undefined;
        }
        const accepted = acceptCurrentProfileSnapshot(acceptedSnapshotRef.current ?? current, next);
        acceptedSnapshotRef.current = accepted;
        recordAcceptedPreferenceRevision(accepted);
        setAcceptedSnapshot(accepted);
        return accepted;
      },
      { revalidate: false },
    );
  }, [query, recordAcceptedPreferenceRevision, sessionVersion, subject]);

  const applyAcceptedPreferenceOutcome = useCallback(
    (concept: string, outcome: unknown) => {
      if (!PREFERENCE_CONCEPTS.includes(concept as PreferenceConcept)) {
        return false;
      }
      if (!isPreferenceRevisionOutcome(outcome) || !outcome.changed) {
        return false;
      }

      const current = acceptedSnapshotRef.current;
      if (!current) return false;

      const preferenceConcept = concept as PreferenceConcept;
      const currentRevision =
        appliedPreferenceRevisionsRef.current[preferenceConcept] ??
        current.currentProfile.preferences.preferenceRevision;
      if (outcome.preferenceRevision <= currentRevision) return false;

      const accepted = applyNarrowPreferenceOutcome(
        current,
        preferenceConcept,
        outcome,
      );
      if (!accepted) return false;

      appliedPreferenceRevisionsRef.current[preferenceConcept] =
        outcome.preferenceRevision;
      acceptedSnapshotRef.current = accepted;
      setAcceptedSnapshot(accepted);
      void Promise.resolve(query.mutate(accepted, { revalidate: false })).catch(
        () => undefined,
      );
      return true;
    },
    [query],
  );

  const acceptedData = query.data
    ? acceptCurrentProfileSnapshot(acceptedSnapshot, query.data)
    : acceptedSnapshot;
  const data =
    subject === undefined || subject === null ? undefined : acceptedData;
  const isLoading =
    subject === undefined ||
    (subject !== null && !data && query.isLoading && !hydrationData);
  const status: CurrentProfileStatus = isLoading
    ? "loading"
    : subject === null || query.error || !data
      ? "unavailable"
      : "available";
  const unavailableReason =
    status === "unavailable"
      ? currentProfileUnavailableReason(subject, query.error)
      : undefined;
  return {
    data,
    currentProfile: data?.currentProfile,
    error: subject === null ? undefined : query.error,
    status,
    unavailableReason,
    sessionVersion,
    isAuthenticated: subject !== null && subject !== undefined,
    isLoading,
    mutate: query.mutate,
    revalidate,
    applyAcceptedPreferenceOutcome,
  };
}

export interface UseCurrentProfileCommandsResult extends UseCurrentProfileResult {
  isPending: (concept: string) => boolean;
  pendingIntents: Readonly<Record<string, unknown>>;
  runCommand: <Result>(
    concept: string,
    endpoint: string,
    intent: unknown,
    method?: "POST" | "PATCH" | "PUT",
  ) => Promise<Result>;
}

async function postCurrentProfileCommand<Result>(
  endpoint: string,
  intent: unknown,
  method: "POST" | "PATCH" | "PUT" = "POST",
): Promise<Result> {
  const response = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(intent),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CurrentProfileRequestError(
      typeof body?.error === "string"
        ? body.error
        : `Preference command failed (${response.status})`,
      response.status,
      typeof body?.code === "string" ? body.code : undefined,
    );
  }
  return body as Result;
}

export function useCurrentProfileCommands(
  options: UseCurrentProfileOptions = {},
): UseCurrentProfileCommandsResult {
  const profile = useCurrentProfile(options);
  const { applyAcceptedPreferenceOutcome, revalidate, sessionVersion } = profile;
  const [pendingState, setPendingState] = useState<{
    sessionVersion: number;
    values: Record<string, unknown>;
  }>({ sessionVersion, values: {} });
  const latestSequence = useRef<
    Record<string, { sessionVersion: number; value: number }>
  >({});
  const queues = useRef<
    Record<string, { sessionVersion: number; promise: Promise<unknown> }>
  >({});
  const sessionVersionRef = useRef(profile.sessionVersion);

  useEffect(() => {
    sessionVersionRef.current = profile.sessionVersion;
  }, [profile.sessionVersion]);

  const pendingIntents = useMemo(
    () =>
      pendingState.sessionVersion === sessionVersion
        ? pendingState.values
        : {},
    [pendingState, sessionVersion],
  );

  const runCommand = useCallback(
    <Result,>(
      concept: string,
      endpoint: string,
      intent: unknown,
      method: "POST" | "PATCH" | "PUT" = "POST",
    ) => {
      const requestSessionVersion = sessionVersion;
      const previousSequence = latestSequence.current[concept];
      const sequence =
        previousSequence?.sessionVersion === requestSessionVersion
          ? previousSequence.value + 1
          : 1;
      latestSequence.current[concept] = {
        sessionVersion: requestSessionVersion,
        value: sequence,
      };
      setPendingState((current) => ({
        sessionVersion: requestSessionVersion,
        values: {
          ...(current.sessionVersion === requestSessionVersion
            ? current.values
            : {}),
          [concept]: intent,
        },
      }));

      const previousEntry = queues.current[concept];
      const previous =
        previousEntry?.sessionVersion === requestSessionVersion
          ? previousEntry.promise
          : Promise.resolve();
      const operation = previous
        .catch(() => undefined)
        .then(async () => {
          try {
            const result = await postCurrentProfileCommand<Result>(
              endpoint,
              intent,
              method,
            );
            if (
              sessionVersionRef.current === requestSessionVersion &&
              latestSequence.current[concept]?.sessionVersion ===
                requestSessionVersion &&
              latestSequence.current[concept]?.value === sequence
            ) {
              setPendingState((current) => {
                if (current.sessionVersion !== requestSessionVersion) return current;
                const next = { ...current.values };
                delete next[concept];
                return { sessionVersion: requestSessionVersion, values: next };
              });
              applyAcceptedPreferenceOutcome(concept, result);
              await revalidate();
            }
            return result;
          } catch (error) {
            if (
              sessionVersionRef.current === requestSessionVersion &&
              latestSequence.current[concept]?.sessionVersion ===
                requestSessionVersion &&
              latestSequence.current[concept]?.value === sequence
            ) {
              setPendingState((current) => {
                if (current.sessionVersion !== requestSessionVersion) return current;
                const next = { ...current.values };
                delete next[concept];
                return { sessionVersion: requestSessionVersion, values: next };
              });
            }
            throw error;
          }
        });

      queues.current[concept] = {
        sessionVersion: requestSessionVersion,
        promise: operation.then(
          () => undefined,
          () => undefined,
        ),
      };
      return operation;
    },
    [applyAcceptedPreferenceOutcome, revalidate, sessionVersion],
  );

  const isPending = useCallback(
    (concept: string) => Object.prototype.hasOwnProperty.call(pendingIntents, concept),
    [pendingIntents],
  );

  return { ...profile, isPending, pendingIntents, runCommand };
}
