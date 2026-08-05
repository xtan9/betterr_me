"use client";

import { useCallback, useState } from "react";
import { getLocalDateString } from "@/lib/utils";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { CalendarEventDisplayItem } from "@/lib/calendar/display";

export interface QuickCreateState {
  isOpen: boolean;
  date: string;
  startTime: string;
  endTime: string;
  anchorPosition: { x: number; y: number };
}

export interface EventDialogState {
  isOpen: boolean;
  event?: ExpandedCalendarEvent | null;
  prefill?: {
    title?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
  };
}

interface UseCalendarEventsResult {
  quickCreate: QuickCreateState | null;
  setQuickCreate: React.Dispatch<React.SetStateAction<QuickCreateState | null>>;
  eventDialog: EventDialogState | null;
  setEventDialog: React.Dispatch<React.SetStateAction<EventDialogState | null>>;
  isOverlayOpen: boolean;
  handleTimeSlotClick: (
    date: Date,
    time: string,
    position: { x: number; y: number },
  ) => void;
  handleDragSelect: (
    date: Date,
    startTime: string,
    endTime: string,
    position: { x: number; y: number },
  ) => void;
  handleEventClick: (item: CalendarEventDisplayItem) => void;
  handleNewEvent: () => void;
  handleQuickCreateMoreOptions: (title: string) => void;
  handleEventSaved: () => void;
}

export function useCalendarEvents(
  dateParam: string,
  onEventSaved: () => void,
): UseCalendarEventsResult {
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  const [eventDialog, setEventDialog] = useState<EventDialogState | null>(null);

  const isOverlayOpen = !!(quickCreate?.isOpen || eventDialog?.isOpen);

  const handleTimeSlotClick = useCallback(
    (date: Date, time: string, position: { x: number; y: number }) => {
      const [h, m] = time.split(":").map(Number);
      const endMinutes = h * 60 + m + 30;
      const endH = Math.floor(endMinutes / 60) % 24;
      const endM = endMinutes % 60;
      const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

      setQuickCreate({
        isOpen: true,
        date: getLocalDateString(date),
        startTime: time,
        endTime,
        anchorPosition: position,
      });
    },
    [],
  );

  const handleDragSelect = useCallback(
    (
      date: Date,
      startTime: string,
      endTime: string,
      position: { x: number; y: number },
    ) => {
      setQuickCreate({
        isOpen: true,
        date: getLocalDateString(date),
        startTime,
        endTime,
        anchorPosition: position,
      });
    },
    [],
  );

  const handleEventClick = useCallback((item: CalendarEventDisplayItem) => {
    setEventDialog({ isOpen: true, event: item.event });
  }, []);

  const handleNewEvent = useCallback(() => {
    setEventDialog({
      isOpen: true,
      event: null,
      prefill: { date: dateParam },
    });
  }, [dateParam]);

  const handleQuickCreateMoreOptions = useCallback(
    (title: string) => {
      if (quickCreate) {
        setQuickCreate(null);
        setEventDialog({
          isOpen: true,
          event: null,
          prefill: {
            title,
            date: quickCreate.date,
            startTime: quickCreate.startTime,
            endTime: quickCreate.endTime,
          },
        });
      }
    },
    [quickCreate],
  );

  return {
    quickCreate,
    setQuickCreate,
    eventDialog,
    setEventDialog,
    isOverlayOpen,
    handleTimeSlotClick,
    handleDragSelect,
    handleEventClick,
    handleNewEvent,
    handleQuickCreateMoreOptions,
    handleEventSaved: onEventSaved,
  };
}
