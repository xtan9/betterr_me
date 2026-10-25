import useSWR from "swr";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Exercise } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/client";
import {
  currentExerciseCommand,
  observeExerciseCommands,
} from "@/lib/fitness/exercise-command-client";

export function useExercises({ includeArchived = false } = {}) {
  const [ownerId, setOwnerId] = useState<string | null | undefined>(undefined);
  const [sessionError, setSessionError] = useState<Error | null>(null);
  useEffect(() => {
    let active = true;
    let events = 0;
    const client = createClient();
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      events += 1;
      if (active) {
        setOwnerId(session?.user.id ?? null);
        setSessionError(null);
      }
    });
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (active && events === 0) setOwnerId(data.session?.user.id ?? null);
      })
      .catch(() => {
        if (active && events === 0) {
          setOwnerId(null);
          setSessionError(new Error("Exercise session unavailable"));
        }
      });
    return () => {
      active = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);
  const journalText = useSyncExternalStore(
    observeExerciseCommands,
    () => {
      try {
        return ownerId
          ? JSON.stringify(currentExerciseCommand(ownerId))
          : "null";
      } catch {
        return "unavailable";
      }
    },
    () => "null",
  );
  const journal = useMemo(
    () =>
      journalText === "unavailable"
        ? null
        : (JSON.parse(journalText) as ReturnType<
            typeof currentExerciseCommand
          >),
    [journalText],
  );
  const journalError = useMemo(
    () =>
      journalText === "unavailable"
        ? new Error("Saved exercise change unavailable")
        : null,
    [journalText],
  );
  const url = includeArchived
    ? "/api/exercises?archived=all"
    : "/api/exercises";
  const { data, error, isLoading, mutate } = useSWR<{
    exercises: Exercise[];
    ownerId: string;
    customExercises: { contractVersion: 1; ready: boolean };
  }>(
    ownerId && !journalError ? [url, ownerId] : null,
    async ([path, subject]: [string, string]) => {
      const response = await fetch(path, {
        headers: { Accept: "application/json" },
      });
      const body = await response.json();
      if (!response.ok || body.ownerId !== subject)
        throw new Error("Exercise library unavailable");
      return body;
    },
    {
      dedupingInterval: 1000,
    },
  );

  return {
    exercises:
      journalError || sessionError
        ? []
        : (data?.exercises.filter(
            (exercise) =>
              !(
                journal?.state === "pending" &&
                journal.request.command.kind === "create" &&
                exercise.id === journal.request.operationId
              ),
          ) ?? []),
    ownerId,
    journal,
    canCreate:
      !journalError && !sessionError && data?.customExercises?.ready === true,
    error: sessionError ?? journalError ?? error,
    isLoading: ownerId === undefined || isLoading,
    mutate,
  };
}
