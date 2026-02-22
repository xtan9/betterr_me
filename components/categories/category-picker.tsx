"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCategories } from "@/lib/hooks/use-categories";
import { PROJECT_COLORS, getProjectColor } from "@/lib/projects/colors";
import type { Category } from "@/lib/db/types";

interface CategoryPickerProps {
  value: string | null;
  onChange: (categoryId: string | null) => void;
  disabled?: boolean;
}

export function CategoryPicker({ value, onChange, disabled }: CategoryPickerProps) {
  const t = useTranslations("categories");
  const { categories, mutate } = useCategories();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const { category } = await res.json();
      mutate();
      onChange(category.id);
      setNewName("");
      setNewColor("blue");
      setPopoverOpen(false);
    } catch (err) {
      console.error("Failed to create category:", err);
      toast.error(t("createError"));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat: Category) => {
        const color = getProjectColor(cat.color);
        const bgColor = isDark ? color.hslDark : color.hsl;
        return (
          <Toggle
            key={cat.id}
            variant="outline"
            size="sm"
            pressed={value === cat.id}
            onPressedChange={(pressed) => onChange(pressed ? cat.id : null)}
            disabled={disabled}
            className={cn(
              "gap-1.5",
              value === cat.id && "border-primary"
            )}
            style={value === cat.id ? { backgroundColor: bgColor, color: "white" } : {}}
          >
            <span
              className="inline-block size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: bgColor }}
            />
            <span className="text-xs">{cat.name}</span>
          </Toggle>
        );
      })}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled} className="gap-1">
            <Plus className="size-3.5" />
            <span className="text-xs">{t("add")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-3" align="start">
          <Input
            placeholder={t("namePlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={isCreating}
            className="h-8 text-sm"
          />
          <div className="grid grid-cols-6 gap-1.5">
            {PROJECT_COLORS.map((c) => {
              const bg = isDark ? c.hslDark : c.hsl;
              return (
                <button
                  key={c.key}
                  type="button"
                  className={cn(
                    "size-7 rounded-full transition-all",
                    newColor === c.key && "ring-2 ring-offset-2 ring-primary"
                  )}
                  style={{ backgroundColor: bg }}
                  onClick={() => setNewColor(c.key)}
                  disabled={isCreating}
                  aria-label={c.label}
                />
              );
            })}
          </div>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={isCreating || !newName.trim()}
            className="w-full"
          >
            {isCreating ? t("creating") : t("create")}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
