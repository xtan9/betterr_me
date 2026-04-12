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
  bestStreak: number;
  onConfirm: () => void | Promise<void>;
}

export function ReactivateDialog({
  open,
  onOpenChange,
  habitName,
  bestStreak,
  onConfirm,
}: Props) {
  const t = useTranslations("habits");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("reactivate.confirm_title", { name: habitName })}
          </DialogTitle>
          <DialogDescription>
            {t("reactivate.confirm_body", { n: bestStreak })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("reactivate.confirm_cancel")}
          </Button>
          <Button
            onClick={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {t("reactivate.confirm_cta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
