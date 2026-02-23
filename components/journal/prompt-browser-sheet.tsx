"use client";

import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  PROMPT_CATEGORIES,
  getPromptsByCategory,
} from "@/lib/data/writing-prompts";

interface PromptBrowserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (key: string) => void;
  selectedKey?: string | null;
}

export function PromptBrowserSheet({
  open,
  onOpenChange,
  onSelect,
  selectedKey,
}: PromptBrowserSheetProps) {
  const t = useTranslations();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("journal.prompts.title")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("journal.prompts.trigger")}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="gratitude" className="mt-4">
          <TabsList className="w-full">
            {PROMPT_CATEGORIES.map((cat) => (
              <TabsTrigger key={cat} value={cat}>
                {t(`journal.prompts.categories.${cat}`)}
              </TabsTrigger>
            ))}
          </TabsList>

          {PROMPT_CATEGORIES.map((cat) => (
            <TabsContent key={cat} value={cat} className="mt-3">
              <div className="flex flex-col gap-2">
                {getPromptsByCategory(cat).map((prompt) => (
                  <button
                    key={prompt.key}
                    type="button"
                    onClick={() => onSelect(prompt.key)}
                    className={`w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors ${
                      prompt.key === selectedKey
                        ? "bg-accent/50 border-primary/20"
                        : ""
                    }`}
                  >
                    <span className="text-sm">{t(prompt.i18nKey)}</span>
                  </button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
