"use client";

import { useTranslations } from "next-intl";
import { createElement } from "react";
import { Briefcase, User, ShoppingCart, MoreHorizontal, Calendar, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { Task, TaskCategory } from "@/lib/db/types";

interface TaskCardProps {
  task: Task;
  onToggle: (taskId: string) => Promise<void>;
  onClick: (taskId: string) => void;
  isToggling?: boolean;
}

const CATEGORY_ICONS: Record<TaskCategory, typeof Briefcase> = {
  work: Briefcase,
  personal: User,
  shopping: ShoppingCart,
  other: MoreHorizontal,
};

const CATEGORY_COLORS: Record<TaskCategory, string> = {
  work: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400",
  personal: "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400",
  shopping: "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const PRIORITY_COLORS: Record<number, string> = {
  0: "text-slate-400",
  1: "text-green-500",
  2: "text-yellow-500",
  3: "text-red-500",
};

function isOverdue(dueDate: string | null, isCompleted: boolean): boolean {
  if (!dueDate || isCompleted) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  return due < today;
}

export function TaskCard({ task, onToggle, onClick, isToggling }: TaskCardProps) {
  const t = useTranslations("tasks");
  const cardT = useTranslations("tasks.card");
  const categoryT = useTranslations("tasks.categories");

  const categoryColor = task.category
    ? CATEGORY_COLORS[task.category]
    : CATEGORY_COLORS.other;
  const categoryLabel = task.category
    ? categoryT(task.category)
    : categoryT("other");
  const CategoryIcon = task.category
    ? CATEGORY_ICONS[task.category]
    : MoreHorizontal;
  const priorityColor = PRIORITY_COLORS[task.priority] ?? "text-slate-400";
  const overdue = isOverdue(task.due_date, task.is_completed);

  const handleCheckedChange = () => {
    if (!isToggling) {
      onToggle(task.id);
    }
  };

  return (
    <Card
      data-testid={`task-card-${task.id}`}
      className="transition-all hover:shadow-lg hover:scale-[1.03] hover:-translate-y-0.5 duration-200 p-5"
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
                categoryColor
              )}
            >
              {createElement(CategoryIcon, {
                className: "size-4",
                "aria-hidden": "true",
              })}
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
              <p className="text-xs text-muted-foreground">{categoryLabel}</p>
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
                    ? "text-red-500 font-medium"
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
