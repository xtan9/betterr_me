"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PenLine, CalendarDays, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layouts/page-header";
import { JournalCalendar } from "@/components/journal/journal-calendar";
import { JournalTimeline } from "@/components/journal/journal-timeline";
import { JournalEntryModal } from "@/components/journal/journal-entry-modal";
import { JournalStreakBadge } from "@/components/journal/journal-streak-badge";
import { JournalOnThisDayFull } from "@/components/journal/journal-on-this-day-full";
import { useJournalWidget } from "@/lib/hooks/use-journal-widget";
import { getLocalDateString } from "@/lib/utils";

export function JournalPageContent() {
  const t = useTranslations("journal");
  const { streak } = useJournalWidget();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [refreshKey, setRefreshKey] = useState(0);
  const today = getLocalDateString();

  const handleDayClick = useCallback((date: string) => {
    setSelectedDate(date);
    setModalOpen(true);
  }, []);

  const handleEntryClick = useCallback((date: string) => {
    setSelectedDate(date);
    setModalOpen(true);
  }, []);

  const handleWriteToday = useCallback(() => {
    setSelectedDate(getLocalDateString());
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback((open: boolean) => {
    if (!open) {
      setRefreshKey((prev) => prev + 1);
    }
    setModalOpen(open);
  }, []);

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={t("pageTitle")}
        actions={
          <div className="flex items-center gap-3">
            <JournalStreakBadge streak={streak} />
            <Button onClick={handleWriteToday}>
              <PenLine className="size-4 mr-2" />
              {t("writeToday")}
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="calendar">
        <div className="flex justify-center">
          <TabsList>
            <TabsTrigger value="calendar">
              <CalendarDays className="size-4" />
              {t("calendar")}
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <List className="size-4" />
              {t("timeline")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="calendar" className="flex justify-center">
          <JournalCalendar onDayClick={handleDayClick} refreshKey={refreshKey} />
        </TabsContent>

        <TabsContent value="timeline" className="max-w-2xl mx-auto">
          <JournalTimeline onEntryClick={handleEntryClick} refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>

      <JournalOnThisDayFull date={today} />

      <JournalEntryModal
        open={modalOpen}
        onOpenChange={handleModalClose}
        date={selectedDate}
      />
    </div>
  );
}
