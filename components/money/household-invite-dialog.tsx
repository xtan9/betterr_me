"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  inviteSchema,
  type InviteFormValues,
} from "@/lib/validations/household";

interface HouseholdInviteDialogProps {
  onSuccess: () => void;
}

export function HouseholdInviteDialog({ onSuccess }: HouseholdInviteDialogProps) {
  const t = useTranslations("money.household");
  const [open, setOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
  });

  const onSubmit = async (values: InviteFormValues) => {
    try {
      const res = await fetch("/api/money/household/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to send invitation");
      }

      const data = await res.json();
      const link = `${window.location.origin}/money/invite/accept?token=${data.invitation.token}`;
      setInviteLink(link);
      toast.success(t("inviteSuccess"));
      onSuccess();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send invitation";
      toast.error(message);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success(t("inviteCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset();
      setInviteLink(null);
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("invitePartner")}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invitePartner")}</DialogTitle>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("inviteLink")}</p>
            <div className="flex items-center gap-2">
              <Input value={inviteLink} readOnly className="text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("inviteExpires")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">{t("inviteEmail")}</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="partner@example.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {t("inviteSend")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
