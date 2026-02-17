"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

type Section = "habits" | "tasks" | "settings";

const SECTION_HREFS: Record<Section, string> = {
  habits: "/habits",
  tasks: "/tasks",
  settings: "/dashboard/settings",
};

interface PageBreadcrumbsProps {
  section: Section;
  itemName?: string;
  className?: string;
}

export function PageBreadcrumbs({
  section,
  itemName,
  className,
}: PageBreadcrumbsProps) {
  const t = useTranslations("common.nav");

  return (
    <Breadcrumb className={cn("mb-2", className)}>
      <BreadcrumbList className="text-xs sm:text-sm">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={SECTION_HREFS[section]}>{t(section)}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {itemName && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="truncate max-w-[200px] sm:max-w-none">
                {itemName}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
