"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CategoryPicker } from "@/components/categories/category-picker";
import { FrequencySelector } from "@/components/habits/frequency-selector";
import { habitFormSchema, type HabitFormValues } from "@/lib/validations/habit";
import type { Habit } from "@/lib/db/types";

interface HabitFormProps {
  mode: "create" | "edit";
  initialData?: Habit;
  onSubmit: (data: HabitFormValues) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  hideChrome?: boolean;
  id?: string;
}

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

  const form = useForm<HabitFormValues>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      description: initialData?.description ?? null,
      category_id: initialData?.category_id ?? null,
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
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("categoryLabel")}</FormLabel>
                <FormControl>
                  <CategoryPicker
                    value={field.value ?? null}
                    onChange={field.onChange}
                    disabled={isLoading}
                  />
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
