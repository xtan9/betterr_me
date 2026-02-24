"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountVisibility } from "@/lib/db/types";

interface AccountVisibilitySelectorProps {
  accountId: string;
  currentVisibility: AccountVisibility;
  onVisibilityChange: (accountId: string, visibility: AccountVisibility) => void;
}

/**
 * Small dropdown to change account visibility (mine/ours/hidden).
 * Only shown when the household has more than one member.
 */
export function AccountVisibilitySelector({
  accountId,
  currentVisibility,
  onVisibilityChange,
}: AccountVisibilitySelectorProps) {
  const t = useTranslations("money.household");

  const handleChange = async (value: string) => {
    const visibility = value as AccountVisibility;
    try {
      const res = await fetch(`/api/money/accounts/${accountId}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to update visibility");
      }

      toast.success(t("visibilityChanged"));
      onVisibilityChange(accountId, visibility);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update visibility";
      toast.error(message);
    }
  };

  return (
    <Select value={currentVisibility} onValueChange={handleChange}>
      <SelectTrigger size="sm" className="h-7 w-auto gap-1 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="mine">{t("visibilityMine")}</SelectItem>
        <SelectItem value="ours">{t("visibilityOurs")}</SelectItem>
        <SelectItem value="hidden">{t("visibilityHidden")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
