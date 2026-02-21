"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Briefcase, User, ShoppingCart, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { useProjects } from "@/lib/hooks/use-projects";
import { getProjectColor } from "@/lib/projects/colors";
import { taskFormSchema, type TaskFormValues } from "@/lib/validations/task";
import type { Task, TaskCategory, TaskSection, RecurrenceRule, EndType } from "@/lib/db/types";

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
  defaultSection?: TaskSection;
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
    colorClass: "data-[state=on]:bg-category-learning data-[state=on]:text-white",
  },
  {
    value: "personal",
    icon: User,
    colorClass: "data-[state=on]:bg-category-wellness data-[state=on]:text-white",
  },
  {
    value: "shopping",
    icon: ShoppingCart,
    colorClass: "data-[state=on]:bg-category-productivity data-[state=on]:text-white",
  },
  {
    value: "other",
    icon: MoreHorizontal,
    colorClass: "data-[state=on]:bg-category-other data-[state=on]:text-white",
  },
];

const PRIORITY_OPTIONS = [
  { value: "0", colorClass: "text-priority-none" },
  { value: "1", colorClass: "text-priority-low" },
  { value: "2", colorClass: "text-priority-medium" },
  { value: "3", colorClass: "text-priority-high" },
] as const;

export function TaskForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  hideChrome = false,
  id,
  defaultSection,
  showRecurrence = true,
  initialRecurrence,
}: TaskFormProps) {
  const t = useTranslations("tasks.form");
  const tTasks = useTranslations("tasks");
  const categoryT = useTranslations("tasks.categories");
  const priorityT = useTranslations("tasks.priorities");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: initialData?.title ?? "",
      description: initialData?.description ?? null,
      priority: initialData?.priority ?? 0,
      category: initialData?.category ?? null,
      due_date: initialData?.due_date ?? null,
      due_time: initialData?.due_time?.slice(0, 5) ?? null,
      section: initialData?.section ?? defaultSection ?? "personal",
      project_id: initialData?.project_id ?? null,
    },
  });

  const watchedSection = form.watch("section") ?? "personal";
  const { projects } = useProjects({ status: "active" });
  const filteredProjects = projects.filter(
    (p) => p.section === watchedSection
  );

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
            name="section"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tTasks("sectionLabel")}</FormLabel>
                <FormControl>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value ?? "personal"}
                    onValueChange={(value) => {
                      if (value) {
                        field.onChange(value);
                        // Silently clear project when section changes
                        form.setValue("project_id", null);
                      }
                    }}
                    className="w-full"
                  >
                    <ToggleGroupItem
                      value="personal"
                      className="flex-1 gap-1.5"
                    >
                      <User className="size-4" />
                      {categoryT("personal")}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="work"
                      className="flex-1 gap-1.5"
                    >
                      <Briefcase className="size-4" />
                      {categoryT("work")}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="project_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tTasks("projectLabel")}</FormLabel>
                <Select
                  value={field.value ?? "none"}
                  onValueChange={(val) =>
                    field.onChange(val === "none" ? null : val)
                  }
                  disabled={isLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={tTasks("projectPlaceholder")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">
                      {tTasks("noProject")}
                    </SelectItem>
                    {filteredProjects.map((project) => {
                      const color = getProjectColor(project.color);
                      const bgColor = isDark ? color.hslDark : color.hsl;
                      return (
                        <SelectItem key={project.id} value={project.id}>
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: bgColor }}
                            />
                            {project.name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
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
