"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { log } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Task, TaskUpdate } from "@/lib/db/types";
import { KanbanInfoCard } from "./kanban-info-card";
import { KanbanFooterBar } from "./kanban-footer-bar";

interface KanbanDetailModalProps {
  task: Task | null;
  onClose: () => void;
  projectName?: string;
  onTaskUpdated: () => void;
  onTaskDeleted?: () => void;
}

export function KanbanDetailModal({
  task,
  onClose,
  projectName,
  onTaskUpdated,
  onTaskDeleted,
}: KanbanDetailModalProps) {
  const t = useTranslations("kanban");
  const [description, setDescription] = useState(task?.description || "");
  const [originalDescription, setOriginalDescription] = useState(
    task?.description || ""
  );
  const [title, setTitle] = useState(task?.title || "");
  const [originalTitle, setOriginalTitle] = useState(task?.title || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const saveCountRef = useRef(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveError, setLastSaveError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Reset state when task changes
  const currentTaskId = task?.id;
  const [prevTaskId, setPrevTaskId] = useState(currentTaskId);
  if (currentTaskId !== prevTaskId) {
    setPrevTaskId(currentTaskId);
    setDescription(task?.description || "");
    setOriginalDescription(task?.description || "");
    setTitle(task?.title || "");
    setOriginalTitle(task?.title || "");
    setIsEditingTitle(false);
    setLastSaveError(false);
    setIsSaving(false);
    saveCountRef.current = 0;
  }

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const updateField = useCallback(
    async <K extends keyof TaskUpdate>(field: K, value: TaskUpdate[K]): Promise<boolean> => {
      if (!task) return false;
      const fieldName = String(field);
      saveCountRef.current += 1;
      setIsSaving(true);
      setLastSaveError(false);
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          log.error("[kanban] Task update failed", null, { field: fieldName, status: res.status, serverError: body?.error });
          toast.error(body?.error || t("detail.updateError"));
          setLastSaveError(true);
          return false;
        }
        onTaskUpdated();
        setLastSaveError(false);
        return true;
      } catch (error) {
        log.error("[kanban] Task update network error", error, { field: fieldName });
        toast.error(t("detail.updateError"));
        setLastSaveError(true);
        return false;
      } finally {
        saveCountRef.current -= 1;
        if (saveCountRef.current === 0) setIsSaving(false);
      }
    },
    [task, onTaskUpdated, t]
  );

  const handleTitleBlur = useCallback(async () => {
    setIsEditingTitle(false);
    const trimmed = title.trim();
    if (trimmed && trimmed !== originalTitle) {
      const success = await updateField("title", trimmed);
      if (success) {
        setOriginalTitle(trimmed);
        setTitle(trimmed);
      } else {
        setTitle(originalTitle);
      }
    } else {
      setTitle(originalTitle);
    }
  }, [title, originalTitle, updateField]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      } else if (e.key === "Escape") {
        setTitle(originalTitle);
        setIsEditingTitle(false);
      }
    },
    [originalTitle]
  );

  const handleDescriptionBlur = useCallback(async () => {
    if (description !== originalDescription) {
      const success = await updateField("description", description || null);
      if (success) {
        setOriginalDescription(description);
      } else {
        setDescription(originalDescription);
      }
    }
  }, [description, originalDescription, updateField]);

  const handleDelete = useCallback(async () => {
    if (!task) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        log.error("[kanban] Task delete failed", null, { taskId: task.id, status: res.status, serverError: body?.error });
        toast.error(body?.error || t("detail.deleteError"));
        return;
      }
      onClose();
      onTaskDeleted?.();
    } catch (error) {
      log.error("[kanban] Task delete network error", error, { taskId: task.id });
      toast.error(t("detail.deleteError"));
    } finally {
      setIsDeleting(false);
    }
  }, [task, onClose, onTaskDeleted, t]);

  if (!task) return null;

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[85vw] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col bg-[#f5f6f8] dark:bg-[#1a1a2e] data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4">
        <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden">
          {/* Header area — white bar */}
          <div className="bg-background border-b px-modal-padding pt-5 pb-4 flex-shrink-0">
            <div className="flex items-start justify-between gap-2 mb-3">
              {isEditingTitle ? (
                <DialogTitle asChild>
                  <input
                    ref={titleInputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleTitleBlur}
                    onKeyDown={handleTitleKeyDown}
                    className="text-2xl font-semibold bg-transparent border-b-2 border-primary outline-none flex-1 min-w-0"
                  />
                </DialogTitle>
              ) : (
                <DialogTitle
                  className="text-2xl font-semibold pr-2 cursor-pointer hover:text-primary/80 transition-colors flex-1"
                  onClick={() => setIsEditingTitle(true)}
                  title={t("detail.clickToEdit")}
                >
                  {title}
                </DialogTitle>
              )}
            </div>
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
              <div className="flex-[3] p-modal-padding flex flex-col gap-4 overflow-y-auto">
                {/* Info card */}
                <KanbanInfoCard task={task} projectName={projectName} onUpdateField={updateField} />

                {/* Description card */}
                <div className="bg-background rounded-card border shadow-sm flex-1 flex flex-col">
                  <div className="flex items-center justify-between px-card-header-padding-x py-card-header-padding-y border-b">
                    <h3 className="text-base font-semibold">
                      {t("detail.descriptionHeading")}
                    </h3>
                  </div>
                  <div className="p-card-padding flex-1 flex flex-col">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onBlur={handleDescriptionBlur}
                      placeholder={t("detail.descriptionPlaceholder")}
                      className="w-full flex-1 min-h-[150px] p-3 rounded-control border-none bg-transparent text-base resize-y focus:outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Right column (~40%) - Item updates card */}
              <div className="flex-[2] p-modal-padding overflow-y-auto">
                <div className="bg-background rounded-card border shadow-sm h-full flex flex-col">
                  <div className="flex items-center justify-between px-card-header-padding-x py-card-header-padding-y border-b">
                    <h3 className="text-base font-semibold">
                      {t("detail.updatesHeading")}
                    </h3>
                  </div>
                  <div className="p-card-padding flex flex-col flex-1">
                    <textarea
                      placeholder={t("detail.writeUpdate")}
                      className="w-full min-h-[80px] p-3 rounded-control border bg-transparent text-base resize-none focus:outline-none mb-4 opacity-50 cursor-not-allowed"
                      disabled
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

          {/* Footer bar */}
          <KanbanFooterBar isSaving={isSaving} lastSaveError={lastSaveError} isDeleting={isDeleting} onDelete={handleDelete} onClose={onClose} />
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
