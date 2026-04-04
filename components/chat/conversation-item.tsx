"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/lib/db/types";

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: ConversationItemProps) {
  const t = useTranslations("chat");

  return (
    <button
      type="button"
      className={`group flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted"
      }`}
      onClick={() => onSelect(conversation.id)}
    >
      <span className="truncate flex-1 mr-2">
        {conversation.title ?? t("sidebar.untitled")}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conversation.id);
        }}
        aria-label={t("sidebar.deleteConfirm")}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </button>
  );
}
