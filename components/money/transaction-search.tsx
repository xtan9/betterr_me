"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/lib/hooks/use-debounce";

interface TransactionSearchProps {
  value: string;
  onChange: (value: string | null) => void;
}

export function TransactionSearch({ value, onChange }: TransactionSearchProps) {
  const t = useTranslations("money");
  const [localValue, setLocalValue] = useState(value);
  const debouncedValue = useDebounce(localValue, 300);

  // Sync debounced value to URL
  useEffect(() => {
    const trimmed = debouncedValue.trim();
    onChange(trimmed || null);
  }, [debouncedValue, onChange]);

  // Sync URL value to local state (e.g., when URL changes externally)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder={t("transactions.searchPlaceholder")}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        className="pl-9 pr-9"
      />
      {localValue && (
        <button
          type="button"
          onClick={() => setLocalValue("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={t("transactions.clearSearch")}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
