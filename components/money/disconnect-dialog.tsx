"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { KeyedMutator } from "swr";
import type { AccountsResponse } from "@/lib/hooks/use-accounts";

interface DisconnectDialogProps {
  connectionId: string;
  institutionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mutate?: KeyedMutator<AccountsResponse>;
}

export function DisconnectDialog({
  connectionId,
  institutionName,
  open,
  onOpenChange,
  mutate,
}: DisconnectDialogProps) {
  const t = useTranslations("money");
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = async (keepTransactions: boolean) => {
    setIsDisconnecting(true);
    try {
      const res = await fetch(
        `/api/money/accounts/${connectionId}/disconnect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keep_transactions: keepTransactions }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to disconnect");
      }

      toast.success(t("disconnect.success"));
      mutate?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Disconnect error:", error);
      toast.error(t("disconnect.error"));
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("disconnect.title", { name: institutionName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("disconnect.description", { name: institutionName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel disabled={isDisconnecting}>
            {t("disconnect.cancel")}
          </AlertDialogCancel>
          <Button
            variant="outline"
            onClick={() => handleDisconnect(true)}
            disabled={isDisconnecting}
          >
            {isDisconnecting && (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            )}
            {t("disconnect.keepTransactions")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleDisconnect(false)}
            disabled={isDisconnecting}
          >
            {isDisconnecting && (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            )}
            {t("disconnect.deleteTransactions")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
