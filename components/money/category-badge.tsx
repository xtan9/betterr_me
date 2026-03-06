"use client";

import type { MoneyCategory as Category } from "@/lib/db/types";
import { useTranslations } from "next-intl";

interface CategoryBadgeProps {
  category: Category | null;
  className?: string;
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const t = useTranslations("money");

  if (!category) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ""}`}>
        <span className="inline-block size-2 rounded-full bg-muted" />
        {t("transactions.uncategorized")}
      </span>
    );
  }

  const displayName = category.display_name || category.name;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${className ?? ""}`}>
      {category.icon && (
        <span className="shrink-0" aria-hidden="true">
          {category.icon}
        </span>
      )}
      {category.color && (
        <span
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{displayName}</span>
    </span>
  );
}
