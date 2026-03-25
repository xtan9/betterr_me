"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ApiKeyPermissions } from "@/lib/db/types";

interface ApiKeyCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (fullKey: string) => void;
}

export function ApiKeyCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: ApiKeyCreateDialogProps) {
  const t = useTranslations("apiKeys");
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<ApiKeyPermissions>("read");
  const [expiresAt, setExpiresAt] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const resetForm = () => {
    setName("");
    setPermissions("read");
    setExpiresAt("");
  };

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        permissions,
      };
      if (expiresAt) {
        body.expires_at = new Date(expiresAt).toISOString();
      }

      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to create API key");
      }

      const data = await response.json();
      resetForm();
      onOpenChange(false);
      onCreated(data.key.full_key);
    } catch (error) {
      console.error("Failed to create API key:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create API key"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createButton")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key-name">{t("name")}</Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={50}
              disabled={isCreating}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("permissions")}</Label>
            <RadioGroup
              value={permissions}
              onValueChange={(v) => setPermissions(v as ApiKeyPermissions)}
              disabled={isCreating}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="read" id="perm-read" />
                <Label htmlFor="perm-read" className="font-normal">
                  {t("permissionRead")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="read_write" id="perm-read-write" />
                <Label htmlFor="perm-read-write" className="font-normal">
                  {t("permissionReadWrite")}
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key-expires">{t("expiresAt")}</Label>
            <Input
              id="api-key-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              disabled={isCreating}
              className="w-fit"
            />
            <p className="text-xs text-muted-foreground">
              {t("expiresNever")}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isCreating}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="gap-2"
          >
            {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
