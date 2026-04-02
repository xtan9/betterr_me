"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { getLocalDateString } from "@/lib/utils";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";

const COLOR_PRESETS = [
  { value: "", label: "Default" },
  { value: "teal", label: "Teal" },
  { value: "blue", label: "Blue" },
  { value: "red", label: "Red" },
  { value: "green", label: "Green" },
  { value: "purple", label: "Purple" },
  { value: "orange", label: "Orange" },
];

interface EventDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Close the dialog */
  onClose: () => void;
  /** Event to edit (null = creating new) */
  event?: ExpandedCalendarEvent | null;
  /** Pre-fill values from quick-create context */
  prefill?: {
    title?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
  };
  /** Called after successful save/delete to refresh events */
  onSaved: () => void;
}

interface FormValues {
  title: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  is_all_day: boolean;
  location: string;
  description: string;
  color: string;
}

export function EventDialog({
  isOpen,
  onClose,
  event,
  prefill,
  onSaved,
}: EventDialogProps) {
  const t = useTranslations("calendar");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditing = !!event;
  const todayStr = getLocalDateString();

  const form = useForm<FormValues>({
    defaultValues: getDefaults(event, prefill, todayStr),
  });

  // Reset form when event/prefill changes
  useEffect(() => {
    if (isOpen) {
      form.reset(getDefaults(event, prefill, todayStr));
    }
  }, [isOpen, event, prefill, todayStr, form]);

  const isAllDay = form.watch("is_all_day");

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      setSaving(true);

      try {
        const payload: Record<string, unknown> = {
          title: values.title.trim(),
          start_date: values.start_date,
          end_date: values.end_date || values.start_date,
          start_time: values.is_all_day
            ? null
            : values.start_time
              ? values.start_time + ":00"
              : null,
          end_time: values.is_all_day
            ? null
            : values.end_time
              ? values.end_time + ":00"
              : null,
          location: values.location || null,
          description: values.description || null,
          color: values.color || null,
        };

        const url = isEditing
          ? `/api/calendar-events/${event!.id}`
          : "/api/calendar-events";
        const method = isEditing ? "PATCH" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error("Calendar event save failed:", data);
          form.setError("root", {
            message: data.error || t("eventDialog.saveFailed"),
          });
          return;
        }

        onSaved();
        onClose();
      } catch (err) {
        console.error("Failed to save calendar event:", err);
        form.setError("root", { message: t("eventDialog.saveFailed") });
      } finally {
        setSaving(false);
      }
    },
    [isEditing, event, onSaved, onClose, form, t],
  );

  const handleDelete = useCallback(async () => {
    if (!event) return;
    if (!window.confirm(t("eventDialog.deleteConfirm"))) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/calendar-events/${event.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Calendar event delete failed:", data);
        form.setError("root", {
          message: data.error || t("eventDialog.deleteFailed"),
        });
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to delete calendar event:", err);
      form.setError("root", { message: t("eventDialog.deleteFailed") });
    } finally {
      setDeleting(false);
    }
  }, [event, t, onSaved, onClose, form]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t("eventDialog.editEvent")
              : t("eventDialog.newEvent")}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-4"
        >
          {/* Title */}
          <div className="space-y-1">
            <Label htmlFor="event-title">{t("eventDialog.title")}</Label>
            <Input
              id="event-title"
              placeholder={t("eventDialog.titlePlaceholder")}
              {...form.register("title", { required: true })}
              autoFocus
            />
          </div>

          {/* All Day */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="event-all-day"
              checked={isAllDay}
              onCheckedChange={(checked) =>
                form.setValue("is_all_day", !!checked)
              }
            />
            <Label htmlFor="event-all-day" className="text-sm cursor-pointer">
              {t("eventDialog.allDay")}
            </Label>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="event-start-date">
                {t("eventDialog.date")}
              </Label>
              <Input
                id="event-start-date"
                type="date"
                {...form.register("start_date")}
              />
            </div>
            {!isAllDay && (
              <div className="space-y-1">
                <Label htmlFor="event-start-time">
                  {t("eventDialog.startTime")}
                </Label>
                <Input
                  id="event-start-time"
                  type="time"
                  {...form.register("start_time")}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="event-end-date">
                {t("eventDialog.date")}
              </Label>
              <Input
                id="event-end-date"
                type="date"
                {...form.register("end_date")}
              />
            </div>
            {!isAllDay && (
              <div className="space-y-1">
                <Label htmlFor="event-end-time">
                  {t("eventDialog.endTime")}
                </Label>
                <Input
                  id="event-end-time"
                  type="time"
                  {...form.register("end_time")}
                />
              </div>
            )}
          </div>

          {/* Location */}
          <div className="space-y-1">
            <Label htmlFor="event-location">
              {t("eventDialog.location")}
            </Label>
            <Input
              id="event-location"
              placeholder={t("eventDialog.locationPlaceholder")}
              {...form.register("location")}
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="event-description">
              {t("eventDialog.description")}
            </Label>
            <textarea
              id="event-description"
              placeholder={t("eventDialog.descriptionPlaceholder")}
              className="min-h-[80px] w-full resize-none rounded-md border border-input bg-background p-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...form.register("description")}
            />
          </div>

          {/* Color */}
          <div className="space-y-1">
            <Label>{t("eventDialog.color")}</Label>
            <div className="flex gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    form.watch("color") === preset.value
                      ? "border-primary scale-110"
                      : "border-border"
                  }`}
                  style={{
                    backgroundColor: preset.value
                      ? `hsl(var(--calendar-${preset.value === "teal" ? "event" : preset.value}))`
                      : "hsl(var(--calendar-event))",
                  }}
                  onClick={() => form.setValue("color", preset.value)}
                  title={preset.label}
                />
              ))}
            </div>
          </div>

          {/* Recurrence placeholder */}
          <div className="space-y-1">
            <Label className="text-muted-foreground">
              {t("eventDialog.recurrence")}
            </Label>
            <p className="text-sm text-muted-foreground">None</p>
          </div>

          {/* Error */}
          {form.formState.errors.root && (
            <p className="text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <div>
              {isEditing && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                >
                  {t("eventDialog.delete")}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={saving}
              >
                {t("eventDialog.cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={saving || deleting}>
                {t("eventDialog.save")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getDefaults(
  event: ExpandedCalendarEvent | null | undefined,
  prefill: EventDialogProps["prefill"],
  todayStr: string,
): FormValues {
  return {
    title: event?.title || prefill?.title || "",
    start_date: event?.start_date || prefill?.date || todayStr,
    start_time: event?.start_time?.slice(0, 5) || prefill?.startTime || "",
    end_date: event?.end_date || prefill?.date || todayStr,
    end_time: event?.end_time?.slice(0, 5) || prefill?.endTime || "",
    is_all_day: event ? event.start_time === null : false,
    location: event?.location || "",
    description: event?.description || "",
    color: event?.color || "",
  };
}
