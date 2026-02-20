"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { User, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ProjectColorPicker } from "@/components/projects/project-color-picker";
import { projectFormSchema, type ProjectFormValues } from "@/lib/validations/project";
import type { Project } from "@/lib/db/types";

interface ProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
  onSuccess?: () => void;
}

export function ProjectModal({
  open,
  onOpenChange,
  project,
  onSuccess,
}: ProjectModalProps) {
  const t = useTranslations("projects");
  const isEditMode = !!project;

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name ?? "",
      section: project?.section ?? "personal",
      color: project?.color ?? "blue",
    },
  });

  // Reset form when dialog opens with different project
  useEffect(() => {
    if (open) {
      form.reset({
        name: project?.name ?? "",
        section: project?.section ?? "personal",
        color: project?.color ?? "blue",
      });
    }
  }, [open, project, form]);

  const handleSubmit = async (data: ProjectFormValues) => {
    try {
      const url = isEditMode
        ? `/api/projects/${project.id}`
        : "/api/projects";
      const method = isEditMode ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Request failed");
      }

      toast.success(isEditMode ? t("updateSuccess") : t("createSuccess"));
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Project save error:", error);
      toast.error(
        error instanceof Error ? error.message : "An error occurred"
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? t("editTitle") : t("createTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-5"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nameLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("namePlaceholder")}
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
                  <FormLabel>{t("sectionLabel")}</FormLabel>
                  <FormControl>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={field.value}
                      onValueChange={(value) => {
                        if (value) field.onChange(value);
                      }}
                      className="w-full"
                    >
                      <ToggleGroupItem
                        value="personal"
                        className="flex-1 gap-1.5"
                      >
                        <User className="size-4" />
                        {t("sections.personal")}
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="work"
                        className="flex-1 gap-1.5"
                      >
                        <Briefcase className="size-4" />
                        {t("sections.work")}
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("colorLabel")}</FormLabel>
                  <FormControl>
                    <ProjectColorPicker
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit">
                {isEditMode ? t("saveButton") : t("createButton")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
