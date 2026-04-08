"use client";

import { useTranslations } from "next-intl";

export function ThinkingIndicator() {
  const t = useTranslations("chat");
  return (
    <div className="flex justify-start">
      <div
        role="status"
        aria-label={t("thinking")}
        className="inline-flex items-center gap-1.5 rounded-2xl bg-muted px-4 py-3"
      >
        <span
          data-testid="thinking-dot"
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "0s" }}
        />
        <span
          data-testid="thinking-dot"
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "0.2s" }}
        />
        <span
          data-testid="thinking-dot"
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: "0.4s" }}
        />
      </div>
    </div>
  );
}
