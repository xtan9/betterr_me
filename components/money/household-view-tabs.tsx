"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ViewMode } from "@/lib/db/types";

interface HouseholdViewTabsProps {
  value: ViewMode;
  onValueChange: (v: ViewMode) => void;
  isMultiMember: boolean;
}

/**
 * Mine/Household tab switcher. Rendered only when the household
 * has more than one member -- solo users see nothing.
 */
export function HouseholdViewTabs({
  value,
  onValueChange,
  isMultiMember,
}: HouseholdViewTabsProps) {
  const t = useTranslations("money.household");

  if (!isMultiMember) return null;

  return (
    <Tabs
      value={value}
      onValueChange={(v) => onValueChange(v as ViewMode)}
    >
      <TabsList>
        <TabsTrigger value="mine">{t("tabMine")}</TabsTrigger>
        <TabsTrigger value="household">{t("tabHousehold")}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
