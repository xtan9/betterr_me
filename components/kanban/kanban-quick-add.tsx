"use client";

import { useState, useRef, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { TaskStatus } from "@/lib/db/types";

interface KanbanQuickAddProps {
  status: TaskStatus;
  projectId: string;
  projectSection: string;
  onTaskCreated: () => void;
}

export function KanbanQuickAdd({
  status,
  projectId,
  projectSection,
  onTaskCreated,
}: KanbanQuickAddProps) {
  const t = useTranslations("kanban");
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const trimmed = value.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          status,
          section: projectSection,
          project_id: projectId,
          priority: 0,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create task");
      }

      setValue("");
      onTaskCreated();
      // Re-focus input for rapid entry
      inputRef.current?.focus();
    } catch {
      toast.error(t("createError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="px-2 pb-2">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("quickAdd.placeholder")}
        className="h-8 text-sm"
        disabled={isSubmitting}
        autoFocus
      />
    </form>
  );
}
