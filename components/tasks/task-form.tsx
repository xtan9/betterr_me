"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Briefcase, User, ShoppingCart, MoreHorizontal } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecurrencePicker } from "@/components/tasks/recurrence-picker";
import { taskFormSchema, type TaskFormValues } from "@/lib/validations/task";
import type { Task, TaskCategory, RecurrenceRule, EndType } from "@/lib/db/types";

export interface RecurrenceConfig {
  rule: RecurrenceRule | null;
  endType: EndType;
  endDate: string | null;
  endCount: number | null;
}

interface TaskFormProps {
  mode: "create" | "edit";
  initialData?: Task;
  onSubmit: (data: TaskFormValues, recurrence?: RecurrenceConfig) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  hideChrome?: boolean;
  id?: string;
  showRecurrence?: boolean;
  initialRecurrence?: RecurrenceConfig;
}

const CATEGORY_OPTIONS: {
  value: TaskCategory;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}[] = [
  {
    value: "work",
    icon: Briefcase,
    colorClass: "data-[state=on]:bg-blue-500 data-[state=on]:text-white",
  },
  {
    value: "personal",
    icon: User,
    colorClass: "data-[state=on]:bg-purple-500 data-[state=on]:text-white",
  },
  {
    value: "shopping",
    icon: ShoppingCart,
    colorClass: "data-[state=on]:bg-amber-500 data-[state=on]:text-white",
  },
  {
    value: "other",
    icon: MoreHorizontal,
    colorClass: "data-[state=on]:bg-slate-500 data-[state=on]:text-white",
  },
];

const PRIORITY_OPTIONS = [
  { value: "0", colorClass: "text-slate-400" },
  { value: "1", colorClass: "text-green-500" },
  { value: "2", colorClass: "text-yellow-500" },
  { value: "3", colorClass: "text-red-500" },
] as const;

export function TaskForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  hideChrome = false,
  id,
  showRecurrence = true,
  initialRecurrence,
}: TaskFormProps) {
  const t = useTranslations("tasks.form");
  const categoryT = useTranslations("tasks.categories");
  const priorityT = useTranslations("tasks.priorities");

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: initialData?.title ?? "",
      description: initialData?.description ?? null,
      intention: initialData?.intention ?? null,
      priority: initialData?.priority ?? 0,
      category: initialData?.category ?? null,
      due_date: initialData?.due_date ?? null,
      due_time: initialData?.due_time?.slice(0, 5) ?? null,
    },
  });

  const [recurrence, setRecurrence] = useState<RecurrenceConfig>(
    initialRecurrence ?? {
      rule: null,
      endType: "never",
      endDate: null,
      endCount: null,
    }
  );

  const handleRecurrenceChange = useCallback(
    (
      rule: RecurrenceRule | null,
      endType: EndType,
      endDate: string | null,
      endCount: number | null
    ) => {
      setRecurrence({ rule, endType, endDate, endCount });
    },
    []
  );

  const dueDate = form.watch("due_date");
  const showRecurrenceSection = showRecurrence && mode === "create" && !!dueDate;

  const handleFormSubmit = async (data: TaskFormValues) => {
    await onSubmit(
      {
        ...data,
        description: data.description || null,
        intention: data.intention || null,
      },
      recurrence.rule ? recurrence : undefined
    );
  };

  return (
    <div className="space-y-6">
      {!hideChrome && (
        <h2 className="text-lg font-semibold">
          {mode === "create" ? t("createTitle") : t("editTitle")}
        </h2>
      )}

      <Form {...form}>
        <form
          id={id}
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="space-y-5"
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("titleLabel")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("titlePlaceholder")}
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
            name="intention"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground italic">
                  {t("intentionLabel")}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("intentionPlaceholder")}
                    disabled={isLoading}
                    className="italic text-muted-foreground"
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
                  <div className="flex gap-2">
                    {CATEGORY_OPTIONS.map(
                      ({ value, icon: Icon, colorClass }) => (
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
                      ),
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("priorityLabel")}</FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(val) =>
                    field.onChange(parseInt(val) as 0 | 1 | 2 | 3)
                  }
                  disabled={isLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(({ value, colorClass }) => (
                      <SelectItem key={value} value={value}>
                        <span className={cn("font-medium", colorClass)}>
                          {priorityT(value)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="due_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dueDateLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      disabled={isLoading}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="due_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dueTimeLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
                      disabled={isLoading}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Recurrence section — only shown in create mode when due_date is set */}
          {showRecurrenceSection && (
            <FormItem>
              <FormLabel>{t("repeatLabel")}</FormLabel>
              <RecurrencePicker
                value={recurrence.rule}
                endType={recurrence.endType}
                endDate={recurrence.endDate}
                endCount={recurrence.endCount}
                onChange={handleRecurrenceChange}
                disabled={isLoading}
                startDate={dueDate}
              />
            </FormItem>
          )}

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
