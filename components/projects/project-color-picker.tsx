"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PROJECT_COLORS, getProjectColor } from "@/lib/projects/colors";

interface ProjectColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ProjectColorPicker({ value, onChange }: ProjectColorPickerProps) {
  const { resolvedTheme } = useTheme();
  const t = useTranslations("projects");
  const isDark = resolvedTheme === "dark";

  return (
    <div className="grid grid-cols-4 gap-2">
      {PROJECT_COLORS.map((color) => {
        const isSelected = value === color.key;
        const bgColor = isDark ? color.hslDark : color.hsl;

        return (
          <button
            key={color.key}
            type="button"
            aria-label={t(`colors.${color.key}`)}
            className={cn(
              "h-8 w-8 rounded-full transition-all",
              isSelected && "ring-2 ring-offset-2 ring-offset-background ring-primary"
            )}
            style={{ backgroundColor: bgColor }}
            onClick={() => onChange(color.key)}
          />
        );
      })}
    </div>
  );
}
