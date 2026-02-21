"use client";

import { Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/db/types";

interface KanbanCardOverlayProps {
  task: Task;
}

const PRIORITY_STYLES: Record<number, string> = {
  3: "bg-red-500 text-white hover:bg-red-500/90",
  2: "bg-yellow-500 text-white hover:bg-yellow-500/90",
  1: "bg-blue-500 text-white hover:bg-blue-500/90",
};

const PRIORITY_LABELS: Record<number, string> = {
  3: "high",
  2: "medium",
  1: "low",
};

export function KanbanCardOverlay({ task }: KanbanCardOverlayProps) {
  const t = useTranslations("kanban");

  return (
    <div
      className={cn(
        "rounded-md bg-background border p-3 shadow-lg",
        "w-64 rotate-[2deg]"
      )}
    >
      {/* Task title */}
      <p className="text-sm font-medium leading-tight">{task.title}</p>

      {/* Metadata row */}
      {(task.priority > 0 || task.due_date) && (
        <div className="flex items-center gap-2 mt-2">
          {task.priority > 0 && (
            <Badge
              className={cn(
                "text-[10px] px-1.5 py-0 border-transparent",
                PRIORITY_STYLES[task.priority]
              )}
            >
              {t(`priority.${PRIORITY_LABELS[task.priority]}`)}
            </Badge>
          )}
          {task.due_date && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              {task.due_date}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
