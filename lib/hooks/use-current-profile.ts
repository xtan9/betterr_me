"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { type KeyedMutator } from "swr";
import {
  decodeCurrentProfileResponse,
  type CurrentProfileResponse,
} from "@/lib/current-profile";
import { createClient } from "@/lib/supabase/client";

export const CURRENT_PROFILE_CACHE_KEY = "current-profile";

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
      response.status,
      typeof body?.code === "string" ? body.code : undefined,
    );
  }

  return decodeCurrentProfileResponse(body);
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
  isAuthenticated: boolean;
  isLoading: boolean;
  mutate: KeyedMutator<CurrentProfileResponse>;
  revalidate: () => Promise<CurrentProfileResponse | undefined>;
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
  const subjectRef = useRef<string | null | undefined>(options.initialSubject);
  const acceptedSnapshotRef = useRef<CurrentProfileResponse | undefined>(
    acceptedSnapshot,
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
        setHydrationData(undefined);
        setAcceptedSnapshot(undefined);
        acceptedSnapshotRef.current = undefined;
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
    const accepted = acceptCurrentProfileSnapshot(
      acceptedSnapshotRef.current,
      next,
    );
    acceptedSnapshotRef.current = accepted;
    setAcceptedSnapshot(accepted);
    return accepted;
  }, []);
  const query = useSWR<CurrentProfileResponse>(key, profileFetcher, {
    fallbackData: hydrationData,
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
      setAcceptedSnapshot(accepted);
    }
  }, [query.data]);

  const revalidate = useCallback(async () => {
    return query.mutate(
      async (current) => {
        const accepted = acceptCurrentProfileSnapshot(
          acceptedSnapshotRef.current ?? current,
          await fetchCurrentProfile(),
        );
        acceptedSnapshotRef.current = accepted;
        setAcceptedSnapshot(accepted);
        return accepted;
      },
      { revalidate: false },
    );
  }, [query]);

  const acceptedData = query.data
    ? acceptCurrentProfileSnapshot(acceptedSnapshot, query.data)
    : acceptedSnapshot;
  const data =
    subject === undefined || subject === null ? undefined : acceptedData;
  return {
    data,
    currentProfile: data?.currentProfile,
    error: subject === null ? undefined : query.error,
    isAuthenticated: subject !== null && subject !== undefined,
    isLoading:
      subject === undefined ||
      (subject !== null && query.isLoading && !hydrationData),
    mutate: query.mutate,
    revalidate,
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
  const { revalidate } = profile;
  const [pendingIntents, setPendingIntents] = useState<Record<string, unknown>>(
    {},
  );
  const latestSequence = useRef<Record<string, number>>({});
  const queues = useRef<Record<string, Promise<unknown>>>({});

  const runCommand = useCallback(
    <Result,>(
      concept: string,
      endpoint: string,
      intent: unknown,
      method: "POST" | "PATCH" | "PUT" = "POST",
    ) => {
      const sequence = (latestSequence.current[concept] ?? 0) + 1;
      latestSequence.current[concept] = sequence;
      setPendingIntents((current) => ({ ...current, [concept]: intent }));

      const previous = queues.current[concept] ?? Promise.resolve();
      const operation = previous
        .catch(() => undefined)
        .then(async () => {
          try {
            const result = await postCurrentProfileCommand<Result>(
              endpoint,
              intent,
              method,
            );
            if (latestSequence.current[concept] === sequence) {
              setPendingIntents((current) => {
                const next = { ...current };
                delete next[concept];
                return next;
              });
              await revalidate();
            }
            return result;
          } catch (error) {
            if (latestSequence.current[concept] === sequence) {
              setPendingIntents((current) => {
                const next = { ...current };
                delete next[concept];
                return next;
              });
            }
            throw error;
          }
        });

      queues.current[concept] = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [revalidate],
  );

  const isPending = useCallback(
    (concept: string) => Object.prototype.hasOwnProperty.call(pendingIntents, concept),
    [pendingIntents],
  );

  return { ...profile, isPending, pendingIntents, runCommand };
}
