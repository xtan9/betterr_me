"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  addDays,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillCalendarDay } from "@/components/money/bill-calendar-day";
import type { RecurringBill, BillFrequency } from "@/lib/db/types";

interface BillCalendarProps {
  bills: RecurringBill[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Project a bill's due date to all matching days in a given month.
 * For future months, calculates when the bill falls based on frequency.
 */
function getBillDatesInMonth(
  bill: RecurringBill,
  monthStart: Date,
  monthEnd: Date
): Date[] {
  if (!bill.next_due_date) return [];
  if (bill.user_status === "dismissed") return [];

  const dueDate = new Date(bill.next_due_date + "T12:00:00");
  const dates: Date[] = [];

  switch (bill.frequency) {
    case "WEEKLY": {
      // Every 7 days from due date, find all in this month
      let d = new Date(dueDate);
      // Walk backward to find first occurrence before/at monthStart
      while (d > monthStart) d = addDays(d, -7);
      // Walk forward to find all in this month
      while (d <= monthEnd) {
        if (d >= monthStart && d <= monthEnd) {
          dates.push(new Date(d));
        }
        d = addDays(d, 7);
      }
      break;
    }
    case "BIWEEKLY": {
      let d = new Date(dueDate);
      while (d > monthStart) d = addDays(d, -14);
      while (d <= monthEnd) {
        if (d >= monthStart && d <= monthEnd) {
          dates.push(new Date(d));
        }
        d = addDays(d, 14);
      }
      break;
    }
    case "SEMI_MONTHLY": {
      // Twice per month: same day and 15 days later (or day 1 and 15)
      const dayOfMonth = dueDate.getDate();
      const d1 = new Date(monthStart.getFullYear(), monthStart.getMonth(), dayOfMonth);
      const d2 = new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(dayOfMonth + 15, 28));
      if (d1 >= monthStart && d1 <= monthEnd) dates.push(d1);
      if (d2 >= monthStart && d2 <= monthEnd) dates.push(d2);
      break;
    }
    case "MONTHLY": {
      const dayOfMonth = dueDate.getDate();
      const lastDay = endOfMonth(monthStart).getDate();
      const targetDay = Math.min(dayOfMonth, lastDay);
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), targetDay);
      if (d >= monthStart && d <= monthEnd) {
        dates.push(d);
      }
      break;
    }
    case "ANNUALLY": {
      const d = new Date(
        monthStart.getFullYear(),
        dueDate.getMonth(),
        dueDate.getDate()
      );
      if (d >= monthStart && d <= monthEnd) {
        dates.push(d);
      }
      break;
    }
  }

  return dates;
}

export function BillCalendar({ bills }: BillCalendarProps) {
  const t = useTranslations("money.bills");
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const goToPreviousMonth = () => setCurrentMonth((m) => subMonths(m, 1));
  const goToNextMonth = () => setCurrentMonth((m) => addMonths(m, 1));

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Map bills to their dates in this month
  const billsByDate = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const map = new Map<string, RecurringBill[]>();

    for (const bill of bills) {
      const dates = getBillDatesInMonth(bill, monthStart, monthEnd);
      for (const date of dates) {
        const key = format(date, "yyyy-MM-dd");
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(bill);
      }
    }

    return map;
  }, [bills, currentMonth]);

  const handleDayToggle = (dateKey: string) => {
    setExpandedDate((prev) => (prev === dateKey ? null : dateKey));
  };

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
          <ChevronLeft className="size-5" />
        </Button>
        <h2 className="text-lg font-semibold min-w-[160px] text-center">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <Button variant="ghost" size="icon" onClick={goToNextMonth}>
          <ChevronRight className="size-5" />
        </Button>
      </div>

      {/* Day of week header */}
      <div className="grid grid-cols-7 gap-px">
        {DAY_LABELS.map((day) => (
          <div
            key={day}
            className="py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px">
        {calendarDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayBills = billsByDate.get(dateKey) ?? [];

          return (
            <BillCalendarDay
              key={dateKey}
              date={day}
              bills={dayBills}
              isCurrentMonth={isSameMonth(day, currentMonth)}
              isToday={isToday(day)}
              isExpanded={expandedDate === dateKey}
              onToggle={() => handleDayToggle(dateKey)}
            />
          );
        })}
      </div>
    </div>
  );
}
