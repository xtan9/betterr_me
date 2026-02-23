"use client";

import { useTranslations } from "next-intl";
import { List, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillsList } from "@/components/money/bills-list";
import { BillCalendar } from "@/components/money/bill-calendar";
import { useBills } from "@/lib/hooks/use-bills";

export function BillsPageContent() {
  const t = useTranslations("money.bills");
  const { bills } = useBills();

  return (
    <Tabs defaultValue="list">
      <TabsList>
        <TabsTrigger value="list">
          <List className="mr-1.5 size-4" />
          {t("listView")}
        </TabsTrigger>
        <TabsTrigger value="calendar">
          <Calendar className="mr-1.5 size-4" />
          {t("calendarView")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="list">
        <BillsList />
      </TabsContent>

      <TabsContent value="calendar">
        <BillCalendar bills={bills} />
      </TabsContent>
    </Tabs>
  );
}
