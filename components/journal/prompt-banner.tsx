"use client";

import { useTranslations } from "next-intl";
import { Lightbulb, X } from "lucide-react";
import { getPromptByKey } from "@/lib/data/writing-prompts";

interface PromptBannerProps {
  promptKey: string;
  onDismiss: () => void;
}

export function PromptBanner({ promptKey, onDismiss }: PromptBannerProps) {
  const t = useTranslations();
  const prompt = getPromptByKey(promptKey);

  if (!prompt) return null;

  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
      <Lightbulb className="size-4 mt-0.5 text-primary shrink-0" />
      <span className="text-sm text-foreground flex-1">
        {t(prompt.i18nKey)}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t("common.cancel")}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
