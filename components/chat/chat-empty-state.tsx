"use client";

import { useTranslations } from "next-intl";

export function ChatEmptyState() {
  const t = useTranslations("chat");

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-2xl font-medium text-muted-foreground">
        {t("emptyState.greeting")}
      </p>
    </div>
  );
}
