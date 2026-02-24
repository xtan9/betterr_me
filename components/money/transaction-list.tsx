"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTransactions } from "@/lib/hooks/use-transactions";
import { useTransactionFilters } from "@/lib/hooks/use-transaction-filters";
import { useCategories } from "@/lib/hooks/use-categories";
import { useHousehold } from "@/lib/hooks/use-household";
import { getLocalDateString } from "@/lib/utils";
import { TransactionSearch } from "@/components/money/transaction-search";
import { TransactionFilterBar } from "@/components/money/transaction-filter-bar";
import { TransactionRow } from "@/components/money/transaction-row";
import { TransactionDetail } from "@/components/money/transaction-detail";
import { HouseholdViewTabs } from "@/components/money/household-view-tabs";
import type { Transaction, Category } from "@/lib/db/types";

interface DateGroup {
  label: string;
  date: string;
  transactions: Transaction[];
}

function formatDateLabel(
  dateStr: string,
  today: string,
  yesterday: string,
  t: (key: string) => string
): string {
  if (dateStr === today) return t("transactions.today");
  if (dateStr === yesterday) return t("transactions.yesterday");

  const date = new Date(dateStr + "T12:00:00"); // Noon to avoid timezone issues
  const currentYear = new Date().getFullYear();
  const dateYear = date.getFullYear();

  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();

  if (dateYear === currentYear) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${dateYear}`;
}

function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
}

function groupByDate(
  transactions: Transaction[],
  today: string,
  yesterday: string,
  t: (key: string) => string
): DateGroup[] {
  const groups = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const date = tx.transaction_date;
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(tx);
  }

  // Sort by date descending (newest first)
  const sortedDates = Array.from(groups.keys()).sort((a, b) =>
    b.localeCompare(a)
  );

  return sortedDates.map((date) => ({
    label: formatDateLabel(date, today, yesterday, t),
    date,
    transactions: groups.get(date)!,
  }));
}

export function TransactionList() {
  const t = useTranslations("money");
  const { viewMode, setViewMode, isMultiMember } = useHousehold();
  const { filters, activeFilterCount, setFilter, clearAll } =
    useTransactionFilters();
  const { transactions, total, hasMore, isLoading, isLoadingMore, loadMore, mutate } =
    useTransactions(filters, viewMode);
  const { categories } = useCategories();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isHouseholdView = viewMode === "household";

  // Handle Escape key to close expanded detail
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedId) {
        setExpandedId(null);
      }
    },
    [expandedId]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const today = useMemo(() => getLocalDateString(), []);
  const yesterday = useMemo(() => getYesterdayString(), []);

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  const dateGroups = useMemo(
    () => groupByDate(transactions, today, yesterday, t),
    [transactions, today, yesterday, t]
  );

  const hasActiveFilters = activeFilterCount > 0;

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mine/Household tabs */}
      <HouseholdViewTabs
        value={viewMode}
        onValueChange={setViewMode}
        isMultiMember={isMultiMember}
      />

      {/* Search */}
      <TransactionSearch
        value={filters.search ?? ""}
        onChange={(val) => setFilter("search", val)}
      />

      {/* Filter bar */}
      <TransactionFilterBar
        filters={filters}
        activeFilterCount={activeFilterCount}
        onFilterChange={setFilter}
        onClearAll={clearAll}
      />

      {/* Transaction list */}
      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-money-border bg-money-surface px-6 py-16 text-center">
          <Inbox className="mb-4 size-8 text-muted-foreground" />
          <h3 className="text-base font-semibold">
            {hasActiveFilters
              ? t("transactions.noMatchingTransactions")
              : t("transactions.noTransactions")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? t("transactions.tryDifferentFilters")
              : t("transactions.noTransactionsDescription")}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={clearAll}
            >
              {t("transactions.filters.clearAll")}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Date-grouped transactions */}
          <div className="space-y-1">
            {dateGroups.map((group) => (
              <div key={group.date}>
                {/* Sticky date header */}
                <div className="sticky top-0 z-10 bg-background px-1 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h3>
                </div>

                {/* Transaction rows */}
                <div className="space-y-0.5">
                  {group.transactions.map((tx) => (
                    <div key={tx.id}>
                      <TransactionRow
                        transaction={tx}
                        category={
                          tx.category_id
                            ? categoryMap.get(tx.category_id)
                            : null
                        }
                        isExpanded={!isHouseholdView && tx.id === expandedId}
                        onClick={
                          isHouseholdView
                            ? undefined
                            : () =>
                                setExpandedId(
                                  tx.id === expandedId ? null : tx.id
                                )
                        }
                        redacted={isHouseholdView}
                      />
                      {!isHouseholdView && tx.id === expandedId && (
                        <TransactionDetail
                          transaction={tx}
                          categories={categories}
                          onUpdate={() => mutate(undefined, { revalidate: false })}
                          onClose={() => setExpandedId(null)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Load More / Count display */}
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-xs text-muted-foreground">
              {t("transactions.showingCount", {
                shown: transactions.length,
                total,
              })}
            </p>
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore
                  ? t("transactions.loadingMore")
                  : t("transactions.loadMore")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
