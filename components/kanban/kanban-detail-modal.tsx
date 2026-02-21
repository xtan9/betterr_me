"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Calendar } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import type { Task, TaskStatus } from "@/lib/db/types";

interface KanbanDetailModalProps {
  task: Task | null;
  onClose: () => void;
  projectName?: string;
  onTaskUpdated: () => void;
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

const STATUS_OPTIONS: TaskStatus[] = ["backlog", "todo", "in_progress", "done"];
const PRIORITY_OPTIONS = [0, 1, 2, 3] as const;

export function KanbanDetailModal({
  task,
  onClose,
  projectName,
  onTaskUpdated,
}: KanbanDetailModalProps) {
  const t = useTranslations("kanban");
  const [description, setDescription] = useState(task?.description || "");
  const [originalDescription, setOriginalDescription] = useState(
    task?.description || ""
  );

  // Reset description state when task changes
  const currentTaskId = task?.id;
  const [prevTaskId, setPrevTaskId] = useState(currentTaskId);
  if (currentTaskId !== prevTaskId) {
    setPrevTaskId(currentTaskId);
    setDescription(task?.description || "");
    setOriginalDescription(task?.description || "");
  }

  const updateField = useCallback(
    async (field: string, value: unknown) => {
      if (!task) return;
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) {
          toast.error(t("detail.updateError"));
          return;
        }
        onTaskUpdated();
      } catch {
        toast.error(t("detail.updateError"));
      }
    },
    [task, onTaskUpdated, t]
  );

  const handleDescriptionBlur = useCallback(() => {
    if (description !== originalDescription) {
      updateField("description", description || null);
      setOriginalDescription(description);
    }
  }, [description, originalDescription, updateField]);

  if (!task) return null;

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[85vw] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col bg-[#f5f6f8] dark:bg-[#1a1a2e]">
        <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden">
          {/* Header area — white bar */}
          <div className="bg-background border-b px-6 pt-5 pb-0 flex-shrink-0">
            <DialogTitle className="text-2xl font-semibold pr-8 mb-3">
              {task.title}
            </DialogTitle>
            <TabsList className="h-9 bg-transparent p-0 gap-0 rounded-none">
              <TabsTrigger
                value="details"
                className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2 text-base"
              >
                {t("detail.detailsTab")}
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2 text-base"
              >
                {t("detail.activityTab")}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Details tab */}
          <TabsContent value="details" className="mt-0 flex-1 overflow-hidden">
            <div className="flex h-full">
              {/* Left column (~60%) - Info + Description */}
              <div className="flex-[3] p-5 space-y-4 overflow-y-auto">
                {/* Info card */}
                <div className="bg-background rounded-lg border shadow-sm">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h3 className="text-base font-semibold">
                      {t("detail.infoHeading")}
                    </h3>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                      {/* Status */}
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          {t("detail.status")}
                        </label>
                        <Select
                          value={task.status}
                          onValueChange={(value) => updateField("status", value)}
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
                        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          {t("detail.priority")}
                        </label>
                        <Select
                          value={String(task.priority)}
                          onValueChange={(value) => updateField("priority", Number(value))}
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
                        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          {t("detail.dueDate")}
                        </label>
                        <Popover>
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
                              onChange={(e) => updateField("due_date", e.target.value || null)}
                              className="w-full p-2 rounded-md border bg-transparent text-base focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Project (read-only) */}
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          {t("detail.project")}
                        </label>
                        <p className="text-base">{projectName || "---"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description card */}
                <div className="bg-background rounded-lg border shadow-sm">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h3 className="text-base font-semibold">
                      {t("detail.descriptionHeading")}
                    </h3>
                  </div>
                  <div className="p-4">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onBlur={handleDescriptionBlur}
                      placeholder={t("detail.descriptionPlaceholder")}
                      className="w-full min-h-[150px] p-3 rounded-md border-none bg-transparent text-base resize-y focus:outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Right column (~40%) - Item updates card */}
              <div className="flex-[2] p-5 overflow-y-auto">
                <div className="bg-background rounded-lg border shadow-sm h-full flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h3 className="text-base font-semibold">
                      {t("detail.updatesHeading")}
                    </h3>
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <textarea
                      placeholder={t("detail.writeUpdate")}
                      className="w-full min-h-[80px] p-3 rounded-md border bg-transparent text-base resize-y focus:outline-none focus:ring-2 focus:ring-ring mb-4"
                      readOnly
                    />
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-base text-muted-foreground">
                        {t("detail.noUpdates")}
                      </p>
                    </div>
                  </div>
                </div>
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
