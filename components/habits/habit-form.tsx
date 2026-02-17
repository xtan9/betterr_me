"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Heart, Brain, BookOpen, Zap, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FrequencySelector } from "@/components/habits/frequency-selector";
import { habitFormSchema, type HabitFormValues } from "@/lib/validations/habit";
import type { Habit, HabitCategory } from "@/lib/db/types";

interface HabitFormProps {
  mode: "create" | "edit";
  initialData?: Habit;
  onSubmit: (data: HabitFormValues) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  hideChrome?: boolean;
  id?: string;
}

const CATEGORY_OPTIONS: {
  value: HabitCategory;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}[] = [
  { value: "health", icon: Heart, colorClass: "data-[state=on]:bg-rose-500 data-[state=on]:text-white" },
  { value: "wellness", icon: Brain, colorClass: "data-[state=on]:bg-purple-500 data-[state=on]:text-white" },
  { value: "learning", icon: BookOpen, colorClass: "data-[state=on]:bg-blue-500 data-[state=on]:text-white" },
  { value: "productivity", icon: Zap, colorClass: "data-[state=on]:bg-amber-500 data-[state=on]:text-white" },
  { value: "other", icon: MoreHorizontal, colorClass: "data-[state=on]:bg-slate-500 data-[state=on]:text-white" },
];

export function HabitForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  hideChrome = false,
  id,
}: HabitFormProps) {
  const t = useTranslations("habits.form");
  const categoryT = useTranslations("habits.categories");

  const form = useForm<HabitFormValues>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      description: initialData?.description ?? null,
      category: initialData?.category ?? null,
      frequency: initialData?.frequency ?? { type: "daily" },
    },
  });

  const handleFormSubmit = async (data: HabitFormValues) => {
    await onSubmit({
      ...data,
      description: data.description || null,
    });
  };

  return (
    <div className="space-y-6">
      {!hideChrome && (
        <h2 className="text-lg font-semibold">
          {mode === "create" ? t("createTitle") : t("editTitle")}
        </h2>
      )}

      <Form {...form}>
        <form id={id} onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nameLabel")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("namePlaceholder")}
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("descriptionLabel")}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t("descriptionPlaceholder")}
                    disabled={isLoading}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("categoryLabel")}</FormLabel>
                <FormControl>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_OPTIONS.map(({ value, icon: Icon, colorClass }) => (
                      <Toggle
                        key={value}
                        variant="outline"
                        size="sm"
                        pressed={field.value === value}
                        onPressedChange={(pressed) => {
                          field.onChange(pressed ? value : null);
                        }}
                        disabled={isLoading}
                        className={cn("flex-1 gap-1.5", colorClass)}
                      >
                        <Icon className="size-4" />
                        <span className="text-xs">{categoryT(value)}</span>
                      </Toggle>
                    ))}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("frequencyLabel")}</FormLabel>
                <FormControl>
                  <FrequencySelector
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {!hideChrome && (
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={isLoading}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
              >
                {isLoading
                  ? mode === "create"
                    ? t("creating")
                    : t("saving")
                  : mode === "create"
                    ? t("create")
                    : t("save")}
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
