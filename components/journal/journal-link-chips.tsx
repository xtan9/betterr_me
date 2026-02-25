"use client";

import { useTranslations } from "next-intl";
import { Repeat, ListChecks, FolderOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JournalLinkType } from "@/lib/db/types";

interface LinkItem {
  id: string;
  link_type: JournalLinkType;
  link_id: string;
  name: string;
}

interface JournalLinkChipsProps {
  links: LinkItem[];
  onRemove?: (linkId: string) => void;
}

const CHIP_STYLES: Record<JournalLinkType, string> = {
  habit: "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200",
  task: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
  project:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200",
};

const CHIP_ICONS: Record<JournalLinkType, React.ComponentType<{ className?: string }>> = {
  habit: Repeat,
  task: ListChecks,
  project: FolderOpen,
};

export function JournalLinkChips({ links, onRemove }: JournalLinkChipsProps) {
  const t = useTranslations("journal.links");

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="journal-link-chips">
      {links.map((link) => {
        const Icon = CHIP_ICONS[link.link_type];
        const style = CHIP_STYLES[link.link_type];
        const displayName = link.name || t("deleted");

        return (
          <span
            key={link.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              style,
            )}
            data-testid={`link-chip-${link.link_type}`}
          >
            <Icon className="size-3" aria-hidden="true" />
            <span>{displayName}</span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(link.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                aria-label={`Remove ${displayName}`}
                data-testid={`remove-link-${link.id}`}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
