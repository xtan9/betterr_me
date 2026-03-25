"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
import { ApiKeyRow } from "./api-key-row";
import { ApiKeyCreateDialog } from "./api-key-create-dialog";
import { ApiKeyCreatedDialog } from "./api-key-created-dialog";
import type { ApiKeyPublic } from "@/lib/db/types";

interface ApiKeysResponse {
  keys: ApiKeyPublic[];
}

export function ApiKeysSection() {
  const t = useTranslations("apiKeys");
  const { data, isLoading, mutate } = useSWR<ApiKeysResponse>(
    "/api/api-keys",
    fetcher
  );

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const handleCreated = (fullKey: string) => {
    setCreatedKey(fullKey);
    mutate();
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/api-keys/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete API key");
      }

      await mutate();
    } catch (error) {
      console.error("Failed to delete API key:", error);
      toast.error("Failed to delete API key");
    }
  };

  const keys = data?.keys ?? [];

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">{t("title")}</h3>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          size="sm"
          className="gap-2"
          disabled={keys.length >= 10}
        >
          <Plus className="h-4 w-4" />
          {t("createButton")}
        </Button>
      </div>

      {keys.length >= 10 && (
        <p className="text-sm text-muted-foreground">{t("maxKeysReached")}</p>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{t("emptyState")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {keys.map((key) => (
            <ApiKeyRow key={key.id} apiKey={key} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <ApiKeyCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleCreated}
      />

      <ApiKeyCreatedDialog
        open={createdKey !== null}
        onOpenChange={(open) => {
          if (!open) setCreatedKey(null);
        }}
        fullKey={createdKey ?? ""}
      />
    </>
  );
}
