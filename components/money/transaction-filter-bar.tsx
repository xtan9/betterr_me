"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMoneyCategories as useCategories } from "@/lib/hooks/use-money-categories";
import { useAccounts } from "@/lib/hooks/use-accounts";
import type { TransactionFilters } from "@/lib/hooks/use-transactions";

interface TransactionFilterBarProps {
  filters: TransactionFilters;
  activeFilterCount: number;
  onFilterChange: (key: string, value: string | null) => void;
  onClearAll: () => void;
}

export function TransactionFilterBar({
  filters,
  activeFilterCount,
  onFilterChange,
  onClearAll,
}: TransactionFilterBarProps) {
  const t = useTranslations("money");
  const { categories } = useCategories();
  const { connections } = useAccounts();

  const allAccounts = connections.flatMap((c) => c.accounts);

  // Build active filter chips
  const chips: { key: string; label: string }[] = [];

  if (filters.date_from || filters.date_to) {
    const from = filters.date_from ?? "...";
    const to = filters.date_to ?? "...";
    chips.push({
      key: "date_range",
      label: `${from} - ${to}`,
    });
  }

  if (filters.amount_min || filters.amount_max) {
    const min = filters.amount_min ? `$${filters.amount_min}` : "...";
    const max = filters.amount_max ? `$${filters.amount_max}` : "...";
    chips.push({
      key: "amount_range",
      label: `${min} - ${max}`,
    });
  }

  if (filters.category_id) {
    const cat = categories.find((c) => c.id === filters.category_id);
    chips.push({
      key: "category_id",
      label: `${t("transactions.filters.category")}: ${cat?.display_name || cat?.name || filters.category_id}`,
    });
  }

  if (filters.account_id) {
    const acc = allAccounts.find((a) => a.id === filters.account_id);
    chips.push({
      key: "account_id",
      label: `${t("transactions.filters.account")}: ${acc?.name || filters.account_id}`,
    });
  }

  const handleRemoveChip = (key: string) => {
    if (key === "date_range") {
      onFilterChange("date_from", null);
      // Small delay is not needed — just call both
      onFilterChange("date_to", null);
    } else if (key === "amount_range") {
      onFilterChange("amount_min", null);
      onFilterChange("amount_max", null);
    } else {
      onFilterChange(key, null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Filter inputs row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Date From */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("transactions.filters.dateFrom")}
          </label>
          <Input
            type="date"
            value={filters.date_from ?? ""}
            onChange={(e) =>
              onFilterChange("date_from", e.target.value || null)
            }
            className="h-8 text-xs"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("transactions.filters.dateTo")}
          </label>
          <Input
            type="date"
            value={filters.date_to ?? ""}
            onChange={(e) =>
              onFilterChange("date_to", e.target.value || null)
            }
            className="h-8 text-xs"
          />
        </div>

        {/* Category */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("transactions.filters.category")}
          </label>
          <Select
            value={filters.category_id ?? "all"}
            onValueChange={(v) =>
              onFilterChange("category_id", v === "all" ? null : v)
            }
          >
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue placeholder={t("transactions.filters.allCategories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("transactions.filters.allCategories")}
              </SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.icon ? `${cat.icon} ` : ""}
                  {cat.display_name || cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Account */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("transactions.filters.account")}
          </label>
          <Select
            value={filters.account_id ?? "all"}
            onValueChange={(v) =>
              onFilterChange("account_id", v === "all" ? null : v)
            }
          >
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue placeholder={t("transactions.filters.allAccounts")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("transactions.filters.allAccounts")}
              </SelectItem>
              {allAccounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Amount range (collapsible row) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("transactions.filters.amountMin")}
          </label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={filters.amount_min ?? ""}
            onChange={(e) =>
              onFilterChange("amount_min", e.target.value || null)
            }
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("transactions.filters.amountMax")}
          </label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={filters.amount_max ?? ""}
            onChange={(e) =>
              onFilterChange("amount_max", e.target.value || null)
            }
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
              {chip.label}
              <button
                type="button"
                onClick={() => handleRemoveChip(chip.key)}
                className="ml-0.5 rounded-sm p-0.5 hover:bg-accent"
                aria-label={t("transactions.filters.removeFilter")}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {activeFilterCount >= 2 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="h-6 px-2 text-xs"
            >
              {t("transactions.filters.clearAll")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
