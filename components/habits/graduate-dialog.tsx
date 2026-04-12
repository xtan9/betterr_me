"use client";

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habitName: string;
  onConfirm: () => void | Promise<void>;
}

export function GraduateDialog({
  open,
  onOpenChange,
  habitName,
  onConfirm,
}: Props) {
  const t = useTranslations("habits");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("graduate.confirm_title", { name: habitName })}
          </DialogTitle>
          <DialogDescription>{t("graduate.confirm_body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("graduate.confirm_cancel")}
          </Button>
          <Button
            onClick={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {t("graduate.confirm_cta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
