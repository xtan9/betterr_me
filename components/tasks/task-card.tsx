"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Tag, Calendar, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getProjectColor } from "@/lib/projects/colors";
import type { Task, Category } from "@/lib/db/types";
import { getPriorityColor } from "@/lib/tasks/format";

interface TaskCardProps {
  task: Task;
  categories?: Category[];
  onToggle: (taskId: string) => Promise<void>;
  onClick: (taskId: string) => void;
  isToggling?: boolean;
}

function isOverdue(dueDate: string | null, isCompleted: boolean): boolean {
  if (!dueDate || isCompleted) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  return due < today;
}

export function TaskCard({ task, categories, onToggle, onClick, isToggling }: TaskCardProps) {
  const t = useTranslations("tasks");
  const cardT = useTranslations("tasks.card");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const category = task.category_id && categories
    ? categories.find((c) => c.id === task.category_id) ?? null
    : null;
  const categoryColor = category
    ? getProjectColor(category.color)
    : null;
  const bgColor = categoryColor
    ? (isDark ? categoryColor.hslDark : categoryColor.hsl)
    : undefined;

  const priorityColor = getPriorityColor(task.priority);
  const overdue = isOverdue(task.due_date, task.is_completed);

  const handleCheckedChange = () => {
    if (!isToggling) {
      onToggle(task.id);
    }
  };

  return (
    <Card
      data-testid={`task-card-${task.id}`}
      className="transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 motion-reduce:transition-none motion-reduce:hover:transform-none p-5"
    >
      <CardContent className="p-0 space-y-3">
        <div className="flex items-start justify-between">
          <button
            type="button"
            className="flex items-center gap-2 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            onClick={() => onClick(task.id)}
          >
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-md p-1.5",
                !bgColor && "bg-muted"
              )}
              style={bgColor ? { backgroundColor: bgColor } : undefined}
            >
              <Tag className="size-4 text-white" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3
                className={cn(
                  "font-display font-medium truncate",
                  task.is_completed && "line-through text-muted-foreground"
                )}
              >
                {task.title}
              </h3>
              <p className="text-xs text-muted-foreground">{category?.name ?? ""}</p>
            </div>
          </button>
          <Checkbox
            checked={task.is_completed}
            onCheckedChange={handleCheckedChange}
            disabled={isToggling}
            aria-label={`${cardT("markComplete")} ${task.title}`}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
        </div>

        {/* Priority and due date */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <Circle className={cn("size-2.5 fill-current", priorityColor)} />
            <span className={cn("text-xs font-medium", priorityColor)}>
              {t(`priorities.${task.priority}`)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {task.due_date ? (
              <span
                className={cn(
                  "text-xs",
                  overdue
                    ? "text-status-error font-medium"
                    : "text-muted-foreground"
                )}
              >
                {task.due_date}
                {overdue && ` · ${cardT("overdue")}`}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {cardT("noDueDate")}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
