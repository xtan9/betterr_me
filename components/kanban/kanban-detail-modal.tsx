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
import type { Task, TaskStatus, TaskSection } from "@/lib/db/types";

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
const SECTION_OPTIONS: TaskSection[] = ["personal", "work"];

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
      <DialogContent className="sm:max-w-[90vw] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Header area */}
        <div className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-semibold pr-8">
            {task.title}
          </DialogTitle>
        </div>

        <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
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
          <TabsContent value="details" className="mt-0 flex-1 overflow-hidden">
            <div className="flex h-full">
              {/* Left column (~60%) - Info + Description */}
              <div className="flex-[3] p-6 space-y-6 overflow-y-auto border-r">
                {/* Info section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">
                    {t("detail.infoHeading")}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Status field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("detail.status")}
                      </label>
                      <Select
                        value={task.status}
                        onValueChange={(value) =>
                          updateField("status", value)
                        }
                      >
                        <SelectTrigger className="w-full border-none shadow-none p-0 h-auto">
                          <SelectValue>
                            <Badge
                              className={`border-transparent ${STATUS_STYLES[task.status]}`}
                            >
                              {t(`columns.${task.status}`)}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              <Badge
                                className={`border-transparent ${STATUS_STYLES[status]}`}
                              >
                                {t(`columns.${status}`)}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Priority field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("detail.priority")}
                      </label>
                      <Select
                        value={String(task.priority)}
                        onValueChange={(value) =>
                          updateField("priority", Number(value))
                        }
                      >
                        <SelectTrigger className="w-full border-none shadow-none p-0 h-auto">
                          <SelectValue>
                            <Badge
                              className={`border-transparent ${PRIORITY_STYLES[task.priority]}`}
                            >
                              {t(
                                `priority.${PRIORITY_LABELS[task.priority]}`
                              )}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((p) => (
                            <SelectItem key={p} value={String(p)}>
                              <Badge
                                className={`border-transparent ${PRIORITY_STYLES[p]}`}
                              >
                                {t(`priority.${PRIORITY_LABELS[p]}`)}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Section field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("detail.section")}
                      </label>
                      <Select
                        value={task.section}
                        onValueChange={(value) =>
                          updateField("section", value)
                        }
                      >
                        <SelectTrigger className="w-full border-none shadow-none p-0 h-auto">
                          <SelectValue>
                            <span className="text-sm capitalize">
                              {task.section}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {SECTION_OPTIONS.map((section) => (
                            <SelectItem key={section} value={section}>
                              <span className="capitalize">{section}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Due Date field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("detail.dueDate")}
                      </label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity">
                            <Calendar className="size-3.5 text-muted-foreground" />
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
                            onChange={(e) => {
                              const value = e.target.value || null;
                              updateField("due_date", value);
                            }}
                            className="w-full p-2 rounded-md border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Project field (read-only) */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t("detail.project")}
                      </label>
                      <p className="text-sm">{projectName || "---"}</p>
                    </div>
                  </div>
                </div>

                {/* Description section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">
                    {t("detail.descriptionHeading")}
                  </h3>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleDescriptionBlur}
                    placeholder={t("detail.descriptionPlaceholder")}
                    className="w-full min-h-[120px] p-3 rounded-md border bg-transparent text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Right column (~40%) - Item updates */}
              <div className="flex-[2] p-6 bg-muted/30 flex flex-col">
                <h3 className="text-sm font-semibold mb-3">
                  {t("detail.updatesHeading")}
                </h3>
                <textarea
                  placeholder={t("detail.writeUpdate")}
                  className="w-full min-h-[80px] p-3 rounded-md border bg-transparent text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring mb-4"
                  readOnly
                />
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    {t("detail.noUpdates")}
                  </p>
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
