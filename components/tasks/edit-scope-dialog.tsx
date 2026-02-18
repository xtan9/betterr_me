"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { EditScope } from "@/lib/validations/recurring-task";

interface EditScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: EditScope) => void;
  action: "edit" | "delete";
}

export function EditScopeDialog({
  open,
  onOpenChange,
  onConfirm,
  action,
}: EditScopeDialogProps) {
  const t = useTranslations("tasks.scope");
  const [scope, setScope] = useState<EditScope>("this");

  const handleConfirm = () => {
    onConfirm(scope);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action === "edit" ? t("editTitle") : t("deleteTitle")}
          </DialogTitle>
          <DialogDescription>
            {action === "edit" ? t("editDescription") : t("deleteDescription")}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={scope}
          onValueChange={(v) => setScope(v as EditScope)}
          className="space-y-3"
        >
          <div className="flex items-center gap-3">
            <RadioGroupItem value="this" id="scope-this" />
            <Label htmlFor="scope-this" className="font-normal">
              {t("thisOnly")}
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem value="following" id="scope-following" />
            <Label htmlFor="scope-following" className="font-normal">
              {t("thisAndFollowing")}
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem value="all" id="scope-all" />
            <Label htmlFor="scope-all" className="font-normal">
              {t("allInstances")}
            </Label>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            variant={action === "delete" ? "destructive" : "default"}
          >
            {action === "edit" ? t("confirmEdit") : t("confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
