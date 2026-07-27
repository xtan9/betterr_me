"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/request";

const locales = [
  { code: "en", name: "English" },
  { code: "zh", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
] as const;

export function LanguageSwitcher({ showLabel = false }: { showLabel?: boolean }) {
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = (newLocale: Locale) => {
    startTransition(() => {
      window.dispatchEvent(new Event("betterr:before-locale-change"));
      document.cookie = `locale=${newLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
      window.location.reload();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={showLabel ? "sm" : "icon"}
          disabled={isPending}
          aria-label="Language"
        >
          <Languages className="h-[1.2rem] w-[1.2rem]" />
          {showLabel ? (
            <span>{locales.find((item) => item.code === locale)?.name}</span>
          ) : (
            <span className="sr-only">Toggle language</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((item) => (
          <DropdownMenuItem
            key={item.code}
            onClick={() => handleLocaleChange(item.code)}
            className={locale === item.code ? "font-semibold" : ""}
          >
            {item.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
