"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, ClipboardList, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: Home, labelKey: "dashboard", match: (p: string) => p === "/dashboard" },
  { href: "/habits", icon: ClipboardList, labelKey: "habits", match: (p: string) => p.startsWith("/habits") },
  { href: "/tasks", icon: ListChecks, labelKey: "tasks", match: (p: string) => p.startsWith("/tasks") },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const t = useTranslations("common.nav");

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-16 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive = item.match(pathname);
          return (
            <Link
              key={item.labelKey}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                isActive
                  ? "text-emerald-600 dark:text-emerald-400 font-medium"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="size-5" aria-hidden="true" />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
