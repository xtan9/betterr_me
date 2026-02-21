"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import useSWR from "swr";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
import { getProjectColor } from "@/lib/projects/colors";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import { KanbanCardOverlay } from "@/components/kanban/kanban-card-overlay";
import { KanbanDetailModal } from "@/components/kanban/kanban-detail-modal";
import { KanbanSkeleton } from "@/components/kanban/kanban-skeleton";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, Project } from "@/lib/db/types";

const STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "done"];

function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const grouped: Record<TaskStatus, Task[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    done: [],
  };

  for (const task of tasks) {
    if (grouped[task.status]) {
      grouped[task.status].push(task);
    } else {
      grouped.todo.push(task);
    }
  }

  // Sort each group by priority descending (high to low)
  for (const status of STATUSES) {
    grouped[status].sort((a, b) => b.priority - a.priority);
  }

  return grouped;
}

interface KanbanBoardProps {
  projectId: string;
}

export function KanbanBoard({ projectId }: KanbanBoardProps) {
  const t = useTranslations("kanban");
  const { resolvedTheme } = useTheme();

  // Fetch project
  const {
    data: projectData,
    error: projectError,
    isLoading: projectLoading,
  } = useSWR<{ project: Project }>(
    `/api/projects/${projectId}`,
    fetcher
  );

  // Fetch tasks
  const {
    data: tasksData,
    error: tasksError,
    isLoading: tasksLoading,
    mutate,
  } = useSWR<{ tasks: Task[] }>(
    `/api/tasks?project_id=${projectId}`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // DnD sensors
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);

  const project = projectData?.project;
  const tasks = useMemo(() => tasksData?.tasks ?? [], [tasksData?.tasks]);

  // Group tasks by status with priority sort
  const grouped = useMemo(() => groupByStatus(tasks), [tasks]);

  // Project color
  const color = project ? getProjectColor(project.color) : null;
  const isDark = resolvedTheme === "dark";
  const colorHsl = color ? (isDark ? color.hslDark : color.hsl) : undefined;

  // Drag handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = tasks.find((t) => t.id === event.active.id);
      setActiveTask(task ?? null);
    },
    [tasks]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTask(null);

      if (!over) return;

      const taskId = active.id as string;
      const newStatus = over.id as TaskStatus;
      const task = tasks.find((t) => t.id === taskId);

      // Guard: no-op if same column or task not found
      if (!task || task.status === newStatus) return;

      // Validate newStatus is a valid column
      if (!STATUSES.includes(newStatus)) return;

      // Optimistic SWR update
      mutate(
        async (current: { tasks: Task[] } | undefined) => {
          const res = await fetch(`/api/tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
          if (!res.ok) throw new Error("Failed to update task status");
          const { task: updatedTask } = await res.json();
          return {
            tasks: (current?.tasks ?? []).map((t) =>
              t.id === taskId ? updatedTask : t
            ),
          };
        },
        {
          optimisticData: (current: { tasks: Task[] } | undefined) => ({
            tasks: (current?.tasks ?? []).map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: newStatus,
                    is_completed: newStatus === "done",
                  }
                : t
            ),
          }),
          rollbackOnError: true,
          revalidate: false,
        }
      ).catch(() => {
        toast.error(t("dragError"));
      });
    },
    [tasks, mutate, t]
  );

  // Loading state
  if (projectLoading || tasksLoading) {
    return <KanbanSkeleton />;
  }

  // Error state
  if (projectError || tasksError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">
          {projectError?.message || tasksError?.message || "Failed to load board"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))]">
      {/* Board header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <Link
          href="/tasks"
          className={cn(
            "flex items-center gap-1 text-sm text-muted-foreground",
            "hover:text-foreground transition-colors"
          )}
        >
          <ArrowLeft className="size-4" />
          {t("backToTasks")}
        </Link>

        <div className="h-4 w-px bg-border" />

        {project && (
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="size-3 rounded-full shrink-0"
              style={{ backgroundColor: colorHsl }}
            />
            <h1 className="text-sm font-semibold truncate">{project.name}</h1>
          </div>
        )}

        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {t("taskCount", { count: tasks.length })}
        </span>
      </div>

      {/* Columns area */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto flex-1 pb-4 px-4 pt-4">
          {STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              title={t(`columns.${status}`)}
              tasks={grouped[status]}
              onCardClick={setSelectedTask}
              projectId={projectId}
              projectSection={project?.section ?? "personal"}
              onTaskCreated={() => mutate()}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? <KanbanCardOverlay task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      <KanbanDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        projectName={project?.name}
      />
    </div>
  );
}
