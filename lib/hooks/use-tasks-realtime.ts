"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/lib/db/types";

type TasksMutate = (
  data?:
    | { tasks: Task[] }
    | Promise<{ tasks: Task[] } | undefined>
    | ((current?: { tasks: Task[] }) => { tasks: Task[] } | undefined),
  opts?: { revalidate?: boolean }
) => void;

export type RealtimeStatus = "connecting" | "connected" | "error";

interface UseTasksRealtimeOptions {
  projectId: string;
  /** SWR mutate function for the tasks query */
  mutate: TasksMutate;
}

function isValidTaskPayload(obj: unknown): obj is Task {
  return typeof obj === "object" && obj !== null && typeof (obj as Task).id === "string";
}

/**
 * Subscribe to Supabase Realtime postgres_changes on the tasks table
 * for a specific project. Automatically updates the SWR cache when
 * tasks are inserted, updated, or deleted by other clients.
 *
 * Returns the connection status so the board can show a live indicator
 * or fall back to polling when disconnected.
 */
export function useTasksRealtime({ projectId, mutate }: UseTasksRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;

  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  // Full revalidation from the server (used on reconnect)
  const revalidate = useCallback(() => {
    mutateRef.current(undefined, { revalidate: true });
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`tasks:project:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (!isValidTaskPayload(payload.new)) {
            console.error("Realtime INSERT: invalid payload", { projectId, payload: payload.new });
            return;
          }
          const newTask = payload.new;
          try {
            mutateRef.current(
              (current) => {
                if (!current) return { tasks: [newTask] };
                if (current.tasks.some((t) => t.id === newTask.id)) return current;
                return { tasks: [...current.tasks, newTask] };
              },
              { revalidate: false }
            );
          } catch (err) {
            console.error("Realtime INSERT: mutate failed", { projectId, taskId: newTask.id, error: err });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (!isValidTaskPayload(payload.new)) {
            console.error("Realtime UPDATE: invalid payload", { projectId, payload: payload.new });
            return;
          }
          const updatedTask = payload.new;
          try {
            mutateRef.current(
              (current) => {
                if (!current) return undefined;
                if (updatedTask.project_id !== projectId) {
                  return { tasks: current.tasks.filter((t) => t.id !== updatedTask.id) };
                }
                return {
                  tasks: current.tasks.map((t) =>
                    t.id === updatedTask.id ? updatedTask : t
                  ),
                };
              },
              { revalidate: false }
            );
          } catch (err) {
            console.error("Realtime UPDATE: mutate failed", { projectId, taskId: updatedTask.id, error: err });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const old = payload.old as Record<string, unknown> | null;
          const deletedId = old?.id;
          if (typeof deletedId !== "string") {
            console.error("Realtime DELETE: missing task id", { projectId, payload: payload.old });
            return;
          }
          try {
            mutateRef.current(
              (current) => {
                if (!current) return undefined;
                return { tasks: current.tasks.filter((t) => t.id !== deletedId) };
              },
              { revalidate: false }
            );
          } catch (err) {
            console.error("Realtime DELETE: mutate failed", { projectId, deletedId, error: err });
          }
        }
      )
      .subscribe((subscriptionStatus, err) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("connected");
        } else if (subscriptionStatus === "CHANNEL_ERROR") {
          console.error("Realtime subscription error", { projectId, error: err });
          setStatus("error");
          // Revalidate from server since we may have missed events
          revalidate();
        } else if (subscriptionStatus === "TIMED_OUT") {
          console.error("Realtime subscription timed out", { projectId });
          setStatus("error");
          revalidate();
        } else if (subscriptionStatus === "CLOSED") {
          setStatus("connecting");
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, revalidate]);

  return { status };
}
