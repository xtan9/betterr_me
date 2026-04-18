"use client";

import { useTranslations } from "next-intl";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface KanbanFooterBarProps {
  isSaving: boolean;
  lastSaveError: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}

export function KanbanFooterBar({
  isSaving,
  lastSaveError,
  isDeleting,
  onDelete,
  onClose,
}: KanbanFooterBarProps) {
  const t = useTranslations("kanban");

  return (
    <div className="flex items-center justify-between border-t bg-muted/30 px-modal-padding py-3 flex-shrink-0">
      <div className="flex items-center gap-2 text-caption text-muted-foreground">
        {isSaving ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            {t("detail.footer.saving")}
          </>
        ) : lastSaveError ? (
          <>
            <span className="size-2 rounded-pill bg-destructive inline-block" />
            {t("detail.footer.saveFailed")}
          </>
        ) : (
          <>
            <span className="size-2 rounded-pill bg-green-500 inline-block" />
            {t("detail.footer.allSaved")}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/50 hover:bg-destructive/10"
              aria-label={t("detail.delete")}
            >
              <Trash2 className="size-3.5 mr-1.5" />
              {t("detail.delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertTitle>{t("detail.deleteConfirmTitle")}</AlertTitle>
              <AlertDialogDescription>
                {t("detail.deleteConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("detail.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? t("detail.deleting") : t("detail.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button variant="outline" size="sm" onClick={onClose}>
          {t("detail.footer.close")}
        </Button>
      </div>
    </div>
  );
}
