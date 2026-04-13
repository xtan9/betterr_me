"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2 } from "lucide-react";
import type { ApiKeyPublic } from "@/lib/db/types";

interface ApiKeyRowProps {
  apiKey: ApiKeyPublic;
  onDelete: (id: string) => Promise<void>;
}

function formatRelativeDate(dateString: string | null, neverLabel: string): string {
  if (!dateString) return neverLabel;

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(diffDays / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}

export function ApiKeyRow({ apiKey, onDelete }: ApiKeyRowProps) {
  const t = useTranslations("apiKeys");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(apiKey.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-card-padding sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="font-medium">{apiKey.name}</span>
          <Badge
            variant={apiKey.permissions === "read_write" ? "default" : "secondary"}
            className={
              apiKey.permissions === "read_write"
                ? "bg-green-600 text-white hover:bg-green-600"
                : "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20"
            }
          >
            {apiKey.permissions === "read_write"
              ? t("permissionReadWrite")
              : t("permissionRead")}
          </Badge>
        </div>
        <code className="text-sm text-muted-foreground font-mono">
          {apiKey.key_prefix}...
        </code>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t("createdAt")}: {formatDate(apiKey.created_at)}
          </span>
          <span>
            {t("lastUsed")}:{" "}
            {formatRelativeDate(apiKey.last_used_at, t("lastUsedNever"))}
          </span>
          {apiKey.expires_at && (
            <span>
              {t("expiresAt")}: {formatDate(apiKey.expires_at)}
            </span>
          )}
        </div>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="self-end text-destructive hover:text-destructive sm:self-center"
            disabled={isDeleting}
            aria-label={t("delete")}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
