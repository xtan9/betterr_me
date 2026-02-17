"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Circle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/db/types";

function qualifiesForReflection(task: Task): boolean {
  return task.priority === 3 || !!task.intention;
}

interface ReflectionStripProps {
  onReflect: (difficulty: 1 | 2 | 3) => void;
}

function ReflectionStrip({ onReflect }: ReflectionStripProps) {
  const t = useTranslations("dashboard.tasks.reflection");

  return (
    <div className="flex items-center gap-2 mt-1 animate-in fade-in slide-in-from-left-2 duration-300">
      <span className="text-xs text-muted-foreground">{t("howWasIt")}</span>
      <div className="flex gap-1">
        {(
          [
            { difficulty: 1, emoji: "⚡", label: "easy" },
            { difficulty: 2, emoji: "👌", label: "good" },
            { difficulty: 3, emoji: "💪", label: "hard" },
          ] as const
        ).map(({ difficulty, emoji, label }) => (
          <button
            key={difficulty}
            type="button"
            onClick={() => onReflect(difficulty)}
            className="text-sm px-2 py-0.5 rounded-md hover:bg-muted transition-colors"
            title={t(label)}
            aria-label={t(label)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  onToggle: (taskId: string) => Promise<void>;
  onClick?: (taskId: string) => void;
  isToggling?: boolean;
  isReflecting?: boolean;
  onReflect?: (difficulty: 1 | 2 | 3) => void;
}

function TaskRow({
  task,
  onToggle,
  onClick,
  isToggling,
  isReflecting,
  onReflect,
}: TaskRowProps) {
  const t = useTranslations("dashboard.tasks");

  const priorityColors = {
    0: "text-slate-400", // none
    1: "text-green-500", // low
    2: "text-yellow-500", // medium
    3: "text-red-500", // high/urgent
  };

  const priorityColor = priorityColors[task.priority] ?? "text-slate-400";

  // Format due time to 12-hour format
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleCheckboxChange = () => {
    if (!isToggling) {
      onToggle(task.id).catch((err) => {
        console.error("Failed to toggle task:", err);
      });
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
      <Checkbox
        checked={task.is_completed}
        onCheckedChange={handleCheckboxChange}
        disabled={isToggling}
        className="mt-0.5 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Circle className={cn("size-2 fill-current", priorityColor)} />
          <button
            type="button"
            className={cn(
              "font-medium text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md",
              task.is_completed && "line-through text-muted-foreground",
            )}
            onClick={() => onClick?.(task.id)}
          >
            {task.title}
          </button>
        </div>
        {isReflecting && onReflect ? (
          <ReflectionStrip onReflect={onReflect} />
        ) : (
          <>
            {task.priority === 3 && task.intention && (
              <p className="text-xs text-muted-foreground italic mt-0.5">
                {task.intention}
              </p>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">
              {task.due_time
                ? t("dueAt", { time: formatTime(task.due_time) })
                : t("allDay")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface TasksTodayProps {
  tasks: Task[];
  tasksTomorrow?: Task[];
  onToggle: (taskId: string) => Promise<void>;
  onTaskClick?: (taskId: string) => void;
  onCreateTask: () => void;
  isLoading?: boolean;
  togglingTaskIds?: Set<string>;
}

export function TasksToday({
  tasks,
  tasksTomorrow = [],
  onToggle,
  onTaskClick,
  onCreateTask,
  isLoading,
  togglingTaskIds,
}: TasksTodayProps) {
  const t = useTranslations("dashboard.tasks");
  const [reflectingTaskId, setReflectingTaskId] = useState<string | null>(null);
  const [reflectingTask, setReflectingTask] = useState<Task | null>(null);
  const reflectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (reflectionTimerRef.current) clearTimeout(reflectionTimerRef.current);
    };
  }, []);

  const handleToggleWithReflection = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      const isCompleting = task && !task.is_completed;
      const qualifies = task && qualifiesForReflection(task);

      if (isCompleting && qualifies) {
        setReflectingTask({ ...task, is_completed: true });
        setReflectingTaskId(taskId);
      }

      await onToggle(taskId);

      if (isCompleting && qualifies) {
        reflectionTimerRef.current = setTimeout(() => {
          setReflectingTaskId(null);
          setReflectingTask(null);
        }, 3000);
      }
    },
    [tasks, onToggle],
  );

  const handleReflection = useCallback(
    async (difficulty: 1 | 2 | 3) => {
      if (!reflectingTaskId) return;
      if (reflectionTimerRef.current) {
        clearTimeout(reflectionTimerRef.current);
      }
      try {
        const res = await fetch(`/api/tasks/${reflectingTaskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completion_difficulty: difficulty }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setReflectingTaskId(null);
        setReflectingTask(null);
      } catch (err) {
        console.error("Failed to save reflection:", err);
        toast.error(t("reflection.saveError"));
      }
    },
    [reflectingTaskId, t],
  );

  // Re-inject the reflecting task if SWR revalidation removed it
  const visibleTasks = useMemo(() => {
    if (!reflectingTask || !reflectingTaskId) return tasks;
    const hasTask = tasks.some((t) => t.id === reflectingTaskId);
    if (hasTask) return tasks;
    return [reflectingTask, ...tasks];
  }, [tasks, reflectingTask, reflectingTaskId]);

  // Sort tasks: completed last, then by due time, then by priority
  const sortedTasks = [...visibleTasks].sort((a, b) => {
    // Completed tasks go last
    if (a.is_completed !== b.is_completed) {
      return a.is_completed ? 1 : -1;
    }

    // Tasks with due_time before tasks without
    if ((a.due_time !== null) !== (b.due_time !== null)) {
      return a.due_time !== null ? -1 : 1;
    }

    // If both have due_time, sort by time
    if (a.due_time && b.due_time) {
      return a.due_time.localeCompare(b.due_time);
    }

    // Otherwise sort by priority (higher first)
    return b.priority - a.priority;
  });

  const completedCount = visibleTasks.filter((t) => t.is_completed).length;
  const totalCount = visibleTasks.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;
  // For Coming Up section: treat "no today tasks" the same as "all complete"
  const todayClear = totalCount === 0 || allComplete;

  // Show up to 3 tomorrow tasks; auto-expand to full opacity when all today tasks complete
  const maxTomorrowPreview = 3;
  const visibleTomorrow = tasksTomorrow.slice(0, maxTomorrowPreview);
  const extraTomorrow = tasksTomorrow.length - maxTomorrowPreview;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateTask}
          className="gap-1"
        >
          <Plus className="size-4" />
          {t("addTask")}
        </Button>
      </CardHeader>
      <CardContent>
        {totalCount === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="font-medium mb-1">{t("noTasks")}</p>
            <p className="text-sm">{t("createFirst")}</p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {sortedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggleWithReflection}
                  onClick={onTaskClick}
                  isToggling={isLoading || togglingTaskIds?.has(task.id)}
                  isReflecting={reflectingTaskId === task.id}
                  onReflect={
                    reflectingTaskId === task.id ? handleReflection : undefined
                  }
                />
              ))}
            </div>
            <div className="mt-4 pt-4 border-t text-sm text-center text-muted-foreground">
              {allComplete ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {t("allComplete")} 🎉
                </span>
              ) : (
                t("completed", { completed: completedCount, total: totalCount })
              )}
            </div>
          </>
        )}

        {/* Coming Up — tomorrow tasks */}
        {visibleTomorrow.length > 0 && (
          <div
            className={cn("mt-4 pt-4 border-t", !todayClear && "opacity-50")}
          >
            <p className="text-sm font-medium text-muted-foreground mb-2">
              {todayClear ? t("headStart") : t("comingUp")}
            </p>
            <div className="space-y-1">
              {visibleTomorrow.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground"
                >
                  <Circle
                    className={cn(
                      "size-2 fill-current",
                      ({
                        0: "text-slate-400",
                        1: "text-green-500",
                        2: "text-yellow-500",
                        3: "text-red-500",
                      } as Record<number, string>)[task.priority] ?? "text-slate-400",
                    )}
                  />
                  <span>{task.title}</span>
                </div>
              ))}
            </div>
            {extraTomorrow > 0 && (
              <Link
                href="/tasks"
                className="flex items-center justify-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("moreTomorrow", { count: extraTomorrow })}
                <ChevronRight className="size-3" />
              </Link>
            )}
            <Link
              href="/tasks"
              className="flex items-center justify-center gap-1 mt-2 text-xs text-primary hover:underline"
            >
              {t("viewAll")}
              <ChevronRight className="size-3" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
