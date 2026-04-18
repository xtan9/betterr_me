"use client";

import { useTranslations } from "next-intl";
import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Task, TaskStatus, TaskUpdate } from "@/lib/db/types";

const STATUS_STYLES: Record<TaskStatus, string> = {
  backlog: "bg-muted text-muted-foreground hover:bg-muted/80",
  todo: "bg-slate-500 text-white hover:bg-slate-500/90",
  in_progress: "bg-blue-500 text-white hover:bg-blue-500/90",
  done: "bg-green-500 text-white hover:bg-green-500/90",
};

const PRIORITY_STYLES: Record<number, string> = {
  3: "bg-red-500 text-white hover:bg-red-500/90",
  2: "bg-yellow-500 text-white hover:bg-yellow-500/90",
  1: "bg-blue-500 text-white hover:bg-blue-500/90",
  0: "bg-muted text-muted-foreground hover:bg-muted/80",
};

const PRIORITY_LABELS: Record<number, string> = {
  3: "high",
  2: "medium",
  1: "low",
  0: "none",
};

const STATUS_OPTIONS: TaskStatus[] = ["backlog", "todo", "in_progress", "done"];
const PRIORITY_OPTIONS = [0, 1, 2, 3] as const;

interface KanbanInfoCardProps {
  task: Task;
  projectName?: string;
  onUpdateField: <K extends keyof TaskUpdate>(field: K, value: TaskUpdate[K]) => Promise<boolean>;
}

export function KanbanInfoCard({
  task,
  projectName,
  onUpdateField,
}: KanbanInfoCardProps) {
  const t = useTranslations("kanban");

  return (
    <div className="bg-background rounded-card border shadow-sm">
      <div className="flex items-center justify-between px-card-header-padding-x py-card-header-padding-y border-b">
        <h3 className="text-base font-semibold">
          {t("detail.infoHeading")}
        </h3>
      </div>
      <div className="p-card-padding">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-body font-medium text-muted-foreground uppercase tracking-wide">
              {t("detail.status")}
            </label>
            <Select
              value={task.status}
              onValueChange={(value) => onUpdateField("status", value as TaskStatus)}
            >
              <SelectTrigger className="w-full border-none shadow-none p-0 h-auto">
                <SelectValue>
                  <Badge className={`border-transparent ${STATUS_STYLES[task.status]}`}>
                    {t(`columns.${task.status}`)}
                  </Badge>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    <Badge className={`border-transparent ${STATUS_STYLES[status]}`}>
                      {t(`columns.${status}`)}
                    </Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-body font-medium text-muted-foreground uppercase tracking-wide">
              {t("detail.priority")}
            </label>
            <Select
              value={String(task.priority)}
              onValueChange={(value) => onUpdateField("priority", Number(value) as Task["priority"])}
            >
              <SelectTrigger className="w-full border-none shadow-none p-0 h-auto">
                <SelectValue>
                  <Badge className={`border-transparent ${PRIORITY_STYLES[task.priority]}`}>
                    {t(`priority.${PRIORITY_LABELS[task.priority]}`)}
                  </Badge>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    <Badge className={`border-transparent ${PRIORITY_STYLES[p]}`}>
                      {t(`priority.${PRIORITY_LABELS[p]}`)}
                    </Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <label className="text-body font-medium text-muted-foreground uppercase tracking-wide">
              {t("detail.dueDate")}
            </label>
            <Popover key={task.id}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 text-base hover:opacity-80 transition-opacity">
                  <Calendar className="size-4 text-muted-foreground" />
                  {task.due_date ? (
                    <span>{task.due_date}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t("detail.noDueDate")}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <input
                  type="date"
                  defaultValue={task.due_date || ""}
                  onChange={(e) => onUpdateField("due_date", e.target.value || null)}
                  className="w-full p-2 rounded-control border bg-transparent text-base focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Project (read-only) */}
          <div className="space-y-1.5">
            <label className="text-body font-medium text-muted-foreground uppercase tracking-wide">
              {t("detail.project")}
            </label>
            <p className="text-base">{projectName || "---"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
