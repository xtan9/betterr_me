"use client";

import { useTranslations } from "next-intl";
import { Calendar, Clock, Flag, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryDisplayName } from "@/lib/categories/get-category-display-name";
import { getPriorityColor } from "@/lib/tasks/format";
import type { Task, Category } from "@/lib/db/types";

interface TaskDetailsGridProps {
  task: Task;
  category: Category | null;
  catBgColor: string | undefined;
  isDark: boolean;
}

export function TaskDetailsGrid({
  task,
  category,
  catBgColor,
  isDark: _isDark,
}: TaskDetailsGridProps) {
  const t = useTranslations("tasks");
  const priorityT = useTranslations("tasks.priorities");
  const tCat = useTranslations("categories");
  const priorityColor = getPriorityColor(task.priority);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Category */}
      <div className="flex items-center gap-3 p-4 rounded-lg border">
        <Tag className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">
            {t("detail.category")}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={cn(
                "inline-flex items-center justify-center rounded p-0.5",
                !catBgColor && "bg-muted"
              )}
              style={catBgColor ? { backgroundColor: catBgColor } : undefined}
            >
              <Tag className="size-4 text-white" aria-hidden="true" />
            </span>
            <span className="font-medium">
              {category ? getCategoryDisplayName(category.name, tCat) : "---"}
            </span>
          </div>
        </div>
      </div>

      {/* Priority */}
      <div className="flex items-center gap-3 p-4 rounded-lg border">
        <Flag className={cn("size-5", priorityColor)} />
        <div>
          <p className="text-sm text-muted-foreground">
            {t("detail.priority")}
          </p>
          <span className={cn("font-medium", priorityColor)}>
            {priorityT(String(task.priority))}
          </span>
        </div>
      </div>

      {/* Due date */}
      <div className="flex items-center gap-3 p-4 rounded-lg border">
        <Calendar className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">
            {t("detail.dueDate")}
          </p>
          <span className="font-medium">
            {task.due_date || t("detail.noDueDate")}
          </span>
        </div>
      </div>

      {/* Due time */}
      <div className="flex items-center gap-3 p-4 rounded-lg border">
        <Clock className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">
            {t("detail.dueTime")}
          </p>
          <span className="font-medium">
            {task.due_time ? task.due_time.slice(0, 5) : "---"}
          </span>
        </div>
      </div>
    </div>
  );
}
