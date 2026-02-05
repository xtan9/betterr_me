"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function MainNav() {
  const pathname = usePathname();
  const t = useTranslations("common.nav");

  const navItems = [
    {
      href: "/dashboard",
      label: t("dashboard"),
      isActive: pathname === "/dashboard",
    },
    {
      href: "/habits",
      label: t("habits"),
      isActive: pathname.startsWith("/habits"),
    },
    {
      href: "/dashboard/settings",
      label: t("settings"),
      isActive: pathname.startsWith("/dashboard/settings"),
    },
  ];

  return (
    <nav className="hidden md:flex items-center gap-6">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "text-sm font-medium transition-colors hover:text-primary",
            item.isActive
              ? "text-foreground"
              : "text-muted-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
