"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/lib/db/types";

interface UseTasksRealtimeOptions {
  projectId: string;
  /** SWR mutate function for the tasks query */
  mutate: (
    data?:
      | { tasks: Task[] }
      | Promise<{ tasks: Task[] } | undefined>
      | ((current?: { tasks: Task[] }) => { tasks: Task[] } | undefined),
    opts?: { revalidate?: boolean }
  ) => void;
}

/**
 * Subscribe to Supabase Realtime postgres_changes on the tasks table
 * for a specific project. Automatically updates the SWR cache when
 * tasks are inserted, updated, or deleted by other clients.
 */
export function useTasksRealtime({ projectId, mutate }: UseTasksRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

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
          const newTask = payload.new as Task;
          mutate(
            (current) => {
              if (!current) return { tasks: [newTask] };
              // Avoid duplicates (in case this client also triggered the insert)
              if (current.tasks.some((t) => t.id === newTask.id)) return current;
              return { tasks: [...current.tasks, newTask] };
            },
            { revalidate: false }
          );
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
          const updatedTask = payload.new as Task;
          mutate(
            (current) => {
              if (!current) return undefined;
              // If the task moved to a different project, remove it
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
          const deletedId = (payload.old as { id: string }).id;
          mutate(
            (current) => {
              if (!current) return undefined;
              return { tasks: current.tasks.filter((t) => t.id !== deletedId) };
            },
            { revalidate: false }
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, mutate]);
}
