"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KanbanCard } from "@/components/kanban/kanban-card";
import { KanbanQuickAdd } from "@/components/kanban/kanban-quick-add";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/lib/db/types";

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  onCardClick: (task: Task) => void;
  projectId: string;
  projectSection: string;
  onTaskCreated: () => void;
}

export function KanbanColumn({
  status,
  title,
  tasks,
  onCardClick,
  projectId,
  projectSection,
  onTaskCreated,
}: KanbanColumnProps) {
  const t = useTranslations("kanban");
  const { isOver, setNodeRef } = useDroppable({ id: status });
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-72 min-w-72 shrink-0 rounded-lg bg-muted/30",
        "transition-colors duration-200",
        isOver && "ring-2 ring-primary/50 bg-primary/5"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <Badge variant="secondary" className="text-xs tabular-nums">
          {tasks.length}
        </Badge>
      </div>

      {/* Card list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2 px-2 pb-2">
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 text-center py-8">
              {t("emptyColumn")}
            </p>
          ) : (
            tasks.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                onClick={() => onCardClick(task)}
              />
            ))
          )}
          {isHovered && (
            <KanbanQuickAdd
              status={status}
              projectId={projectId}
              projectSection={projectSection}
              onTaskCreated={onTaskCreated}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
