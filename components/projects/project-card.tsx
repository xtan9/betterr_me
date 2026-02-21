"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { MoreVertical, Pencil, Archive, Trash2, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getProjectColor } from "@/lib/projects/colors";
import { cn } from "@/lib/utils";
import type { Project, Task, TaskStatus } from "@/lib/db/types";

interface ProjectCardProps {
  project: Project;
  tasks: Task[];
  onEdit: (project: Project) => void;
  onArchive: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

function getProjectProgress(tasks: Task[]): { done: number; total: number } {
  return {
    done: tasks.filter((t) => t.is_completed).length,
    total: tasks.length,
  };
}

function getTaskPreviews(tasks: Task[], limit: number): Task[] {
  const active = tasks.filter((t) => !t.is_completed);
  const statusOrder: Record<TaskStatus, number> = {
    in_progress: 0,
    todo: 1,
    backlog: 2,
    done: 3,
  };
  const sorted = active.sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );
  return sorted.slice(0, limit);
}

const STATUS_DOT_COLORS: Record<TaskStatus, string> = {
  in_progress: "bg-blue-500",
  todo: "bg-muted-foreground/50",
  backlog: "bg-muted-foreground/30",
  done: "bg-green-500",
};

export function ProjectCard({
  project,
  tasks,
  onEdit,
  onArchive,
  onDelete,
}: ProjectCardProps) {
  const t = useTranslations("projects");
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const color = getProjectColor(project.color);
  const isDark = resolvedTheme === "dark";
  const colorHsl = isDark ? color.hslDark : color.hsl;

  const { done, total } = getProjectProgress(tasks);
  const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;

  const previews = getTaskPreviews(tasks, 5);
  const activeCount = tasks.filter((t) => !t.is_completed).length;
  const remainingCount = activeCount - previews.length;

  const handleCardClick = () => {
    router.push(`/projects/${project.id}/kanban`);
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5",
        "motion-reduce:transition-none motion-reduce:hover:transform-none",
        "border-l-4 p-0"
      )}
      style={{
        borderLeftColor: colorHsl,
        backgroundColor: isDark
          ? `${colorHsl.replace(")", " / 0.06)")}`
          : `${colorHsl.replace(")", " / 0.04)")}`,
      }}
      onClick={handleCardClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: name + three-dot menu */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium truncate min-w-0 flex-1">
            {project.name}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(project);
                }}
              >
                <Pencil className="size-4 mr-2" />
                {t("menuEdit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(project.id);
                }}
              >
                <Archive className="size-4 mr-2" />
                {t("menuArchive")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(project.id);
                }}
              >
                <Trash2 className="size-4 mr-2" />
                {t("menuDelete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Progress section */}
        <div className="space-y-1.5">
          <Progress value={progressPercent} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            {done}/{total} {t("done")}
          </p>
        </div>

        {/* Task previews */}
        {total === 0 ? (
          <p className="text-xs text-muted-foreground italic">{t("noTasks")}</p>
        ) : (
          <div className="space-y-1">
            {previews.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 min-w-0"
              >
                <span
                  className={cn(
                    "size-2 rounded-full shrink-0",
                    STATUS_DOT_COLORS[task.status]
                  )}
                />
                <span className="text-xs truncate text-muted-foreground">
                  {task.title}
                </span>
              </div>
            ))}
            {remainingCount > 0 && (
              <p className="text-xs text-muted-foreground/70 pl-4">
                +{remainingCount} {t("more")}
              </p>
            )}
          </div>
        )}

        {/* Open Board button */}
        <Button
          variant="secondary"
          size="sm"
          className="w-full text-xs"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/projects/${project.id}/kanban`);
          }}
        >
          {t("openBoard")}
          <ArrowRight className="size-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
