"use client";

import { useTranslations } from "next-intl";
import { Plus, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/db/types";

interface TaskRowProps {
  task: Task;
  onToggle: (taskId: string) => Promise<void>;
  onClick?: (taskId: string) => void;
  isToggling?: boolean;
}

function TaskRow({ task, onToggle, onClick, isToggling }: TaskRowProps) {
  const t = useTranslations("dashboard.tasks");

  const priorityColors = {
    0: "text-slate-400", // none
    1: "text-green-500", // low
    2: "text-yellow-500", // medium
    3: "text-red-500", // high/urgent
  };

  const priorityColor = priorityColors[task.priority];

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
      onToggle(task.id);
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
              task.is_completed && "line-through text-muted-foreground"
            )}
            onClick={() => onClick?.(task.id)}
          >
            {task.title}
          </button>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {task.due_time
            ? t("dueAt", { time: formatTime(task.due_time) })
            : t("allDay")}
        </div>
      </div>
    </div>
  );
}

interface TasksTodayProps {
  tasks: Task[];
  onToggle: (taskId: string) => Promise<void>;
  onTaskClick?: (taskId: string) => void;
  onCreateTask: () => void;
  isLoading?: boolean;
}

export function TasksToday({
  tasks,
  onToggle,
  onTaskClick,
  onCreateTask,
  isLoading,
}: TasksTodayProps) {
  const t = useTranslations("dashboard.tasks");

  // Sort tasks: due time first, then priority, completed last
  const sortedTasks = [...tasks].sort((a, b) => {
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

  const completedCount = tasks.filter((t) => t.is_completed).length;
  const totalCount = tasks.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;

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
                  onToggle={onToggle}
                  onClick={onTaskClick}
                  isToggling={isLoading}
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
      </CardContent>
    </Card>
  );
}
