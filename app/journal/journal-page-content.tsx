"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PenLine, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layouts/page-header";
import { JournalEntryModal } from "@/components/journal/journal-entry-modal";
import { getLocalDateString } from "@/lib/utils";

export function JournalPageContent() {
  const t = useTranslations("journal");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate] = useState(() => getLocalDateString());

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={t("pageTitle")}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <PenLine className="size-4 mr-2" />
            {t("writeToday")}
          </Button>
        }
      />

      {/* Empty state placeholder - Phase 23 will replace with calendar/timeline */}
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BookOpen className="size-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">{t("emptyState")}</p>
      </div>

      <JournalEntryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        date={selectedDate}
      />
    </div>
  );
}
