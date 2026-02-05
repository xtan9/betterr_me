"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
}

// Lazy-loaded timezone cache for better initial bundle performance
let timezonesCache: TimezoneOption[] | null = null;

const getTimezones = (): TimezoneOption[] => {
  if (timezonesCache) {
    return timezonesCache;
  }

  const timezones = Intl.supportedValuesOf("timeZone");
  const now = new Date();

  timezonesCache = timezones.map((tz) => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    const offset = offsetPart?.value || "";

    // Create a friendly label from the timezone
    const label = tz.replace(/_/g, " ").replace(/\//g, " / ");

    return {
      value: tz,
      label,
      offset,
    };
  });

  return timezonesCache;
};

interface TimezoneSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TimezoneSelector({
  value,
  onChange,
  disabled = false,
}: TimezoneSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const t = useTranslations("settings.timezone");

  // Lazy load timezones when component is used
  const timezones = React.useMemo(() => getTimezones(), []);
  const selectedTimezone = timezones.find((tz) => tz.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedTimezone ? (
            <span className="truncate">
              {selectedTimezone.label} ({selectedTimezone.offset})
            </span>
          ) : (
            t("placeholder")
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("search")} />
          <CommandList>
            <CommandEmpty>{t("noResults")}</CommandEmpty>
            <CommandGroup>
              {timezones.map((tz) => (
                <CommandItem
                  key={tz.value}
                  value={`${tz.value} ${tz.label}`}
                  onSelect={() => {
                    onChange(tz.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === tz.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{tz.label}</span>
                  <span className="ml-2 text-muted-foreground text-sm">
                    {tz.offset}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
