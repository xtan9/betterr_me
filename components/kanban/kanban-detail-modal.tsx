"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Calendar, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Task, TaskStatus } from "@/lib/db/types";

interface KanbanDetailModalProps {
  task: Task | null;
  onClose: () => void;
  projectName?: string;
}

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

export function KanbanDetailModal({
  task,
  onClose,
  projectName,
}: KanbanDetailModalProps) {
  const t = useTranslations("kanban");
  const router = useRouter();

  if (!task) return null;

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        {/* Header area */}
        <div className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-semibold">
            {task.title}
          </DialogTitle>
        </div>

        <Tabs defaultValue="details" className="flex-1 overflow-hidden">
          <div className="px-6 pt-2">
            <TabsList>
              <TabsTrigger value="details">
                {t("detail.detailsTab")}
              </TabsTrigger>
              <TabsTrigger value="activity">
                {t("detail.activityTab")}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Details tab */}
          <TabsContent value="details" className="mt-0 overflow-hidden">
            <div className="flex max-h-[calc(90vh-140px)]">
              {/* Left panel - task fields */}
              <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                {/* Status */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("detail.status")}
                  </label>
                  <div>
                    <Badge
                      className={`border-transparent ${STATUS_STYLES[task.status]}`}
                    >
                      {t(`columns.${task.status}`)}
                    </Badge>
                  </div>
                </div>

                {/* Priority */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("detail.priority")}
                  </label>
                  <div>
                    <Badge
                      className={`border-transparent ${PRIORITY_STYLES[task.priority]}`}
                    >
                      {t(`priority.${PRIORITY_LABELS[task.priority]}`)}
                    </Badge>
                  </div>
                </div>

                {/* Section */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("detail.section")}
                  </label>
                  <p className="text-sm capitalize">{task.section}</p>
                </div>

                {/* Project */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("detail.project")}
                  </label>
                  <p className="text-sm">{projectName || "—"}</p>
                </div>

                {/* Due date */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("detail.dueDate")}
                  </label>
                  <div className="flex items-center gap-1.5 text-sm">
                    {task.due_date ? (
                      <>
                        <Calendar className="size-3.5 text-muted-foreground" />
                        {task.due_date}
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("detail.noDueDate")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("detail.description")}
                  </label>
                  <p className="text-sm whitespace-pre-wrap">
                    {task.description || (
                      <span className="text-muted-foreground">
                        {t("detail.noDescription")}
                      </span>
                    )}
                  </p>
                </div>

                {/* Edit button */}
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/tasks/${task.id}/edit`)}
                  >
                    <Pencil className="size-3.5 mr-1.5" />
                    {t("detail.editTask")}
                  </Button>
                </div>
              </div>

              {/* Right panel - comments placeholder */}
              <div className="w-80 border-l p-6 bg-muted/30 flex items-center justify-center">
                <p className="text-sm text-muted-foreground text-center">
                  {t("detail.commentsPlaceholder")}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Activity tab */}
          <TabsContent value="activity" className="mt-0">
            <div className="flex items-center justify-center h-64">
              <p className="text-sm text-muted-foreground">
                {t("detail.activityPlaceholder")}
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
