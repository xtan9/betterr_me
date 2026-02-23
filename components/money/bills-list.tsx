"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, RefreshCw, ChevronDown, ChevronRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BillSummaryHeader } from "@/components/money/bill-summary-header";
import { BillRow } from "@/components/money/bill-row";
import { BillForm } from "@/components/money/bill-form";
import { useBills } from "@/lib/hooks/use-bills";
import type { RecurringBill, BillFrequency, BillUserStatus } from "@/lib/db/types";

// Frequency grouping order
const FREQUENCY_GROUPS: { key: BillFrequency; labelKey: string }[] = [
  { key: "MONTHLY", labelKey: "monthly" },
  { key: "WEEKLY", labelKey: "weekly" },
  { key: "BIWEEKLY", labelKey: "biweekly" },
  { key: "SEMI_MONTHLY", labelKey: "semiMonthly" },
  { key: "ANNUALLY", labelKey: "annually" },
];

function sortByDueDate(a: RecurringBill, b: RecurringBill): number {
  if (!a.next_due_date && !b.next_due_date) return 0;
  if (!a.next_due_date) return 1;
  if (!b.next_due_date) return -1;
  return a.next_due_date.localeCompare(b.next_due_date);
}

export function BillsList() {
  const t = useTranslations("money.bills");
  const { bills, summary, isLoading, mutate } = useBills();

  const [formOpen, setFormOpen] = useState(false);
  const [editBill, setEditBill] = useState<RecurringBill | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dismissedOpen, setDismissedOpen] = useState(false);

  // Split bills into active (non-dismissed) and dismissed
  const { activeBills, dismissedBills } = useMemo(() => {
    const active: RecurringBill[] = [];
    const dismissed: RecurringBill[] = [];
    for (const bill of bills) {
      if (bill.user_status === "dismissed") {
        dismissed.push(bill);
      } else {
        active.push(bill);
      }
    }
    return { activeBills: active, dismissedBills: dismissed };
  }, [bills]);

  // Group active bills by frequency
  const groupedBills = useMemo(() => {
    const groups: { key: BillFrequency; labelKey: string; bills: RecurringBill[] }[] = [];

    for (const group of FREQUENCY_GROUPS) {
      const matching = activeBills
        .filter((b) => b.frequency === group.key)
        .sort(sortByDueDate);
      if (matching.length > 0) {
        groups.push({ ...group, bills: matching });
      }
    }

    return groups;
  }, [activeBills]);

  const handleStatusChange = useCallback(
    async (id: string, status: BillUserStatus) => {
      try {
        const res = await fetch(`/api/money/bills/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_status: status }),
        });
        if (!res.ok) throw new Error("Failed to update bill status");
        mutate();
      } catch {
        toast.error("Failed to update bill status");
      }
    },
    [mutate]
  );

  const handleEdit = useCallback((bill: RecurringBill) => {
    setEditBill(bill);
    setFormOpen(true);
  }, []);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/money/bills/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      toast.success(t("syncSuccess"));
      mutate();
    } catch {
      toast.error(t("syncError"));
    } finally {
      setIsSyncing(false);
    }
  }, [mutate, t]);

  const handleFormSuccess = useCallback(() => {
    setEditBill(null);
    setFormOpen(false);
    mutate();
  }, [mutate]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  // Empty state
  if (bills.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 size-4" />
            {t("addBill")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw className={`mr-1 size-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? t("syncing") : t("syncBills")}
          </Button>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-money-border bg-money-surface px-6 py-16 text-center">
          <Inbox className="mb-4 size-8 text-muted-foreground" />
          <h3 className="text-base font-semibold">{t("noBills")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("noBillsDescription")}
          </p>
        </div>

        <BillForm
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditBill(null);
          }}
          bill={editBill}
          onSuccess={handleFormSuccess}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      {summary && (
        <BillSummaryHeader
          totalMonthlyCents={summary.total_monthly_cents}
          billCount={summary.bill_count}
          pendingCount={summary.pending_count}
        />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-1 size-4" />
          {t("addBill")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
        >
          <RefreshCw className={`mr-1 size-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? t("syncing") : t("syncBills")}
        </Button>
      </div>

      {/* Frequency-grouped sections */}
      {groupedBills.map((group) => (
        <div key={group.key} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t(group.labelKey)}
          </h3>
          <div className="space-y-1">
            {group.bills.map((bill) => (
              <BillRow
                key={bill.id}
                bill={bill}
                onStatusChange={handleStatusChange}
                onEdit={handleEdit}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Dismissed section */}
      {dismissedBills.length > 0 && (
        <Collapsible open={dismissedOpen} onOpenChange={setDismissedOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
              {dismissedOpen ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              {t("dismissed")} ({dismissedBills.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pt-2">
            {dismissedBills.sort(sortByDueDate).map((bill) => (
              <BillRow
                key={bill.id}
                bill={bill}
                onStatusChange={handleStatusChange}
                onEdit={handleEdit}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Bill form dialog */}
      <BillForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditBill(null);
        }}
        bill={editBill}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
